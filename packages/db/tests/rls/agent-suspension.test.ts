import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, hasEnv, fixtureEmail, fixtureName, saClient, uid } from "./setup";

/**
 * Migration 00121: suspend and restore an agent (P1-d-1, Agent 360).
 *
 *   · only agent.verify in the agent's country; never yourself; another
 *     country's admin, the agent and anon are refused;
 *   · suspending pauses exactly the agent's published listings, records the
 *     previous status, audits and notifies; a second suspension is refused;
 *   · a suspended agent cannot create or edit their listings or properties;
 *   · restoring returns the previous status and republishes only the listings
 *     this suspension paused that are still approved — a listing the agent had
 *     paused themselves beforehand stays paused;
 *   · nobody writes agent_suspensions directly; the agent can read their own.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("agent suspension (00121)", () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let adminId = "";
  let idAdmin: SupabaseClient;
  let agent: SupabaseClient;
  let agentId = "";
  const users: string[] = [];
  const grants: string[] = [];
  const props: string[] = [];
  const listings: string[] = [];
  let live1 = "";
  let live2 = "";
  let ownPaused = "";
  let propId = "";
  let seq = 0;

  async function person(tag: string, country = "MY") {
    const email = fixtureEmail(`p1d1-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    await service.from("profiles").upsert({ id: data.user.id, display_name: fixtureName(`p1d1 ${tag}`), agent_status: "verified", country_code: country });
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return { id: data.user.id, c };
  }
  async function listing(status: "published" | "paused") {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: p } = await service.from("properties").insert({ human_readable_id: hp, agent_id: agentId, country_code: "MY", property_category: "residential", property_type: "terrace", measurement_unit: "sqft", created_by: agentId }).select("id").single();
    props.push(p!.id); propId = p!.id;
    const { data: hl } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: l, error } = await service.from("listings").insert({ human_readable_id: hl, property_id: p!.id, agent_id: agentId, listing_type: "sale", status: "pending_review", moderation_state: "pending", currency: "MYR", price: 1000, language: "en", title: fixtureName("p1d1"), slug: `fixture-p1d1-${p!.id.slice(0, 8)}`, created_by: agentId }).select("id").single();
    if (error) throw new Error(error.message);
    listings.push(l!.id);
    await service.from("listings").update({ status, moderation_state: "approved", published_at: new Date().toISOString() }).eq("id", l!.id);
    return l!.id as string;
  }
  const statusOf = async (id: string) => (await service.from("listings").select("status").eq("id", id).single()).data!.status;
  const agentStatus = async () => (await service.from("profiles").select("agent_status").eq("id", agentId).single()).data!.agent_status;

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    admin = await saClient();
    adminId = await uid(admin);
    const { data: r } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data: g, error: gErr } = await service.from("user_roles").insert({ user_id: adminId, role_id: r!.id, country_codes: ["MY"] }).select("id").single();
    if (gErr) throw new Error(gErr.message);
    grants.push(g!.id);
    const ia = await person("id-admin", "ID"); idAdmin = ia.c;
    const { data: g2 } = await service.from("user_roles").insert({ user_id: ia.id, role_id: r!.id, country_codes: ["ID"] }).select("id").single();
    grants.push(g2!.id);
    const a = await person("agent"); agent = a.c; agentId = a.id;
    live1 = await listing("published");
    live2 = await listing("published");
    ownPaused = await listing("paused");
  });

  afterAll(async () => {
    if (!service) return;
    await service.from("agent_suspensions").delete().eq("agent_id", agentId);
    await service.from("agent_verifications").delete().eq("user_id", agentId);
    for (const l of listings) { await service.from("listing_status_history").delete().eq("listing_id", l); await service.from("listings").delete().eq("id", l); }
    for (const p of props) await service.from("properties").delete().eq("id", p);
    for (const u of users) { await service.from("notifications").delete().eq("user_id", u); await service.auth.admin.deleteUser(u); }
    if (grants.length) await service.from("user_roles").delete().in("id", grants);
  });

  it("another country's admin, the agent, anon and yourself are refused", async () => {
    expect((await idAdmin.rpc("admin_suspend_agent", { p_agent: agentId, p_reason: "Policy breach." })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await agent.rpc("admin_suspend_agent", { p_agent: agentId, p_reason: "Policy breach." })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await anonClient().rpc("admin_suspend_agent", { p_agent: agentId, p_reason: "Policy breach." })).error).not.toBeNull();
    expect((await admin.rpc("admin_suspend_agent", { p_agent: adminId, p_reason: "Self." })).data).toMatchObject({ ok: false });
    expect((await admin.rpc("admin_suspend_agent", { p_agent: agentId, p_reason: " " })).data).toMatchObject({ ok: false, error: "reason_required" });
    expect(await agentStatus()).toBe("verified");
  });

  it("suspending pauses exactly the published listings, records, audits and notifies", async () => {
    const { data } = await admin.rpc("admin_suspend_agent", { p_agent: agentId, p_reason: "Repeated misleading prices." });
    expect(data).toMatchObject({ ok: true, listings_paused: 2 });
    expect(await agentStatus()).toBe("suspended");
    expect([await statusOf(live1), await statusOf(live2), await statusOf(ownPaused)]).toEqual(["paused", "paused", "paused"]);
    const { data: s } = await service.from("agent_suspensions").select("previous_status, reason, paused_listing_ids, suspended_by").eq("agent_id", agentId).single();
    expect(s!.previous_status).toBe("verified");
    expect([...s!.paused_listing_ids].sort()).toEqual([live1, live2].sort());
    expect(s!.suspended_by).toBe(adminId);
    expect(((await service.from("audit_logs").select("id").eq("entity_id", agentId).eq("action", "agent.suspended")).data ?? []).length).toBe(1);
    expect(((await service.from("notifications").select("id").eq("user_id", agentId).eq("kind", "agent.suspended")).data ?? []).length).toBe(1);
    expect((await admin.rpc("admin_suspend_agent", { p_agent: agentId, p_reason: "Again." })).data).toMatchObject({ ok: false, error: "already_suspended" });
  });

  it("a suspended agent cannot create or edit listings or properties", async () => {
    expect((await agent.from("listings").update({ title: fixtureName("p1d1 while suspended") }).eq("id", live1)).error).not.toBeNull();
    expect((await agent.from("properties").update({ bedrooms: 5 }).eq("id", propId)).error).not.toBeNull();
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    expect((await agent.from("properties").insert({ human_readable_id: hp, agent_id: agentId, country_code: "MY", property_category: "residential", property_type: "terrace", measurement_unit: "sqft", created_by: agentId })).error).not.toBeNull();
  });

  it("the agent reads their own suspension (with the reason); nobody writes the table directly", async () => {
    const { data } = await agent.from("agent_suspensions").select("reason").eq("agent_id", agentId);
    expect(data).toEqual([{ reason: "Repeated misleading prices." }]);
    expect((await admin.from("agent_suspensions").update({ reason: "edited" }).eq("agent_id", agentId).select()).data ?? []).toHaveLength(0);
    expect((await agent.from("agent_suspensions").insert({ agent_id: agentId, previous_status: "verified", reason: "fake", suspended_by: agentId })).error).not.toBeNull();
    expect((await idAdmin.from("agent_suspensions").select("id").eq("agent_id", agentId)).data ?? []).toHaveLength(0);
  });

  it("restoring returns the status and republishes only what the suspension paused", async () => {
    expect((await idAdmin.rpc("admin_restore_agent", { p_agent: agentId })).data).toMatchObject({ ok: false, error: "not_found" });
    const { data } = await admin.rpc("admin_restore_agent", { p_agent: agentId, p_note: "Prices corrected." });
    expect(data).toMatchObject({ ok: true, status: "verified", listings_republished: 2 });
    expect(await agentStatus()).toBe("verified");
    expect([await statusOf(live1), await statusOf(live2), await statusOf(ownPaused)]).toEqual(["published", "published", "paused"]);
    expect(((await service.from("audit_logs").select("id").eq("entity_id", agentId).eq("action", "agent.restored")).data ?? []).length).toBe(1);
    expect((await admin.rpc("admin_restore_agent", { p_agent: agentId })).data).toMatchObject({ ok: false, error: "not_suspended" });
    // Back in control of their own listings.
    expect((await agent.from("listings").update({ title: fixtureName("p1d1 restored edit") }).eq("id", live1)).error).toBeNull();
  });
});
