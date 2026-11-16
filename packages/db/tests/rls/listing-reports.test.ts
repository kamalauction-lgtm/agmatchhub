import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName, saClient, uid } from "./setup";

/**
 * Migration 00120: buyers report a marketplace listing; moderators close the
 * reports (D9).
 *
 *   · anon reports a PUBLIC listing through submit_listing_report only; a
 *     draft, rejected or unknown listing is refused; reasons are a closed
 *     list; "other" needs details; details are capped;
 *   · rate limited per IP hash; one open report per listing per IP hash;
 *   · nobody writes listing_reports directly; anon and the listing's agent
 *     cannot read reports; a moderator of another country cannot see or close
 *     them; a moderator of the listing's country can, once, audited.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("listing reports (00120)", () => {
  let service: SupabaseClient;
  let modMy: SupabaseClient;
  let modId: SupabaseClient;
  let agent: SupabaseClient;
  let agentId = "";
  const users: string[] = [];
  const grants: string[] = [];
  const props: string[] = [];
  const listings: string[] = [];
  let liveSlug = "";
  let liveId = "";
  let draftSlug = "";
  let seq = 0;
  const ip = () => `p1c2-${Date.now()}-${seq++}`;

  async function person(tag: string) {
    const email = fixtureEmail(`p1c2-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p1c2 ${tag}`), agent_status: "verified", country_code: "MY" });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }
  async function listing(status: "published" | "draft") {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({ human_readable_id: hp, agent_id: agentId, country_code: "MY", property_category: "residential", property_type: "terrace", measurement_unit: "sqft", created_by: agentId }).select("id").single();
    props.push(p!.id);
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const slug = `fixture-p1c2-${status}-${p!.id.slice(0, 8)}`;
    const { data: l, error } = await service.from("listings").insert({ human_readable_id: hl, property_id: p!.id, agent_id: agentId, listing_type: "sale", status: "pending_review", moderation_state: "pending", currency: "MYR", price: 1000, language: "en", title: fixtureName("p1c2"), slug, created_by: agentId }).select("id").single();
    if (error) throw new Error(error.message);
    listings.push(l!.id);
    if (status === "published") await service.from("listings").update({ status: "published", moderation_state: "approved", published_at: new Date().toISOString() }).eq("id", l!.id);
    else await service.from("listings").update({ status: "draft" }).eq("id", l!.id);
    return { id: l!.id as string, slug };
  }
  const report = (slug: string, over: Record<string, unknown> = {}) =>
    anonClient().rpc("submit_listing_report", { p_listing_slug: slug, p_reason: "wrong_info", p_details: "The size is wrong.", p_locale: "en", p_ip_hash: ip(), ...over });

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    modMy = await saClient();
    const { data: r } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data: g, error: gErr } = await service.from("user_roles").insert({ user_id: await uid(modMy), role_id: r!.id, country_codes: ["MY"] }).select("id").single();
    if (gErr) throw new Error(gErr.message);
    grants.push(g!.id);
    const idMod = await person("id-mod");
    modId = idMod.c;
    const { data: g2 } = await service.from("user_roles").insert({ user_id: idMod.id, role_id: r!.id, country_codes: ["ID"] }).select("id").single();
    grants.push(g2!.id);
    const a = await person("agent"); agent = a.c; agentId = a.id;
    const live = await listing("published"); liveId = live.id; liveSlug = live.slug;
    draftSlug = (await listing("draft")).slug;
  });

  afterAll(async () => {
    if (!service) return;
    for (const l of listings) {
      await service.from("listing_reports").delete().eq("listing_id", l);
      await service.from("listing_status_history").delete().eq("listing_id", l);
      await service.from("listings").delete().eq("id", l);
    }
    for (const p of props) await service.from("properties").delete().eq("id", p);
    for (const u of users) await service.auth.admin.deleteUser(u);
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
  });

  it("anon reports a public listing; a draft or unknown listing is refused", async () => {
    expect((await report(liveSlug)).data).toEqual({ ok: true });
    expect((await report(draftSlug)).data).toMatchObject({ ok: false, error: "listing_not_found" });
    expect((await report("no-such-listing-p1c2")).data).toMatchObject({ ok: false, error: "listing_not_found" });
    const { data } = await service.from("listing_reports").select("reason_code, status, details").eq("listing_id", liveId);
    expect(data).toEqual([{ reason_code: "wrong_info", status: "open", details: "The size is wrong." }]);
  });

  it("validates the reason and details", async () => {
    expect((await report(liveSlug, { p_reason: "spam" })).data).toMatchObject({ ok: false, error: "invalid_reason" });
    expect((await report(liveSlug, { p_reason: "other", p_details: "  " })).data).toMatchObject({ ok: false, error: "details_required" });
    expect((await report(liveSlug, { p_details: "x".repeat(1001) })).data).toMatchObject({ ok: false, error: "details_too_long" });
  });

  it("one open report per listing per IP, and at most 5 an hour per IP", async () => {
    const same = `p1c2-same-${Date.now()}`;
    expect((await report(liveSlug, { p_ip_hash: same })).data).toEqual({ ok: true });
    expect((await report(liveSlug, { p_ip_hash: same })).data).toEqual({ ok: true, duplicate: true });
    const flood = `p1c2-flood-${Date.now()}`;
    // Five reports on five listings would need five listings; insert four directly as the operator to fill the bucket.
    for (let i = 0; i < 4; i++) await service.from("listing_reports").insert({ listing_id: liveId, reason_code: "other", details: "fill", ip_hash: flood, status: "dismissed" });
    expect((await report(liveSlug, { p_ip_hash: flood })).data).toEqual({ ok: true });
    expect((await report(liveSlug, { p_ip_hash: flood, p_reason: "duplicate" })).data).toMatchObject({ ok: false, error: "rate_limited" });
  });

  it("nobody writes listing_reports directly, and anon and the agent cannot read them", async () => {
    expect((await anonClient().from("listing_reports").insert({ listing_id: liveId, reason_code: "other", details: "direct" })).error).not.toBeNull();
    expect((await agent.from("listing_reports").insert({ listing_id: liveId, reason_code: "other", details: "direct" })).error).not.toBeNull();
    expect((await modMy.from("listing_reports").update({ status: "dismissed" }).eq("listing_id", liveId).select()).data ?? []).toHaveLength(0);
    expect((await anonClient().from("listing_reports").select("id").eq("listing_id", liveId)).data ?? []).toHaveLength(0);
    expect((await agent.from("listing_reports").select("id").eq("listing_id", liveId)).data ?? []).toHaveLength(0);
  });

  it("a moderator of another country cannot see or close the reports", async () => {
    expect((await modId.from("listing_reports").select("id").eq("listing_id", liveId)).data ?? []).toHaveLength(0);
    const { data: one } = await service.from("listing_reports").select("id").eq("listing_id", liveId).eq("status", "open").limit(1).single();
    expect((await modId.rpc("admin_decide_report", { p_report: one!.id, p_outcome: "dismissed" })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await agent.rpc("admin_decide_report", { p_report: one!.id, p_outcome: "dismissed" })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await anonClient().rpc("admin_decide_report", { p_report: one!.id, p_outcome: "dismissed" })).error).not.toBeNull();
  });

  it("the listing's country moderator sees and closes a report once, audited", async () => {
    const { data: seen } = await modMy.from("listing_reports").select("id, status").eq("listing_id", liveId).eq("status", "open");
    expect((seen ?? []).length).toBeGreaterThan(0);
    const id = seen![0].id;
    expect((await modMy.rpc("admin_decide_report", { p_report: id, p_outcome: "maybe" })).data).toMatchObject({ ok: false, error: "invalid_outcome" });
    expect((await modMy.rpc("admin_decide_report", { p_report: id, p_outcome: "actioned", p_note: "Size corrected by the agent." })).data).toEqual({ ok: true });
    expect((await modMy.rpc("admin_decide_report", { p_report: id, p_outcome: "dismissed" })).data).toMatchObject({ ok: false, error: "closed" });
    const { data: row } = await service.from("listing_reports").select("status, decision_note, decided_by").eq("id", id).single();
    expect(row).toMatchObject({ status: "actioned", decision_note: "Size corrected by the agent.", decided_by: await uid(modMy) });
    const { data: aud } = await service.from("audit_logs").select("action").eq("entity_id", liveId).eq("action", "listing.report_decided");
    expect((aud ?? []).length).toBe(1);
  });
});
