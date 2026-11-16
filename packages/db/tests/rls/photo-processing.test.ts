import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * Migration 00109 — the photo processor's queue (P0-e-2a).
 *
 *   · only the service role can claim work or touch the monthly usage;
 *   · a claim is a lease: overlapping runs never get the same photo, and a
 *     lease that outlives its run is claimed again after 10 minutes;
 *   · backoff and the three-attempt limit keep photos out of the queue;
 *   · only intake photos are queued; a public (wizard) photo never is;
 *   · a client session cannot move an intake photo to processed or ready.
 * The image transformation itself runs on the deployed Worker and is
 * validated there with synthetic images.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("photo processing queue (00109)", () => {
  let service: SupabaseClient;
  let agent: SupabaseClient;
  let agentId: string;
  let propertyId: string;
  let listingId: string;
  const media: Record<string, string> = {};

  const row = async (key: string, fields: Record<string, unknown>) => {
    const { data, error } = await service.from("listing_media").insert({
      listing_id: listingId, kind: "image", position: Object.keys(media).length,
      storage_path: `listing-media-intake/${agentId}/${listingId}/src-${randomBytes(8).toString("hex")}.jpg`,
      processing_state: "pending", ...fields,
    }).select("id").single();
    if (error) throw new Error(`media fixture: ${error.message}`);
    media[key] = data.id;
  };
  const claimIds = async () => {
    const { data, error } = await service.rpc("claim_intake_media", { p_limit: 50 });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { id: string }[]).map((m) => m.id).filter((id) => Object.values(media).includes(id));
  };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    const email = fixtureEmail(`p0e2-${Date.now()}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data: u } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    agentId = u!.user!.id;
    await service.from("profiles").upsert({ id: agentId, display_name: fixtureName("p0e2"), agent_status: "verified", country_code: "MY" });
    agent = createClient(URL_, ANON, { auth: { persistSession: false } });
    await agent.auth.signInWithPassword({ email, password });

    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({
      human_readable_id: hp, agent_id: agentId, country_code: "MY", property_category: "residential",
      property_type: "rumah", measurement_unit: "sqft", created_by: agentId,
    }).select("id").single();
    propertyId = p!.id;
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l } = await service.from("listings").insert({
      human_readable_id: hl, property_id: propertyId, agent_id: agentId, listing_type: "sale", status: "draft",
      currency: "MYR", price: 1000, language: "en", title: fixtureName("p0e2 listing"),
      slug: `fixture-p0e2-${propertyId.slice(0, 8)}`, created_by: agentId,
    }).select("id").single();
    listingId = l!.id;

    await row("fresh", {});
    await row("later", { processing_next_at: new Date(Date.now() + 3_600_000).toISOString() });
    await row("spent", { processing_attempts: 3 });
    await row("public", { storage_path: `listing-media-public/${agentId}/${listingId}/0-wizard.jpg` });
  });

  afterAll(async () => {
    if (listingId) {
      await service.from("listing_media").delete().eq("listing_id", listingId);
      await service.from("listings").delete().eq("id", listingId);
      await service.from("properties").delete().eq("id", propertyId);
    }
    if (agentId) await service.auth.admin.deleteUser(agentId);
  });

  it("only the service role can claim work or read and add usage", async () => {
    for (const c of [agent, anonClient()]) {
      expect((await c.rpc("claim_intake_media", { p_limit: 5 })).error).not.toBeNull();
      expect((await c.rpc("media_processing_usage_now")).error).not.toBeNull();
      expect((await c.rpc("media_processing_usage_add", { p_count: 1 })).error).not.toBeNull();
    }
    expect((await service.rpc("media_processing_usage_now")).error).toBeNull();
  });

  it("a claim takes only due intake photos: not backed-off, not spent, never public ones", async () => {
    const ids = await claimIds();
    expect(ids).toEqual([media.fresh]);
    const { data } = await service.from("listing_media").select("processing_state, processing_started_at").eq("id", media.fresh).single();
    expect(data!.processing_state).toBe("processing");
    expect(data!.processing_started_at).not.toBeNull();
  });

  it("an overlapping run does not get the same photo while the lease holds", async () => {
    expect(await claimIds()).toEqual([]);
  });

  it("a lease older than 10 minutes is claimed again", async () => {
    await service.from("listing_media")
      .update({ processing_started_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("id", media.fresh);
    expect(await claimIds()).toEqual([media.fresh]);
  });

  it("a backed-off photo is claimed once its time comes", async () => {
    await service.from("listing_media").update({ processing_next_at: new Date(Date.now() - 1000).toISOString() }).eq("id", media.later);
    expect(await claimIds()).toEqual([media.later]);
  });

  it("the agent cannot move an intake photo to processed or ready", async () => {
    for (const state of ["processed", "ready"]) {
      const { error } = await agent.from("listing_media").update({ processing_state: state }).eq("id", media.spent);
      expect(error?.code, state).toBe("42501");
    }
    // 00110: nor re-point a derivative (e.g. at the GPS original) or reset its attempts.
    for (const patch of [
      { derived_path: `listing-media-intake/${agentId}/${listingId}/src-0000000000000000.jpg` },
      { derived_thumb_path: "listing-media-intake/x" },
      { processing_attempts: 0 },
    ]) {
      const { error } = await agent.from("listing_media").update(patch).eq("id", media.spent);
      expect(error?.code, JSON.stringify(patch)).toBe("42501");
    }
  });

  it("the agent cannot insert an intake photo directly (attach_import_photo is the door)", async () => {
    const { error } = await agent.from("listing_media").insert({
      listing_id: listingId, kind: "image", position: 99, processing_state: "pending",
      storage_path: `listing-media-intake/${agentId}/${listingId}/src-1111111111111111.jpg`,
    });
    expect(error?.code).toBe("42501");
  });

  it("the service role (the processor) can set processed", async () => {
    const { error } = await service.from("listing_media").update({ processing_state: "processed" }).eq("id", media.fresh);
    expect(error).toBeNull();
  });
});
