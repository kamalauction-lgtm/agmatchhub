import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Migration 00113: partner-feed photos (D6, P0-e-3b).
 *
 *   · only the service role (the ingest route) may attach a partner photo —
 *     the listing's own agent and anon are refused (negative tests);
 *   · only for an `api`-created listing, only inside that listing's agent's
 *     intake folder, only with a partner agreement reference;
 *   · the photo is private and `pending`, its provenance records the
 *     agreement, the first one becomes the cover;
 *   · a re-sent photo, or one the agent removed (00112), is not stored again.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hash = (c: string) => c.repeat(64).slice(0, 64);

describe.skipIf(!hasEnv || !SERVICE)("partner-feed photos (00113)", () => {
  let service: SupabaseClient;
  let agent: SupabaseClient;
  let agentId = "";
  let apiListing = "";
  let manualListing = "";
  const props: string[] = [];

  const args = (over: Record<string, unknown> = {}) => ({
    p_listing: apiListing,
    p_storage_path: `${agentId}/${apiListing}/src-${hash("a").slice(0, 16)}.jpg`,
    p_content_hash: hash("a"),
    p_image_url: "https://partner.example.test/photo-a.jpg",
    p_page_url: "",
    p_agreement_ref: "STAGING-TEST-AGREEMENT",
    p_byte_size: 1234, p_width: 640, p_height: 480,
    ...over,
  });

  async function listing(source: "api" | "manual") {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({
      human_readable_id: hp, agent_id: agentId, country_code: "MY", property_category: "residential",
      property_type: "terrace", measurement_unit: "sqft", created_by: agentId,
    }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l, error } = await service.from("listings").insert({
      human_readable_id: hl, property_id: p!.id, agent_id: agentId, listing_type: "sale", status: "draft", moderation_state: "pending",
      currency: "MYR", price: 1000, language: "en", title: fixtureName(`partner ${source}`), slug: `fixture-partner-${p!.id.slice(0, 8)}`,
      creation_source: source, created_by: agentId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return l!.id as string;
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    const email = fixtureEmail(`partner-${Date.now()}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data: u } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    agentId = u!.user!.id;
    await service.from("profiles").upsert({ id: agentId, display_name: fixtureName("partner"), agent_status: "verified", country_code: "MY" });
    agent = createClient(URL_, ANON, { auth: { persistSession: false } });
    await agent.auth.signInWithPassword({ email, password });
    apiListing = await listing("api");
    manualListing = await listing("manual");
  });

  afterAll(async () => {
    if (!service) return;
    for (const l of [apiListing, manualListing].filter(Boolean)) {
      await service.from("listing_media_source").delete().eq("listing_id", l);
      await service.from("listing_media").delete().eq("listing_id", l);
      await service.from("listings").delete().eq("id", l);
    }
    for (const p of props) await service.from("properties").delete().eq("id", p);
    if (agentId) await service.auth.admin.deleteUser(agentId);
  });

  it("the listing's own agent and anon cannot attach a partner photo", async () => {
    const { error: a } = await agent.rpc("attach_partner_photo", args());
    expect(a).not.toBeNull();
    const { error: n } = await anonClient().rpc("attach_partner_photo", args());
    expect(n).not.toBeNull();
    const { data } = await service.from("listing_media").select("id").eq("listing_id", apiListing);
    expect(data ?? []).toHaveLength(0);
  });

  it("refuses a non-partner listing, a foreign folder, a bad hash and a missing agreement", async () => {
    const bad = [
      args({ p_listing: manualListing, p_storage_path: `${agentId}/${manualListing}/src-${hash("a").slice(0, 16)}.jpg` }),
      args({ p_storage_path: `00000000-0000-4000-8000-000000000000/${apiListing}/src-${hash("a").slice(0, 16)}.jpg` }),
      args({ p_storage_path: `${agentId}/${apiListing}/../x.jpg` }),
      args({ p_content_hash: "not-a-hash" }),
      args({ p_agreement_ref: "   " }),
    ];
    for (const b of bad) {
      const { error } = await service.rpc("attach_partner_photo", b);
      expect(error, JSON.stringify(b).slice(0, 120)).not.toBeNull();
    }
  });

  it("the service stores a private pending photo, records the agreement and makes it the cover", async () => {
    const { data, error } = await service.rpc("attach_partner_photo", args());
    expect(error).toBeNull();
    expect(data).toMatchObject({ created: true });
    const { data: m } = await service.from("listing_media").select("*").eq("id", (data as { media_id: string }).media_id).single();
    expect(m).toMatchObject({ processing_state: "pending", is_cover: true });
    expect(m!.storage_path).toBe(`listing-media-intake/${agentId}/${apiListing}/src-${hash("a").slice(0, 16)}.jpg`);
    const { data: src } = await service.from("listing_media_source").select("licence_note, consent_record_id, page_url").eq("media_id", m!.id).single();
    expect(src).toMatchObject({ licence_note: "partner_agreement:STAGING-TEST-AGREEMENT", consent_record_id: null, page_url: "https://partner.example.test/photo-a.jpg" });
    const { data: pub } = await service.from("public_listing_media").select("id").eq("id", m!.id);
    expect(pub ?? []).toHaveLength(0);
  });

  it("a second photo is not the cover; a re-sent photo is not stored twice", async () => {
    const b = args({ p_content_hash: hash("b"), p_storage_path: `${agentId}/${apiListing}/src-${hash("b").slice(0, 16)}.jpg` });
    const { data: second } = await service.rpc("attach_partner_photo", b);
    expect(second).toMatchObject({ created: true });
    const { data: again } = await service.rpc("attach_partner_photo", b);
    expect(again).toMatchObject({ created: false });
    const { data: rows } = await service.from("listing_media").select("id, is_cover").eq("listing_id", apiListing);
    expect(rows ?? []).toHaveLength(2);
    expect((rows ?? []).filter((r) => r.is_cover)).toHaveLength(1);
  });

  it("a photo the agent removed is not re-imported when the partner sends it again", async () => {
    const { data: rows } = await service.from("listing_media").select("id, is_cover").eq("listing_id", apiListing).eq("is_cover", false);
    const target = rows![0].id;
    const { data: removed } = await agent.rpc("listing_media_remove", { p_media: target });
    expect(removed).toMatchObject({ ok: true, kept_as_evidence: true });
    const { data: again } = await service.rpc("attach_partner_photo", args({ p_content_hash: hash("b"), p_storage_path: `${agentId}/${apiListing}/src-${hash("b").slice(0, 16)}.jpg` }));
    expect(again).toMatchObject({ created: false, media_id: target });
    const { data: still } = await service.from("listing_media").select("processing_state").eq("id", target).single();
    expect(still?.processing_state).toBe("removed");
  });
});
