import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, anonClient, saClient, adminClient, hasEnv, makeFixtureAgent, uid } from "./setup";

/**
 * Migration 00103 — admin reporting RPCs answer only admins.
 *
 * Before 00103 every function below was SECURITY DEFINER and granted to
 * `authenticated` with no check inside, so any signed-in agent could call
 * admin_search through PostgREST and read other agents' emails. These tests
 * are the negative proof: a plain agent and anonymous are refused, the
 * renamed bodies are not reachable either, and the people who should get an
 * answer still do.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasAdminEnv = !!(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD);

const CALLS: [string, Record<string, unknown>][] = [
  ["admin_growth_metrics", {}],
  ["admin_action_queues", {}],
  ["admin_referral_signals", {}],
  ["admin_top_referrers", { p_limit: 5 }],
  ["admin_search", { p_query: "test", p_limit: 5 }],
  ["admin_metric_series", { p_days: 7 }],
  ["admin_period_comparison", { p_days: 7 }],
  ["admin_funnel", {}],
  ["admin_breakdown", { p_dimension: "country" }],
  ["admin_top_agents", { p_limit: 5 }],
  ["admin_commercial_snapshot", {}],
  ["admin_system_health", {}],
];

type Queues = {
  listings_in_review: number;
  agents_awaiting: number;
  requests_to_approve: number;
  open_reports: number;
};

describe.skipIf(!hasEnv)("admin reporting RPCs are admin-only (00103)", () => {
  let agent: SupabaseClient;

  beforeAll(async () => {
    agent = await saClient();
  });

  it.each(CALLS)("a plain agent is refused %s", async (fn, args) => {
    const { data, error } = await agent.rpc(fn, args);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
    expect(data).toBeNull();
  });

  it.each(CALLS)("anonymous is refused %s", async (fn, args) => {
    const { data, error } = await anonClient().rpc(fn, args);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it.each(CALLS)("the renamed body %s_unguarded is not callable by an agent", async (fn, args) => {
    const { data, error } = await agent.rpc(`${fn}_unguarded`, args);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("the guard helper itself is not callable", async () => {
    const { error } = await agent.rpc("assert_admin_reporting_access");
    expect(error).not.toBeNull();
  });

  it.skipIf(!hasAdminEnv)("a platform admin still gets every answer", async () => {
    const admin = await adminClient();
    for (const [fn, args] of CALLS) {
      const { error } = await admin.rpc(fn, args);
      expect(error, fn).toBeNull();
    }
  });
});

describe.skipIf(!hasEnv || !SERVICE)("admin action queues count real statuses (00103)", () => {
  let service: SupabaseClient;
  let fixtureId: string | null = null;

  beforeAll(() => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (fixtureId) await service.auth.admin.deleteUser(fixtureId);
  });

  const queues = async (): Promise<Queues> => {
    const { data, error } = await service.rpc("admin_action_queues");
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as Queues;
  };

  it("the service role is allowed (reporting tests and operator scripts)", async () => {
    const { error } = await service.rpc("admin_system_health");
    expect(error).toBeNull();
  });

  it("an agent moving to under_review shows up in agents_awaiting", async () => {
    // Before 00103 this counted 'submitted', a status the CHECK constraint
    // does not allow, so the number was a constant zero.
    const before = await queues();
    fixtureId = await makeFixtureAgent(service, "p0a-queue", { agent_status: "under_review" });
    const after = await queues();
    expect(Number(after.agents_awaiting)).toBe(Number(before.agents_awaiting) + 1);
  });

  it("the verification health check sees the same agent", async () => {
    const { data } = await service.rpc("admin_system_health");
    const row = (data as { check_key: string; detail_count: number }[]).find(
      (r) => r.check_key === "verification",
    );
    expect(row).toBeDefined();
  });
});

describe.skipIf(!hasEnv || !SERVICE)("log_audit stamps the actor's role (00103)", () => {
  it("an agent's own audit row cannot pass as an admin's", async () => {
    const service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    const agent = await saClient();
    const agentId = await uid(agent);
    const marker = `test.audit_role_stamp.${Date.now()}`;

    const { error } = await agent.rpc("log_audit", {
      p_action: marker,
      p_entity_type: "test",
    });
    expect(error).toBeNull();

    const { data } = await service
      .from("audit_logs")
      .select("actor_id, actor_role")
      .eq("action", marker)
      .single();
    expect(data!.actor_id).toBe(agentId);
    expect(["super_admin", "admin", "compliance_admin", "country_admin"]).not.toContain(
      data!.actor_role,
    );
    expect(data!.actor_role).not.toBeNull();
  });
});

describe.skipIf(!hasEnv || !SERVICE)("a country admin is confined to their country", () => {
  let service: SupabaseClient;
  let scoped: SupabaseClient;
  let grantId: string | null = null;

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    scoped = await saClient();
    const scopedId = await uid(scoped);
    const { data: role } = await service
      .from("roles").select("id").eq("key", "country_admin").single();
    const { data, error } = await service
      .from("user_roles")
      .insert({ user_id: scopedId, role_id: role!.id, country_codes: ["MY"] })
      .select("id").single();
    if (error) throw new Error(`could not grant test role: ${error.message}`);
    grantId = data.id;
  });

  afterAll(async () => {
    if (grantId) await service.from("user_roles").delete().eq("id", grantId);
  });

  it.each(["agent.verify", "listing.moderate", "request.manage"])(
    "holds %s for MY and not for ID",
    async (cap) => {
      const my = await scoped.rpc("has_capability_in", { p_capability: cap, p_country: "MY" });
      const id = await scoped.rpc("has_capability_in", { p_capability: cap, p_country: "ID" });
      expect(my.data).toBe(true);
      expect(id.data).toBe(false);
    },
  );

  it("an entity with no country is outside a scoped admin's reach", async () => {
    const { data } = await scoped.rpc("has_capability_in", {
      p_capability: "listing.moderate",
      p_country: null,
    });
    expect(data).toBe(false);
  });

  it("is a platform admin, so the reporting RPCs answer", async () => {
    const { error } = await scoped.rpc("admin_action_queues");
    expect(error).toBeNull();
  });

  it("and its audit rows are stamped country_admin", async () => {
    const marker = `test.audit_role_stamp.scoped.${Date.now()}`;
    await scoped.rpc("log_audit", { p_action: marker, p_entity_type: "test" });
    const { data } = await service
      .from("audit_logs").select("actor_role").eq("action", marker).single();
    expect(data!.actor_role).toBe("country_admin");
  });
});

/**
 * Migration 00104 — verification files follow the same scope. Found in
 * staging validation: the hub page refused a MY country admin, but the
 * storage API still signed an ID agent's licence for them.
 */
