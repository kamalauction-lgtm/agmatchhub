import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName, saClient } from "./setup";

/**
 * Migration 00117: the listing wizard's photos go private (P1-b-3, owner
 * decision 11 Nov 2026).
 *
 *   · only the listing's agent, only while the listing is a draft or awaiting
 *     review, only for a file in their own intake folder whose name carries
 *     the content hash — another agent, an admin and anon are refused;
 *   · the photo is pending and private, provenance "agent_upload:wizard";
 *   · the same file twice is one photo; a live listing takes none.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("wizard photos (00117)", () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let owner: SupabaseClient;
  let ownerId = "";
  let other: SupabaseClient;
  let otherId = "";
  const users: string[] = [];
  const props: string[] = [];
  const listings: string[] = [];
  let pendingId = "";
  let liveId = "";
  let seq = 0;
  const h = (tag: string) => createHash("sha256").update(`p1b3-${tag}-${Date.now()}`).digest("hex");
  const hash = h("a");
  const args = (listing: string, over: Record<string, unknown> = {}) => ({
    p_listing: listing, p_storage_path: `${ownerId}/${listing}/src-${hash.slice(0, 16)}.jpg`, p_content_hash: hash,
    p_byte_size: 120000, p_width: 1600, p_height: 1200, ...over,
  });

  async function person(tag: string) {
    const email = fixtureEmail(`p1b3-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p1b3 ${tag}`), agent_status: "verified", country_code: "MY" });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }

  async function listing(status: "pending_review" | "published") {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({ human_readable_id: hp, agent_id: ownerId, country_code: "MY", property_category: "residential", property_type: "terrace", measurement_unit: "sqft", created_by: ownerId }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l, error } = await service.from("listings").insert({ human_readable_id: hl, property_id: p!.id, agent_id: ownerId, listing_type: "sale", status: "pending_review", moderation_state: "pending", currency: "MYR", price: 1000, language: "en", title: fixtureName("p1b3"), slug: `fixture-p1b3-${p!.id.slice(0, 8)}`, created_by: ownerId }).select("id").single();
    if (error) throw new Error(error.message);
    listings.push(l!.id);
    if (status === "published") {
      const { error: e2 } = await service.from("listings").update({ status: "published", moderation_state: "approved", published_at: new Date().toISOString() }).eq("id", l!.id);
      if (e2) throw new Error(e2.message);
    }
    return l!.id as string;
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    admin = await saClient();
    const o = await person("owner"); owner = o.c; ownerId = o.id;
    const x = await person("other"); other = x.c; otherId = x.id;
    pendingId = await listing("pending_review");
    liveId = await listing("published");
  });

  afterAll(async () => {
    if (!service) return;
    for (const l of listings) {
      await service.from("listing_media_source").delete().eq("listing_id", l);
      await service.from("listing_media").delete().eq("listing_id", l);
      await service.from("listings").delete().eq("id", l);
    }
    for (const p of props) await service.from("properties").delete().eq("id", p);
    for (const u of users) await service.auth.admin.deleteUser(u);
  });

  it("another agent, an admin and anon cannot attach", async () => {
    expect((await other.rpc("agent_attach_listing_photo", args(pendingId, { p_storage_path: `${otherId}/${pendingId}/src-${hash.slice(0, 16)}.jpg` }))).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await admin.rpc("agent_attach_listing_photo", args(pendingId))).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await anonClient().rpc("agent_attach_listing_photo", args(pendingId))).error).not.toBeNull();
    expect((await service.from("listing_media").select("id").eq("listing_id", pendingId)).data ?? []).toHaveLength(0);
  });

  it("refuses a foreign folder, a name that does not match the content, and a live listing", async () => {
    expect((await owner.rpc("agent_attach_listing_photo", args(pendingId, { p_storage_path: `${otherId}/${pendingId}/src-${hash.slice(0, 16)}.jpg` }))).data).toMatchObject({ ok: false, error: "bad_path" });
    expect((await owner.rpc("agent_attach_listing_photo", args(pendingId, { p_storage_path: `${ownerId}/${pendingId}/src-0000000000000000.jpg` }))).data).toMatchObject({ ok: false, error: "bad_hash" });
    expect((await owner.rpc("agent_attach_listing_photo", args(liveId, { p_storage_path: `${ownerId}/${liveId}/src-${hash.slice(0, 16)}.jpg` }))).data).toMatchObject({ ok: false, error: "not_editable" });
  });

  it("the agent's photo is private and pending, with provenance; the same file twice is one photo", async () => {
    const { data } = await owner.rpc("agent_attach_listing_photo", args(pendingId));
    expect(data).toMatchObject({ ok: true, created: true });
    const mediaId = (data as { media_id: string }).media_id;
    const { data: m } = await service.from("listing_media").select("processing_state, storage_path, is_cover").eq("id", mediaId).single();
    expect(m).toMatchObject({ processing_state: "pending", storage_path: `listing-media-intake/${ownerId}/${pendingId}/src-${hash.slice(0, 16)}.jpg`, is_cover: true });
    const { data: src } = await service.from("listing_media_source").select("licence_note, page_url").eq("media_id", mediaId).single();
    expect(src).toMatchObject({ licence_note: "agent_upload:wizard", page_url: "wizard" });
    expect((await service.from("public_listing_media").select("id").eq("id", mediaId)).data ?? []).toHaveLength(0);
    expect((await owner.rpc("agent_attach_listing_photo", args(pendingId))).data).toMatchObject({ ok: true, created: false, media_id: mediaId });
    const h2 = h("b");
    const second = await owner.rpc("agent_attach_listing_photo", args(pendingId, { p_content_hash: h2, p_storage_path: `${ownerId}/${pendingId}/src-${h2.slice(0, 16)}.png` }));
    expect(second.data).toMatchObject({ ok: true, created: true });
    const { data: m2 } = await service.from("listing_media").select("is_cover, position").eq("id", (second.data as { media_id: string }).media_id).single();
    expect(m2).toMatchObject({ is_cover: false, position: 1 });
  });

  it("the agent still cannot write intake rows directly", async () => {
    const { error } = await owner.from("listing_media").insert({ listing_id: pendingId, kind: "image", storage_path: `listing-media-intake/${ownerId}/${pendingId}/src-ffffffffffffffff.jpg`, position: 9, processing_state: "processed" });
    expect(error).not.toBeNull();
  });
});
