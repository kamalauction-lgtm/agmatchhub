import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, ANON, hasEnv, fixtureEmail } from "./setup";

/**
 * Migration 00129: new agents use the platform straight away; verification
 * is a voluntary badge; the approval gate stays behind a switch.
 *
 *   · approval off: a new (unverified) agent has access and may add a
 *     property; the switch is off by default;
 *   · approval on: a new signup has no access and cannot add a property,
 *     while an agent who already had access keeps it;
 *   · an agent cannot grant themselves access;
 *   · suspended and banned agents have no access; admin_ban_agent bans,
 *     cannot be undone with admin_restore_agent, and a country admin of
 *     another country cannot ban;
 *   · public agent profiles show new agents, with is_verified false.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FLAG = "agent_approval_required";

describe.skipIf(!hasEnv || !SERVICE)("agent instant access (00129)", () => {
  let service: SupabaseClient;
  const users: string[] = [];
  const grants: string[] = [];
  const props: string[] = [];
  let seq = 0;

  async function person(tag: string, country = "MY") {
    const email = fixtureEmail(`a129-${tag}-${Date.now()}-${seq++}`);
    const password = `Fx!${randomBytes(9).toString("base64url")}`;
    const { data, error } = await service.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: `a129 ${tag}`, country_code: country },
    });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: e2 } = await c.auth.signInWithPassword({ email, password });
    if (e2) throw new Error(e2.message);
    return { id: data.user.id, c };
  }
  async function adminOf(tag: string, roleKey: string, countries: string[]) {
    const a = await person(tag);
    const { data: role } = await service.from("roles").select("id").eq("key", roleKey).single();
    const { data, error } = await service.from("user_roles").insert({ user_id: a.id, role_id: role!.id, country_codes: countries }).select("id").single();
    if (error) throw new Error(`grant: ${error.message}`);
    grants.push(data.id);
    return a;
  }
  async function addProperty(c: SupabaseClient, agentId: string) {
    const { data: hp } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const r = await c.from("properties").insert({
      human_readable_id: hp, agent_id: agentId, country_code: "MY", property_category: "residential",
      property_type: "terrace", measurement_unit: "sqft", created_by: agentId,
    }).select("id").maybeSingle();
    if (r.data?.id) props.push(r.data.id);
    return r;
  }
  const setApproval = async (on: boolean) =>
    expect((await service.from("feature_flags").update({ enabled: on }).eq("key", FLAG)).error).toBeNull();

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (!service) return;
    await service.from("feature_flags").update({ enabled: false }).eq("key", FLAG);
    if (props.length) await service.from("properties").delete().in("id", props);
    for (const g of grants) await service.from("user_roles").delete().eq("id", g);
    // Suspension and ban records point at both the agent and the admin who
    // acted; they must go before the accounts or deleteUser fails.
    if (users.length) {
      await service.from("agent_suspensions").delete().in("agent_id", users);
      await service.from("agent_suspensions").delete().in("suspended_by", users);
      await service.from("agent_verifications").delete().in("user_id", users);
      await service.from("agent_verifications").delete().in("acted_by", users);
    }
    for (const u of users) {
      const { error } = await service.auth.admin.deleteUser(u);
      if (error) console.error(`agent-instant-access cleanup: ${u}: ${error.message}`);
    }
  });

  it("the approval switch exists and is off by default", async () => {
    const { data } = await service.from("feature_flags").select("enabled").eq("key", FLAG).single();
    expect(data?.enabled).toBe(false);
  });

  it("approval off: a new, unverified agent has access and can add a property", async () => {
    const a = await person("open");
    const { data: p } = await service.from("profiles").select("agent_status, access_granted_at").eq("id", a.id).single();
    expect(p?.agent_status).not.toBe("verified");
    expect(p?.access_granted_at).not.toBeNull();
    expect((await a.c.rpc("agent_has_access")).data).toBe(true);
    expect((await addProperty(a.c, a.id)).error).toBeNull();
  });

  it("approval on: a new signup waits, an agent who already had access keeps it", async () => {
    const before = await person("before");
    await setApproval(true);
    try {
      const after = await person("after");
      const { data: p } = await service.from("profiles").select("access_granted_at").eq("id", after.id).single();
      expect(p?.access_granted_at).toBeNull();
      expect((await after.c.rpc("agent_has_access")).data).toBe(false);
      expect((await addProperty(after.c, after.id)).error).not.toBeNull();
      expect((await before.c.rpc("agent_has_access")).data).toBe(true);
      // Verified (the old approval) gives access again.
      await service.from("profiles").update({ agent_status: "verified" }).eq("id", after.id);
      expect((await after.c.rpc("agent_has_access")).data).toBe(true);
    } finally {
      await setApproval(false);
    }
  });

  it("an agent cannot look up another agent's access", async () => {
    const a = await person("peek-a");
    const b = await person("peek-b");
    expect((await a.c.rpc("agent_has_access", { p_user: b.id })).data).toBe(false);
    expect((await b.c.rpc("agent_has_access")).data).toBe(true);
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc("agent_has_access", { p_user: b.id })).error).not.toBeNull();
  });

  it("an agent cannot grant themselves access", async () => {
    await setApproval(true);
    try {
      const a = await person("self-grant");
      const { error } = await a.c.from("profiles").update({ access_granted_at: new Date().toISOString() }).eq("id", a.id);
      expect(error).not.toBeNull();
      const { data: p } = await service.from("profiles").select("access_granted_at").eq("id", a.id).single();
      expect(p?.access_granted_at).toBeNull();
    } finally {
      await setApproval(false);
    }
  });

  it("suspended and banned agents have no access; ban cannot be restored; scope is enforced", async () => {
    const admin = await adminOf("admin", "country_admin", ["MY"]);
    const idAdmin = await adminOf("id-admin", "country_admin", ["ID"]);
    const a = await person("ban");
    const s = await person("suspend");

    expect((await idAdmin.c.rpc("admin_ban_agent", { p_agent: a.id, p_reason: "Not your country." })).data).toMatchObject({ ok: false, error: "not_found" });
    expect((await a.c.rpc("admin_ban_agent", { p_agent: s.id, p_reason: "Agents cannot ban." })).data).toMatchObject({ ok: false });

    expect((await admin.c.rpc("admin_suspend_agent", { p_agent: s.id, p_reason: "Checking documents." })).data).toMatchObject({ ok: true });
    expect((await s.c.rpc("agent_has_access")).data).toBe(false);

    expect((await admin.c.rpc("admin_ban_agent", { p_agent: a.id, p_reason: "Scam listings." })).data).toMatchObject({ ok: true });
    const { data: p } = await service.from("profiles").select("agent_status").eq("id", a.id).single();
    expect(p?.agent_status).toBe("banned");
    expect((await a.c.rpc("agent_has_access")).data).toBe(false);
    expect((await addProperty(a.c, a.id)).error).not.toBeNull();
    expect((await admin.c.rpc("admin_restore_agent", { p_agent: a.id, p_note: "try" })).data).toMatchObject({ ok: false, error: "not_suspended" });
    const { data: audit } = await service.from("audit_logs").select("actor_id").eq("action", "agent.banned").eq("entity_id", a.id);
    expect(audit?.[0]?.actor_id).toBe(admin.id);
  });

  it("public agent profiles include new agents, marked not verified", async () => {
    const a = await person("public");
    await service.from("profiles").update({ public_slug: `a129-${Date.now()}-${seq++}` }).eq("id", a.id);
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data } = await anon.from("public_agent_profiles").select("id, is_verified").eq("id", a.id);
    expect(data).toHaveLength(1);
    expect(data?.[0].is_verified).toBe(false);
  });
});
