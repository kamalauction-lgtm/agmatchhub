import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, anonClient, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Migration 00111 (D8, P0-d-1b): a buyer's inquiry consent is recorded in the
 * inquired listing's own country.
 *
 * Before 00111, `submit_public_inquiry` stamped every buyer_inquiry consent
 * with country_code 'ID', so a consent given on a Malaysian listing was filed
 * as Indonesian. Both markets are checked through the anon role, as www calls
 * it:
 *
 *   · an inquiry on a published MY listing → consent country MY;
 *   · an inquiry on the standing published ID listing → still ID.
 *
 * The MY listing is a fixture published by the service role and deleted in
 * afterAll with every row the inquiries caused.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ID_SLUG = "rumah-4-kamar-cilandak-barat-900001";

describe.skipIf(!hasEnv || !SERVICE)("inquiry consent country (00111)", () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;
  let consentId: string;
  let agentId = "";
  let propertyId = "";
  let listingId = "";
  let mySlug = "";
  const phone = `+60123${String(Date.now()).slice(-7)}`;
  const leadRefs: string[] = [];

  const submit = (slug: string) =>
    anon.rpc("submit_public_inquiry", {
      p_listing_slug: slug,
      p_full_name: fixtureName("inquiry country"),
      p_phone: phone,
      p_email: null,
      p_message: "Still available? (staging test)",
      p_inquiry_type: "viewing_request",
      p_locale: "en",
      p_consent_version_id: consentId,
      p_ip_hash: null,
    });

  const consentCountry = async (ref: string) => {
    const { data: lead } = await service.from("leads").select("consent_record_id").eq("human_readable_id", ref).single();
    const { data: c } = await service.from("consent_records").select("country_code").eq("id", lead!.consent_record_id).single();
    return c!.country_code as string;
  };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    anon = anonClient();
    const { data } = await anon.from("public_active_declarations").select("version_id, locale").eq("key", "buyer_inquiry");
    const row = (data ?? []).find((r) => r.locale === "en") ?? data?.[0];
    if (!row) throw new Error("no active buyer_inquiry consent text on this database");
    consentId = row.version_id;

    const { data: u, error } = await service.auth.admin.createUser({
      email: fixtureEmail(`p0d1b-${Date.now()}`),
      password: `Fx!${randomBytes(9).toString("base64url")}`,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    agentId = u.user.id;
    await service.from("profiles").upsert({ id: agentId, display_name: fixtureName("p0d1b"), agent_status: "verified", country_code: "MY" });

    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p, error: pErr } = await service.from("properties").insert({
      human_readable_id: hp, agent_id: agentId, country_code: "MY", property_category: "residential",
      property_type: "terrace", measurement_unit: "sqft", created_by: agentId,
    }).select("id").single();
    if (pErr) throw new Error(pErr.message);
    propertyId = p!.id;
    mySlug = `fixture-p0d1b-${propertyId.slice(0, 8)}`;
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l, error: lErr } = await service.from("listings").insert({
      human_readable_id: hl, property_id: propertyId, agent_id: agentId, listing_type: "sale",
      status: "published", moderation_state: "approved", published_at: new Date().toISOString(),
      currency: "MYR", price: 650000, language: "en", title: fixtureName("p0d1b MY listing"),
      slug: mySlug, created_by: agentId,
    }).select("id").single();
    if (lErr) throw new Error(lErr.message);
    listingId = l!.id;
  });

  afterAll(async () => {
    if (!service) return;
    const { data: leads } = await service.from("leads").select("id, consent_record_id").in("human_readable_id", leadRefs);
    for (const l of leads ?? []) {
      await service.from("lead_events").delete().eq("lead_id", l.id);
      await service.from("leads").delete().eq("id", l.id);
      if (l.consent_record_id) await service.from("consent_records").delete().eq("id", l.consent_record_id);
    }
    for (const ref of leadRefs) await service.from("notifications").delete().eq("kind", "lead.new").contains("payload", { lead: ref });
    await service.from("contacts").delete().eq("phone", phone);
    await service.from("inquiry_rate_limits").delete().eq("bucket", `phone:${phone}`);
    if (listingId) {
      await service.from("listing_status_history").delete().eq("listing_id", listingId);
      await service.from("listings").delete().eq("id", listingId);
    }
    if (propertyId) await service.from("properties").delete().eq("id", propertyId);
    if (agentId) await service.auth.admin.deleteUser(agentId);
  });

  it("an inquiry on a Malaysian listing records the consent as MY", async () => {
    const { data, error } = await submit(mySlug);
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    leadRefs.push(data.lead_ref);
    expect(await consentCountry(data.lead_ref)).toBe("MY");
  });

  it("an inquiry on an Indonesian listing still records ID", async () => {
    const { data, error } = await submit(ID_SLUG);
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    leadRefs.push(data.lead_ref);
    expect(await consentCountry(data.lead_ref)).toBe("ID");
  });
});
