import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName, saClient, uid } from "./setup";

/**
 * Migration 00116: photos the agent supplies on a change request go private
 * (P1-b-2, owner decision 11 Nov 2026).
 *
 *   · only the listing's agent, only on an open or answered photo request,
 *     only for a file in their own intake folder whose name carries the
 *     content hash — another agent, the moderator and anon are refused;
 *   · the photo is pending and private, with provenance "agent_upload:request:<id>";
 *   · the request becomes answered; a resend is a no-op; a closed request takes none;
 *   · it never appears in the public views until published.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("request photos (00116)", () => {
  let service: SupabaseClient;
  let mod: SupabaseClient;
  let owner: SupabaseClient;
  let ownerId = "";
  let other: SupabaseClient;
  let otherId = "";
  const users: string[] = [];
  const grants: string[] = [];
  const props: string[] = [];
  const listings: string[] = [];
  let listingId = "";
  let photoReq = "";
  let correctionReq = "";
  let seq = 0;
  const hash = createHash("sha256").update(`p1b2-${Date.now()}`).digest("hex");
  const path = () => `${ownerId}/${listingId}/src-${hash.slice(0, 16)}.jpg`;
  const args = (over: Record<string, unknown> = {}) => ({
    p_request: photoReq, p_storage_path: path(), p_content_hash: hash, p_byte_size: 120000, p_width: 1600, p_height: 1200, p_note: "Here is the original.", ...over,
  });

  async function person(tag: string) {
    const email = fixtureEmail(`p1b2-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p1b2 ${tag}`), agent_status: "verified", country_code: "MY" });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    mod = await saClient();
    const { data: r } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data: g, error } = await service.from("user_roles").insert({ user_id: await uid(mod), role_id: r!.id, country_codes: ["MY"] }).select("id").single();
    if (error) throw new Error(error.message);
    grants.push(g!.id);
    const o = await person("owner"); owner = o.c; ownerId = o.id;
    const x = await person("other"); other = x.c; otherId = x.id;
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({ human_readable_id: hp, agent_id: ownerId, country_code: "MY", property_category: "residential", property_type: "terrace", measurement_unit: "sqft", created_by: ownerId }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l } = await service.from("listings").insert({ human_readable_id: hl, property_id: p!.id, agent_id: ownerId, listing_type: "sale", status: "pending_review", moderation_state: "pending", currency: "MYR", price: 1000, language: "en", title: fixtureName("p1b2"), slug: `fixture-p1b2-${p!.id.slice(0, 8)}`, created_by: ownerId }).select("id").single();
    listingId = l!.id; listings.push(listingId);
    photoReq = ((await mod.rpc("admin_request_change", { p_listing: listingId, p_kind: "photo_original", p_field: "photos", p_body: "Please send the original of photo 2." })).data as { id: string }).id;
    correctionReq = ((await mod.rpc("admin_request_change", { p_listing: listingId, p_kind: "correction", p_field: "price", p_body: "Check the price." })).data as { id: string }).id;
  });

  afterAll(async () => {
    if (!service) return;
    for (const l of listings) {
      await service.from("listing_media_source").delete().eq("listing_id", l);
      await service.from("listing_media").delete().eq("listing_id", l);
      await service.from("listing_change_requests").delete().eq("listing_id", l);
      await service.from("listings").delete().eq("id", l);
    }
    for (const p of props) await service.from("properties").delete().eq("id", p);
    for (const u of users) await service.auth.admin.deleteUser(u);
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
  });

  it("another agent, the moderator and anon cannot attach", async () => {
    expect((await other.rpc("agent_attach_request_photo", args({ p_storage_path: `${otherId}/${listingId}/src-${hash.slice(0, 16)}.jpg` }))).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await mod.rpc("agent_attach_request_photo", args())).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await anonClient().rpc("agent_attach_request_photo", args())).error).not.toBeNull();
    expect((await service.from("listing_media").select("id").eq("listing_id", listingId)).data ?? []).toHaveLength(0);
  });

  it("refuses a correction request, a foreign folder, and a name that does not match the content", async () => {
    expect((await owner.rpc("agent_attach_request_photo", args({ p_request: correctionReq }))).data).toMatchObject({ ok: false, error: "not_photo_request" });
    expect((await owner.rpc("agent_attach_request_photo", args({ p_storage_path: `${otherId}/${listingId}/src-${hash.slice(0, 16)}.jpg` }))).data).toMatchObject({ ok: false, error: "bad_path" });
    expect((await owner.rpc("agent_attach_request_photo", args({ p_storage_path: `${ownerId}/${listingId}/src-0000000000000000.jpg` }))).data).toMatchObject({ ok: false, error: "bad_hash" });
  });

  it("the agent's photo is private and pending, with provenance, and answers the request", async () => {
    const { data } = await owner.rpc("agent_attach_request_photo", args());
    expect(data).toMatchObject({ ok: true, created: true });
    const mediaId = (data as { media_id: string }).media_id;
    const { data: m } = await service.from("listing_media").select("processing_state, storage_path").eq("id", mediaId).single();
    expect(m).toMatchObject({ processing_state: "pending", storage_path: `listing-media-intake/${path()}` });
    const { data: src } = await service.from("listing_media_source").select("licence_note, page_url").eq("media_id", mediaId).single();
    expect(src).toMatchObject({ licence_note: `agent_upload:request:${photoReq}`, page_url: `change-request:${photoReq}` });
    const { data: rq } = await service.from("listing_change_requests").select("status, answer").eq("id", photoReq).single();
    expect(rq).toMatchObject({ status: "answered", answer: "Here is the original." });
    expect((await service.from("public_listing_media").select("id").eq("id", mediaId)).data ?? []).toHaveLength(0);
    // Resending the same file stores nothing new.
    expect((await owner.rpc("agent_attach_request_photo", args())).data).toMatchObject({ ok: true, created: false, media_id: mediaId });
    const { data: audit } = await service.from("audit_logs").select("action").eq("entity_id", listingId).eq("action", "listing.change_photo_supplied");
    expect((audit ?? []).length).toBe(1);
  });

  it("a closed request takes no photo", async () => {
    await mod.rpc("admin_close_change", { p_request: photoReq, p_outcome: "resolved" });
    const h2 = createHash("sha256").update(`p1b2-b-${Date.now()}`).digest("hex");
    const { data } = await owner.rpc("agent_attach_request_photo", args({ p_content_hash: h2, p_storage_path: `${ownerId}/${listingId}/src-${h2.slice(0, 16)}.jpg` }));
    expect(data).toMatchObject({ ok: false, error: "closed" });
  });
});
