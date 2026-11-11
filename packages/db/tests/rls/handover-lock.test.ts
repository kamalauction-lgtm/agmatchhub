import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, hasEnv, fixtureEmail, fixtureName, saClient, uid } from "./setup";

/**
 * Migration 00119: after handover, the agent is in control (P1-b-5).
 *
 *   · an admin-prepared batch goes preparing → in_review (handover) →
 *     complete (every item handled by the agent); audited; the agent is notified;
 *   · before completion the team can still work on it; after, the team has no
 *     edit path to the batch, its items, or the listing/property/photos it
 *     produced — only moderation (reject, photo keep-out) remains;
 *   · the agent keeps full control; the state cannot be written by hand;
 *   · listings outside such a batch are unaffected; the service role is exempt.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("handover lock (00119)", () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let agent: SupabaseClient;
  let agentId = "";
  const users: string[] = [];
  const grants: string[] = [];
  const props: string[] = [];
  const listings: string[] = [];
  const batches: string[] = [];
  let batchId = "";
  let itemImported = "";
  let itemReady = "";
  let lockedListing = "";
  let lockedProperty = "";
  let freeListing = "";
  let mediaId = "";
  let seq = 0;

  async function person(tag: string) {
    const email = fixtureEmail(`p1b5-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p1b5 ${tag}`), agent_status: "verified", country_code: "MY" });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }
  async function listing(title: string) {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({ human_readable_id: hp, agent_id: agentId, country_code: "MY", property_category: "residential", property_type: "terrace", measurement_unit: "sqft", created_by: agentId }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l, error } = await service.from("listings").insert({ human_readable_id: hl, property_id: p!.id, agent_id: agentId, listing_type: "sale", status: "pending_review", moderation_state: "pending", currency: "MYR", price: 1000, language: "en", title: fixtureName(title), slug: `fixture-p1b5-${p!.id.slice(0, 8)}`, created_by: agentId }).select("id").single();
    if (error) throw new Error(error.message);
    listings.push(l!.id);
    return { listing: l!.id as string, property: p!.id as string };
  }
  const stateOf = async () => (await service.from("import_batches").select("agent_review_state, agent_review_completed_at").eq("id", batchId).single()).data!;
  const titleOf = async (id: string) => (await service.from("listings").select("title").eq("id", id).single()).data!.title;

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    admin = await saClient();
    const { data: r } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data: g, error: gErr } = await service.from("user_roles").insert({ user_id: await uid(admin), role_id: r!.id, country_codes: ["MY"] }).select("id").single();
    if (gErr) throw new Error(gErr.message);
    grants.push(g!.id);
    const a = await person("agent"); agent = a.c; agentId = a.id;

    const locked = await listing("p1b5 prepared");
    lockedListing = locked.listing; lockedProperty = locked.property;
    freeListing = (await listing("p1b5 own")).listing;

    const { data: b, error: bErr } = await admin.rpc("admin_import_batch_create", {
      p_agent: agentId, p_source_kind: "excel", p_source_portal: "spreadsheet", p_source_label: fixtureName("p1b5 batch"), p_status: "ready",
    });
    if (bErr) throw new Error(bErr.message);
    batchId = b as string; batches.push(batchId);
    // The admin prepares two items; one is (as if) already committed by the agent into lockedListing.
    const { data: i1, error: e1 } = await admin.from("import_items").insert({ batch_id: batchId, source_url: `https://example.test/p1b5-a-${Date.now()}`, status: "ready", extracted: { title: "A" } }).select("id").single();
    if (e1) throw new Error(e1.message);
    itemImported = i1!.id;
    await service.from("import_items").update({ status: "imported", listing_id: lockedListing, property_id: lockedProperty }).eq("id", itemImported);
    const { data: i2 } = await admin.from("import_items").insert({ batch_id: batchId, source_url: `https://example.test/p1b5-b-${Date.now()}`, status: "ready", extracted: { title: "B" } }).select("id").single();
    itemReady = i2!.id;
    const { data: md } = await service.from("listing_media").insert({ listing_id: lockedListing, kind: "image", byte_size: 1000, storage_path: `listing-media-intake/${agentId}/${lockedListing}/src-${"c".repeat(16)}.jpg`, processing_state: "processed", derived_path: `listing-media-intake/${agentId}/${lockedListing}/derived-x-1600.webp`, derived_thumb_path: `listing-media-intake/${agentId}/${lockedListing}/derived-x-400.webp` }).select("id").single();
    mediaId = md!.id;
  });

  afterAll(async () => {
    if (!service) return;
    if (batches.length) {
      await service.from("import_items").delete().in("batch_id", batches);
      await service.from("import_batches").delete().in("id", batches);
    }
    for (const l of listings) {
      await service.from("listing_media").delete().eq("listing_id", l);
      await service.from("listing_status_history").delete().eq("listing_id", l);
      await service.from("listings").delete().eq("id", l);
    }
    for (const p of props) await service.from("properties").delete().eq("id", p);
    for (const u of users) {
      await service.from("notifications").delete().eq("user_id", u);
      await service.auth.admin.deleteUser(u);
    }
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
  });

  it("a prepared batch starts as preparing; handover makes it in_review; the team can still work on it", async () => {
    expect((await stateOf()).agent_review_state).toBe("preparing");
    expect((await admin.rpc("admin_import_batch_handover", { p_batch: batchId })).error).toBeNull();
    expect((await stateOf()).agent_review_state).toBe("in_review");
    // Not locked yet: the team may still correct the prepared listing.
    expect((await admin.from("listings").update({ title: fixtureName("p1b5 corrected by team") }).eq("id", lockedListing)).error).toBeNull();
    expect((await admin.from("import_items").update({ overrides: { note: "team fix" } }).eq("id", itemReady)).error).toBeNull();
  });

  it("nobody can write the state by hand", async () => {
    expect((await admin.from("import_batches").update({ agent_review_state: "complete" }).eq("id", batchId)).error).not.toBeNull();
    expect((await agent.from("import_batches").update({ agent_review_state: "complete" }).eq("id", batchId)).error).not.toBeNull();
    expect((await stateOf()).agent_review_state).toBe("in_review");
  });

  it("when the agent has handled every item, the batch is complete, audited, and the agent is told", async () => {
    expect((await agent.from("import_items").update({ status: "skipped" }).eq("id", itemReady)).error).toBeNull();
    const s = await stateOf();
    expect(s.agent_review_state).toBe("complete");
    expect(s.agent_review_completed_at).not.toBeNull();
    const { data: aud } = await service.from("audit_logs").select("new_values").eq("entity_id", batchId).eq("action", "listing_import.assisted_review_complete");
    expect((aud ?? []).length).toBe(1);
    const { data: n } = await service.from("notifications").select("kind, href").eq("user_id", agentId).eq("kind", "listing_import.handover_complete");
    expect(n).toEqual([{ kind: "listing_import.handover_complete", href: `/listings/import/${batchId}` }]);
  });

  it("the team has no edit path to the batch or its items any more", async () => {
    expect((await admin.from("import_items").update({ overrides: { note: "late fix" } }).eq("id", itemReady)).error).not.toBeNull();
    expect((await admin.from("import_items").insert({ batch_id: batchId, source_url: "https://example.test/p1b5-late", status: "ready" })).error).not.toBeNull();
    expect((await admin.from("import_batches").update({ source_label: "renamed" }).eq("id", batchId)).error).not.toBeNull();
    expect((await admin.rpc("admin_import_batch_handover", { p_batch: batchId })).error).not.toBeNull();
    // Even if a skipped item comes back, the batch stays complete.
    expect((await agent.from("import_items").update({ status: "ready" }).eq("id", itemReady)).error).toBeNull();
    expect((await stateOf()).agent_review_state).toBe("complete");
  });

  it("the team cannot edit or delete the listing's content, property, private data or photos", async () => {
    const before = await titleOf(lockedListing);
    expect((await admin.from("listings").update({ title: fixtureName("p1b5 team edit") }).eq("id", lockedListing)).error).not.toBeNull();
    expect((await admin.from("listings").update({ price: 1 }).eq("id", lockedListing)).error).not.toBeNull();
    expect(await titleOf(lockedListing)).toBe(before);
    await admin.from("listings").delete().eq("id", lockedListing);
    expect((await service.from("listings").select("id").eq("id", lockedListing)).data).toHaveLength(1);
    expect((await admin.from("properties").update({ bedrooms: 9 }).eq("id", lockedProperty)).error).not.toBeNull();
    expect((await admin.from("property_private").upsert({ property_id: lockedProperty, internal_notes: "team note" })).error).not.toBeNull();
    expect((await admin.from("listing_media").update({ position: 7 }).eq("id", mediaId)).error).not.toBeNull();
    expect((await admin.from("listing_media").insert({ listing_id: lockedListing, kind: "image", storage_path: `listing-media-public/${agentId}/${lockedListing}/x.webp`, position: 9, processing_state: "ready" })).error).not.toBeNull();
  });

  it("moderation stays open to the team: reject with a reason, and keep a photo out", async () => {
    const { error } = await admin.from("listings").update({ status: "rejected", moderation_state: "rejected", moderation_reason: "Photos unclear", moderation_reason_code: "photos_quality", moderated_at: new Date().toISOString() }).eq("id", lockedListing);
    expect(error).toBeNull();
    expect((await admin.rpc("admin_media_quarantine", { p_media: mediaId })).data).toMatchObject({ ok: true });
  });

  it("the agent keeps full control of their listing and property", async () => {
    expect((await agent.from("listings").update({ title: fixtureName("p1b5 agent edit") }).eq("id", lockedListing)).error).toBeNull();
    expect((await agent.from("properties").update({ bedrooms: 3 }).eq("id", lockedProperty)).error).toBeNull();
    expect(await titleOf(lockedListing)).toContain("p1b5 agent edit");
  });

  it("listings outside a completed batch are unaffected, and the service role is exempt", async () => {
    expect((await admin.from("listings").update({ title: fixtureName("p1b5 own, team edit") }).eq("id", freeListing)).error).toBeNull();
    expect((await service.from("listings").update({ title: fixtureName("p1b5 operator") }).eq("id", lockedListing)).error).toBeNull();
  });
});
