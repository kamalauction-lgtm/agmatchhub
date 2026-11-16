import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Migration 00112: the agent's gallery editor (P0-e-3a).
 *
 *   · only the listing's owner can set the cover, reorder or remove — another
 *     agent and anon are refused, and nothing changes;
 *   · failed, kept-out or removed photos are never the cover; on a published
 *     listing the cover must already be public;
 *   · a reorder must name exactly the listing's photos;
 *   · removing a wizard photo deletes it and returns its public files;
 *     removing an IMPORTED photo keeps the row as 'removed' and keeps its
 *     provenance — it is never shown, processed or counted again;
 *   · the intake guard still stops an agent setting 'removed' (or anything
 *     else) on an imported photo directly;
 *   · every change is audited.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("listing gallery editor (00112)", () => {
  let service: SupabaseClient;
  let owner: SupabaseClient;
  let other: SupabaseClient;
  const users: string[] = [];
  let ownerId = "";
  let draftId = "";
  let pubId = "";
  const props: string[] = [];
  const m: Record<string, string> = {};

  async function agent(tag: string) {
    const email = fixtureEmail(`gallery-${tag}-${Date.now()}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`gallery ${tag}`), agent_status: "verified", country_code: "MY" });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }
  async function listing(status: "draft" | "published") {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({
      human_readable_id: hp, agent_id: ownerId, country_code: "MY", property_category: "residential",
      property_type: "terrace", measurement_unit: "sqft", created_by: ownerId,
    }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l, error } = await service.from("listings").insert({
      human_readable_id: hl, property_id: p!.id, agent_id: ownerId, listing_type: "sale", status,
      moderation_state: status === "published" ? "approved" : "pending", published_at: status === "published" ? new Date().toISOString() : null,
      currency: "MYR", price: 1000, language: "en", title: fixtureName(`gallery ${status}`),
      slug: `fixture-gallery-${p!.id.slice(0, 8)}`, created_by: ownerId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return l!.id as string;
  }
  async function media(key: string, listingId: string, fields: Record<string, unknown>) {
    const { data, error } = await service.from("listing_media").insert({
      listing_id: listingId, kind: "image", byte_size: 1000, ...fields,
    }).select("id").single();
    if (error) throw new Error(`${key}: ${error.message}`);
    m[key] = data!.id;
  }
  const row = async (key: string) => (await service.from("listing_media").select("*").eq("id", m[key]).maybeSingle()).data;
  const covers = async (listingId: string) =>
    ((await service.from("listing_media").select("id").eq("listing_id", listingId).eq("is_cover", true)).data ?? []).map((r) => r.id);

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    const o = await agent("owner");
    ownerId = o.id; owner = o.c;
    other = (await agent("other")).c;

    draftId = await listing("draft");
    const pub = `listing-media-public/${ownerId}/${draftId}`;
    const intake = `listing-media-intake/${ownerId}/${draftId}`;
    await media("wizA", draftId, { storage_path: `${pub}/0-a.jpg`, processed_path: `${pub}/0-a.jpg`, thumbnail_path: `${pub}/0-a.jpg`, processing_state: "ready", position: 0, is_cover: true });
    await media("wizB", draftId, { storage_path: `${pub}/1-b.jpg`, processed_path: `${pub}/1-b.jpg`, thumbnail_path: `${pub}/1-b.jpg`, processing_state: "ready", position: 1 });
    await media("imported", draftId, { storage_path: `${intake}/src-aaaa.jpg`, processing_state: "processed", derived_path: `${intake}/derived-x-1600.webp`, derived_thumb_path: `${intake}/derived-x-400.webp`, position: 2 });
    await media("failed", draftId, { storage_path: `${intake}/src-bbbb.jpg`, processing_state: "failed", position: 3 });
    await media("kept", draftId, { storage_path: `${intake}/src-cccc.jpg`, processing_state: "quarantined", position: 4 });
    const { error: srcErr } = await service.from("listing_media_source").insert({
      media_id: m.imported, listing_id: draftId, page_url: "https://example.test/listing", image_url: "https://example.test/a.jpg",
      content_hash: "a".repeat(64), licence_note: "fixture",
    });
    if (srcErr) throw new Error(srcErr.message);

    pubId = await listing("published");
    await media("pubReady", pubId, { storage_path: `listing-media-public/${ownerId}/${pubId}/0.jpg`, processed_path: `listing-media-public/${ownerId}/${pubId}/0.jpg`, processing_state: "ready", position: 0, is_cover: true });
    await media("pubPending", pubId, { storage_path: `listing-media-intake/${ownerId}/${pubId}/src-dddd.jpg`, processing_state: "pending", position: 1 });
    await media("pubReady2", pubId, { storage_path: `listing-media-public/${ownerId}/${pubId}/2.jpg`, processed_path: `listing-media-public/${ownerId}/${pubId}/2.jpg`, processing_state: "ready", position: 2 });
  });

  afterAll(async () => {
    if (!service) return;
    for (const l of [draftId, pubId].filter(Boolean)) {
      await service.from("listing_media_source").delete().eq("listing_id", l);
      await service.from("listing_media").delete().eq("listing_id", l);
      await service.from("listing_status_history").delete().eq("listing_id", l);
      await service.from("listings").delete().eq("id", l);
    }
    for (const p of props) await service.from("properties").delete().eq("id", p);
    for (const u of users) await service.auth.admin.deleteUser(u);
  });

  it("another agent and anon cannot touch the gallery, and nothing changes", async () => {
    for (const [fn, args] of [
      ["listing_media_set_cover", { p_media: m.wizB }],
      ["listing_media_reorder", { p_listing: draftId, p_ids: [m.wizB, m.wizA, m.imported, m.failed, m.kept] }],
      ["listing_media_remove", { p_media: m.wizB }],
    ] as const) {
      const { data } = await other.rpc(fn, args);
      expect(data, fn).toMatchObject({ ok: false, error: "not_found" });
      const { error } = await anonClient().rpc(fn, args);
      expect(error, `anon ${fn}`).not.toBeNull();
    }
    expect(await covers(draftId)).toEqual([m.wizA]);
    expect((await row("wizB"))?.position).toBe(1);
  });

  it("the owner sets the cover: exactly one cover, audited", async () => {
    const { data } = await owner.rpc("listing_media_set_cover", { p_media: m.imported });
    expect(data).toMatchObject({ ok: true });
    expect(await covers(draftId)).toEqual([m.imported]);
    const { data: audit } = await service.from("audit_logs").select("action").eq("entity_id", draftId).eq("action", "listing_media.cover_set");
    expect((audit ?? []).length).toBeGreaterThan(0);
  });

  it("failed and kept-out photos are never the cover", async () => {
    for (const k of ["failed", "kept"]) {
      const { data } = await owner.rpc("listing_media_set_cover", { p_media: m[k] });
      expect(data, k).toMatchObject({ ok: false, error: "not_eligible" });
    }
    expect(await covers(draftId)).toEqual([m.imported]);
  });

  it("on a published listing the cover must already be public", async () => {
    const { data: refused } = await owner.rpc("listing_media_set_cover", { p_media: m.pubPending });
    expect(refused).toMatchObject({ ok: false, error: "not_public_yet" });
    const { data: ok } = await owner.rpc("listing_media_set_cover", { p_media: m.pubReady2 });
    expect(ok).toMatchObject({ ok: true });
    expect(await covers(pubId)).toEqual([m.pubReady2]);
  });

  it("a reorder must name exactly the listing's photos", async () => {
    const bad = [
      [m.wizA, m.wizB],                                                // missing
      [m.wizA, m.wizB, m.imported, m.failed, m.kept, m.pubReady],      // another listing's photo
      [m.wizA, m.wizA, m.imported, m.failed, m.kept],                  // duplicate
    ];
    for (const ids of bad) {
      const { data } = await owner.rpc("listing_media_reorder", { p_listing: draftId, p_ids: ids });
      expect(data).toMatchObject({ ok: false, error: "bad_order" });
    }
    const order = [m.kept, m.wizB, m.imported, m.wizA, m.failed];
    const { data } = await owner.rpc("listing_media_reorder", { p_listing: draftId, p_ids: order });
    expect(data).toMatchObject({ ok: true });
    const { data: rows } = await service.from("listing_media").select("id, position").eq("listing_id", draftId).order("position");
    expect(rows!.map((r) => r.id)).toEqual(order);
  });

  it("removing a wizard photo deletes it and returns its public file", async () => {
    const { data } = await owner.rpc("listing_media_remove", { p_media: m.wizB });
    expect(data).toMatchObject({ ok: true, kept_as_evidence: false, public_paths: [`listing-media-public/${ownerId}/${draftId}/1-b.jpg`] });
    expect(await row("wizB")).toBeNull();
  });

  it("removing the imported cover keeps it as evidence, hides it and moves the cover", async () => {
    const { data } = await owner.rpc("listing_media_remove", { p_media: m.imported });
    expect(data).toMatchObject({ ok: true, kept_as_evidence: true, new_cover: m.wizA });
    const r = await row("imported");
    expect(r).toMatchObject({ processing_state: "removed", is_cover: false });
    expect(r?.derived_path).toContain("derived-x-1600.webp");                       // intake files untouched
    const { data: src } = await service.from("listing_media_source").select("media_id").eq("media_id", m.imported);
    expect(src ?? []).toHaveLength(1);                                              // provenance kept
    expect(await covers(draftId)).toEqual([m.wizA]);
    // Removed photos: not re-coverable, not removable twice, not part of an order.
    expect((await owner.rpc("listing_media_set_cover", { p_media: m.imported })).data).toMatchObject({ ok: false, error: "not_eligible" });
    expect((await owner.rpc("listing_media_remove", { p_media: m.imported })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await owner.rpc("listing_media_reorder", { p_listing: draftId, p_ids: [m.wizA, m.failed, m.kept] })).data).toMatchObject({ ok: true });
    const { data: audit } = await service.from("audit_logs").select("previous_values").eq("entity_id", draftId).eq("action", "listing_media.removed");
    expect((audit ?? []).some((a) => (a.previous_values as { imported?: boolean })?.imported === true)).toBe(true);
  });

  it("a removed photo is never public and does not count towards quality", async () => {
    const { data: pub } = await service.from("public_listing_media").select("id").eq("id", m.imported);
    expect(pub ?? []).toHaveLength(0);
    const { data: n } = await service.from("listing_media").select("id", { count: "exact" }).eq("listing_id", draftId).neq("processing_state", "removed");
    expect((n ?? []).length).toBe(3);
  });

  it("the owner still cannot set 'removed' (or anything) on an imported photo directly", async () => {
    const { error } = await owner.from("listing_media").update({ processing_state: "removed" }).eq("id", m.failed);
    expect(error?.code).toBe("42501");
    expect((await row("failed"))?.processing_state).toBe("failed");
  });
});
