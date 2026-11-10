import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, anonClient, raClient, laClient, uid, hasEnv, hasPairEnv, fixtureName } from "./setup";

/**
 * The marketplace inquiry path, end to end, as the public site calls it.
 *
 * apps/www holds no service key: a buyer's question reaches an agent only
 * through `submit_public_inquiry` (00033), a SECURITY DEFINER function the
 * anon role may execute. What has to hold:
 *
 *   1. a valid inquiry on a published listing creates a lead for THAT
 *      listing's agent and returns only a reference;
 *   2. the public caller can read nothing back — not the lead, not the contact;
 *   3. the listing's agent sees the lead; an unrelated agent does not;
 *   4. no consent, no listing, or too many attempts from one phone → refused.
 *
 * The listing is the staging scenario's published LA listing (LST-2026-900001).
 * Every row this suite causes is deleted in afterAll by id.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SLUG = "rumah-4-kamar-cilandak-barat-900001";

describe.skipIf(!hasEnv || !hasPairEnv || !SERVICE)("public marketplace inquiry", () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;
  let consentId: string;
  // A phone number unique to this run, so the rate limit is this run's alone.
  const phone = `+62812${String(Date.now()).slice(-8)}`;
  const leadRefs: string[] = [];

  const submit = (over: Record<string, unknown> = {}) =>
    anon.rpc("submit_public_inquiry", {
      p_listing_slug: SLUG,
      p_full_name: fixtureName("inquiry buyer"),
      p_phone: phone,
      p_email: null,
      p_message: "Masih tersedia? (staging test)",
      p_inquiry_type: "viewing_request",
      p_locale: "id",
      p_consent_version_id: consentId,
      p_ip_hash: null,
      ...over,
    });

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    anon = anonClient();
    const { data } = await anon.from("public_active_declarations").select("version_id, locale").eq("key", "buyer_inquiry");
    const row = (data ?? []).find((r) => r.locale === "id") ?? data?.[0];
    if (!row) throw new Error("no active buyer_inquiry consent text on this database");
    consentId = row.version_id;
  });

  afterAll(async () => {
    if (!service) return;
    const { data: leads } = await service.from("leads").select("id, contact_id, consent_record_id").in("human_readable_id", leadRefs);
    for (const l of leads ?? []) {
      await service.from("lead_events").delete().eq("lead_id", l.id);
      await service.from("leads").delete().eq("id", l.id);
      if (l.consent_record_id) await service.from("consent_records").delete().eq("id", l.consent_record_id);
    }
    for (const ref of leadRefs) await service.from("notifications").delete().eq("kind", "lead.new").contains("payload", { lead: ref });
    await service.from("contacts").delete().eq("phone", phone);
    await service.from("inquiry_rate_limits").delete().eq("bucket", `phone:${phone}`);
  });

  it("a valid inquiry on a published listing returns only a lead reference", async () => {
    const { data, error } = await submit();
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(String(data.lead_ref)).toMatch(/^LEAD-/);
    expect(Object.keys(data).sort()).toEqual(["lead_ref", "ok"]);   // nothing about the agent
    leadRefs.push(data.lead_ref);
  });

  it("the public caller cannot read the lead or the contact back", async () => {
    const { data: leads } = await anon.from("leads").select("id").in("human_readable_id", leadRefs);
    expect(leads ?? []).toHaveLength(0);
    const { data: contacts } = await anon.from("contacts").select("id").eq("phone", phone);
    expect(contacts ?? []).toHaveLength(0);
  });

  it("the lead belongs to the listing's agent, who can see it", async () => {
    const la = await laClient();
    const { data } = await la.from("leads").select("human_readable_id, agent_id, status").in("human_readable_id", leadRefs);
    expect(data ?? []).toHaveLength(1);
    expect(data![0].agent_id).toBe(await uid(la));
    expect(data![0].status).toBe("new");
  });

  it("an unrelated agent cannot see it", async () => {
    const ra = await raClient();
    const { data } = await ra.from("leads").select("id").in("human_readable_id", leadRefs);
    expect(data ?? []).toHaveLength(0);
  });

  it("no consent version → refused, nothing created", async () => {
    const { data } = await submit({ p_consent_version_id: "00000000-0000-4000-8000-000000000000" });
    expect(data.ok).toBe(false);
    expect(data.error).toBe("consent_required");
  });

  it("an unknown or unpublished listing → refused", async () => {
    const { data } = await submit({ p_listing_slug: "no-such-listing-900999" });
    expect(data.ok).toBe(false);
    expect(data.error).toBe("listing_not_found");
  });

  it("one phone is limited to five inquiries an hour", async () => {
    // One already sent above; four more succeed, the sixth is refused.
    for (let i = 0; i < 4; i++) {
      const { data } = await submit();
      expect(data.ok).toBe(true);
      leadRefs.push(data.lead_ref);
    }
    const { data } = await submit();
    expect(data.ok).toBe(false);
    expect(data.error).toBe("rate_limited");
  });
});
