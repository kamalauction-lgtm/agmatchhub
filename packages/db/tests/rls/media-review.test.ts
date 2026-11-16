import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName, saClient, uid } from "./setup";

/**
 * Migration 00114: moderation and photo quality (P1-a).
 *
 *   · media.review goes to exactly the roles that hold listing.moderate;
 *   · admin_media_quarantine / _release / _retry check the capability for the
 *     PHOTO'S country in the database: an MY country admin acts on MY photos,
 *     and an ID photo looks like "not found" (negative); agents and anon too;
 *   · release refuses a photo on a listing the reviewer prepared (separation
 *     of duties) and returns a processed photo to `processed`, an unprocessed
 *     one to `pending`; retry takes only failed or paused photos;
 *   · the intake guard still refuses an agent's direct state change;
 *   · rejection reason codes are a fixed vocabulary.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("moderation and photo quality (00114)", () => {
  let service: SupabaseClient;
  let scoped: SupabaseClient;   // SA + country_admin {MY}
  let scopedId = "";
  let agent: SupabaseClient;
  let agentId = "";
  let idAgentId = "";
  const users: string[] = [];
  const grants: string[] = [];
  const props: string[] = [];
  const listings: string[] = [];
  const batches: string[] = [];
  const m: Record<string, string> = {};
  let seq = 0;

  async function person(tag: string, country: string) {
    const email = fixtureEmail(`p1a-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p1a ${tag}`), agent_status: "verified", country_code: country });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }
  async function listing(owner: string, country: string) {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({
      human_readable_id: hp, agent_id: owner, country_code: country, property_category: "residential",
      property_type: country === "MY" ? "terrace" : "rumah", measurement_unit: country === "MY" ? "sqft" : "sqm", created_by: owner,
    }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l, error } = await service.from("listings").insert({
      human_readable_id: hl, property_id: p!.id, agent_id: owner, listing_type: "sale", status: "pending_review", moderation_state: "pending",
      currency: country === "MY" ? "MYR" : "IDR", price: 1000, language: "en", title: fixtureName("p1a listing"),
      slug: `fixture-p1a-${p!.id.slice(0, 8)}`, created_by: owner, creation_source: "import",
    }).select("id").single();
    if (error) throw new Error(error.message);
    listings.push(l!.id);
    return l!.id as string;
  }
  async function photo(key: string, owner: string, listingId: string, fields: Record<string, unknown>) {
    const base = `listing-media-intake/${owner}/${listingId}`;
    const { data, error } = await service.from("listing_media").insert({
      listing_id: listingId, kind: "image", byte_size: 1000, storage_path: `${base}/src-${key.padEnd(16, "0").slice(0, 16)}.jpg`, ...fields,
    }).select("id").single();
    if (error) throw new Error(`${key}: ${error.message}`);
    m[key] = data!.id;
  }
  const state = async (key: string) => (await service.from("listing_media").select("processing_state, processing_error, processing_attempts").eq("id", m[key]).single()).data;

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    scoped = await saClient();
    scopedId = await uid(scoped);
    const { data: r } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data: g, error: gErr } = await service.from("user_roles").insert({ user_id: scopedId, role_id: r!.id, country_codes: ["MY"] }).select("id").single();
    if (gErr) throw new Error(gErr.message);
    grants.push(g!.id);

    const a = await person("agent", "MY");
    agent = a.c; agentId = a.id;
    idAgentId = (await person("id-agent", "ID")).id;

    const my = await listing(agentId, "MY");
    const myPrepared = await listing(agentId, "MY");
    const id = await listing(idAgentId, "ID");
    const der = (l: string, k: string) => ({ derived_path: `listing-media-intake/${agentId}/${l}/derived-${k}-1600.webp`, derived_thumb_path: `listing-media-intake/${agentId}/${l}/derived-${k}-400.webp` });
    await photo("failed", agentId, my, { processing_state: "failed", processing_error: "IMAGES_TRANSFORM_ERROR 9516", processing_attempts: 3 });
    await photo("paused", agentId, my, { processing_state: "pending", processing_error: "paused_cap" });
    await photo("queued", agentId, my, { processing_state: "pending" });
    await photo("keptProcessed", agentId, my, { processing_state: "quarantined", ...der(my, "a") });
    await photo("keptRaw", agentId, my, { processing_state: "quarantined", processing_attempts: 1 });
    await photo("processed", agentId, my, { processing_state: "processed", ...der(my, "b") });
    await photo("preparedKept", agentId, myPrepared, { processing_state: "quarantined", ...der(myPrepared, "c") });
    await photo("idFailed", idAgentId, id, { processing_state: "failed", processing_attempts: 3 });

    // The scoped admin prepared `myPrepared` (an assisted batch whose item became that listing).
    const { data: batch, error: bErr } = await scoped.rpc("admin_import_batch_create", {
      p_agent: agentId, p_source_kind: "excel", p_source_portal: "spreadsheet", p_source_label: fixtureName("p1a batch"), p_status: "ready",
    });
    if (bErr) throw new Error(bErr.message);
    batches.push(batch as string);
    const { error: iErr } = await service.from("import_items").insert({ batch_id: batch, source_url: "https://example.test/p1a", status: "imported", listing_id: myPrepared });
    if (iErr) throw new Error(iErr.message);
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
    for (const u of users) await service.auth.admin.deleteUser(u);
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
  });

  it("media.review goes to exactly the roles holding listing.moderate", async () => {
    const roles = async (cap: string) => ((await service.from("role_capabilities").select("roles!inner(key)").eq("capability_key", cap)).data ?? [])
      .map((r) => (r.roles as unknown as { key: string }).key).sort();
    expect(await roles("media.review")).toEqual(await roles("listing.moderate"));
  });

  it("an agent and anon cannot use any reviewer action", async () => {
    for (const fn of ["admin_media_quarantine", "admin_media_release", "admin_media_retry"]) {
      const { data } = await agent.rpc(fn, { p_media: m.failed });
      expect(data, fn).toMatchObject({ ok: false, error: "not_found" });
      const { error } = await anonClient().rpc(fn, { p_media: m.failed });
      expect(error, `anon ${fn}`).not.toBeNull();
    }
    expect((await state("failed"))?.processing_state).toBe("failed");
  });

  it("the MY country admin cannot act on an Indonesian photo", async () => {
    for (const fn of ["admin_media_quarantine", "admin_media_retry"]) {
      const { data } = await scoped.rpc(fn, { p_media: m.idFailed });
      expect(data, fn).toMatchObject({ ok: false, error: "not_found" });
    }
    expect((await state("idFailed"))?.processing_state).toBe("failed");
  });

  it("retry takes a failed or paused photo back to a fresh pending run, nothing else", async () => {
    expect((await scoped.rpc("admin_media_retry", { p_media: m.queued })).data).toMatchObject({ ok: false, error: "not_retryable" });
    expect((await scoped.rpc("admin_media_retry", { p_media: m.processed })).data).toMatchObject({ ok: false, error: "not_retryable" });
    expect((await scoped.rpc("admin_media_retry", { p_media: m.failed })).data).toMatchObject({ ok: true });
    expect(await state("failed")).toMatchObject({ processing_state: "pending", processing_error: null, processing_attempts: 0 });
    expect((await scoped.rpc("admin_media_retry", { p_media: m.paused })).data).toMatchObject({ ok: true });
    expect(await state("paused")).toMatchObject({ processing_state: "pending", processing_error: null });
  });

  it("release returns a processed photo to processed and an unprocessed one to pending", async () => {
    expect((await scoped.rpc("admin_media_release", { p_media: m.keptProcessed })).data).toMatchObject({ ok: true, state: "processed" });
    expect((await state("keptProcessed"))?.processing_state).toBe("processed");
    expect((await scoped.rpc("admin_media_release", { p_media: m.keptRaw })).data).toMatchObject({ ok: true, state: "pending" });
    expect(await state("keptRaw")).toMatchObject({ processing_state: "pending", processing_attempts: 0 });
    expect((await scoped.rpc("admin_media_release", { p_media: m.processed })).data).toMatchObject({ ok: false, error: "not_quarantined" });
  });

  it("release is refused on a listing the reviewer prepared (separation of duties)", async () => {
    expect((await scoped.rpc("admin_media_release", { p_media: m.preparedKept })).data).toMatchObject({ ok: false, error: "self_prepared" });
    expect((await state("preparedKept"))?.processing_state).toBe("quarantined");
  });

  it("quarantine keeps a photo out, and every action is audited", async () => {
    expect((await scoped.rpc("admin_media_quarantine", { p_media: m.processed })).data).toMatchObject({ ok: true });
    expect((await state("processed"))?.processing_state).toBe("quarantined");
    const { data: audit } = await service.from("audit_logs").select("action, actor_role")
      .in("entity_id", [m.failed, m.paused, m.keptProcessed, m.keptRaw, m.processed]);
    const actions = new Set((audit ?? []).map((a) => a.action));
    expect([...actions].sort()).toEqual(["listing_media.quarantined", "listing_media.released", "listing_media.retried"]);
    expect((audit ?? []).every((a) => a.actor_role === "country_admin")).toBe(true);
  });

  it("the agent still cannot change an imported photo's state directly", async () => {
    const { error } = await agent.from("listing_media").update({ processing_state: "pending" }).eq("id", m.preparedKept);
    expect(error?.code).toBe("42501");
  });

  it("rejection reason codes are a fixed vocabulary", async () => {
    const { error: bad } = await service.from("listings").update({ moderation_reason_code: "made_up" }).eq("id", listings[0]);
    expect(bad).not.toBeNull();
    const { error: ok } = await service.from("listings").update({ moderation_reason_code: "photos_rights" }).eq("id", listings[0]);
    expect(ok).toBeNull();
  });
});