describe.skipIf(!hasEnv || !SERVICE)("verification files are country-scoped (00104)", () => {
  let service: SupabaseClient;
  let scoped: SupabaseClient;
  let grantId: string | null = null;
  const made: { user: string; path: string }[] = [];
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0),
  );

  const agentWithDoc = async (tag: string, country: string) => {
    const user = await makeFixtureAgent(service, tag, { country_code: country });
    const path = `${user}/licence-fixture-${Date.now()}.png`;
    const { error } = await service.storage
      .from("agent-verification-private")
      .upload(path, png, { contentType: "image/png" });
    if (error) throw new Error(`fixture upload failed: ${error.message}`);
    made.push({ user, path });
    return path;
  };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    scoped = await saClient();
    const { data: role } = await service.from("roles").select("id").eq("key", "country_admin").single();
    const { data, error } = await service
      .from("user_roles")
      .insert({ user_id: await uid(scoped), role_id: role!.id, country_codes: ["MY"] })
      .select("id").single();
    if (error) throw new Error(`could not grant test role: ${error.message}`);
    grantId = data.id;
  });

  afterAll(async () => {
    if (grantId) await service.from("user_roles").delete().eq("id", grantId);
    for (const m of made) {
      await service.storage.from("agent-verification-private").remove([m.path]);
      await service.auth.admin.deleteUser(m.user);
    }
  });

  it("a MY country admin cannot sign an ID agent's document", async () => {
    const path = await agentWithDoc("p0a-doc-id", "ID");
    const { data } = await scoped.storage.from("agent-verification-private").createSignedUrl(path, 60);
    expect(data?.signedUrl ?? null).toBeNull();
  });

  it("but can sign a MY agent's document", async () => {
    const path = await agentWithDoc("p0a-doc-my", "MY");
    const { data, error } = await scoped.storage.from("agent-verification-private").createSignedUrl(path, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });

  it.skipIf(!hasAdminEnv)("a global admin can sign either", async () => {
    const admin = await adminClient();
    for (const m of made) {
      const { data } = await admin.storage.from("agent-verification-private").createSignedUrl(m.path, 60);
      expect(data?.signedUrl, m.path).toBeTruthy();
    }
  });

  it("anonymous still cannot sign anyone's document", async () => {
    const other = anonClient();
    const { data } = await other.storage
      .from("agent-verification-private")
      .createSignedUrl(made[0]?.path ?? "none/none.png", 60);
    expect(data?.signedUrl ?? null).toBeNull();
  });
});
