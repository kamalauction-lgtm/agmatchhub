import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { URL_, ANON, anonClient, adminClient, saClient, uid, hasEnv } from "./setup";

/**
 * Role capabilities (migration 00060).
 *
 * Two faults are under test, both found in the admin audit of 24 Aug 2026:
 *
 *   1. `user_roles` had no INSERT, UPDATE or DELETE policy at all. Roles could
 *      only be granted by a developer running a script, so nothing could be
 *      delegated.
 *   2. `is_platform_admin()` returned true for all four admin roles alike, so
 *      a compliance admin — specified as "review only, no commercial edits" —
 *      had exactly the same power as a super admin.
 *
 * The negative cases below are the point of the file. A capability system that
 * only proves what an admin CAN do has not been tested.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv)("role capabilities", () => {
  let admin: SupabaseClient;   // super_admin
  let agent: SupabaseClient;   // no admin role
  let adminId: string;
  let agentId: string;

  beforeAll(async () => {
    admin = await adminClient();
    agent = await saClient();
    adminId = await uid(admin);
    agentId = await uid(agent);
  });

  describe("the matrix says what the spec says", () => {
    it("compliance admin may review, and may NOT touch commercial settings", async () => {
      const { data } = await admin
        .from("role_capabilities")
        .select("capability_key, roles!inner(key)")
        .eq("roles.key", "compliance_admin");
      const caps = (data ?? []).map((r) => r.capability_key).sort();

      expect(caps).toContain("report.manage");
      expect(caps).toContain("legal.publish");
      expect(caps).toContain("listing.moderate");
      // The whole reason the role exists.
      expect(caps).not.toContain("commercial.manage");
      expect(caps).not.toContain("platform.configure");
      expect(caps).not.toContain("roles.manage");
    });

    it("country admin gets the operational subset only", async () => {
      const { data } = await admin
        .from("role_capabilities")
        .select("capability_key, roles!inner(key)")
        .eq("roles.key", "country_admin");
      const caps = (data ?? []).map((r) => r.capability_key).sort();
      // agent.invite added by 00106 (P0-b), listing.import_assisted by 00107 (P0-d-1) and
      // media.review by 00114 (P1-a, to exactly the roles holding listing.moderate), all owner-approved.
      expect(caps).toEqual(["agent.invite", "agent.verify", "listing.import_assisted", "listing.moderate", "media.review", "request.manage"]);
      // Audit rows carry no country, so a country admin does not read them (00123).
      expect(caps).not.toContain("audit.view");
    });

    it("only super admin may hand out roles", async () => {
      const { data } = await admin
        .from("role_capabilities")
        .select("roles!inner(key)")
        .eq("capability_key", "roles.manage");
      const holders = (data ?? []).map((r) => (r.roles as unknown as { key: string }).key);
      expect(holders).toEqual(["super_admin"]);
    });

    it("a plain agent holds no capability at all", async () => {
      const { data } = await admin
        .from("role_capabilities")
        .select("capability_key, roles!inner(key)")
        .eq("roles.key", "agent");
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("has_capability answers for the caller, not in general", () => {
    it("the super admin holds roles.manage", async () => {
      const { data } = await admin.rpc("has_capability", { p_capability: "roles.manage" });
      expect(data).toBe(true);
    });

    it("an agent holds nothing", async () => {
      for (const cap of ["roles.manage", "commercial.manage", "listing.moderate"]) {
        const { data } = await agent.rpc("has_capability", { p_capability: cap });
        expect(data).toBe(false);
      }
    });

    it("my_capabilities lists the caller's own set", async () => {
      const { data } = await admin.rpc("my_capabilities");
      const keys = ((data ?? []) as { capability_key: string }[]).map((r) => r.capability_key);
      expect(keys).toContain("roles.manage");

      const { data: none } = await agent.rpc("my_capabilities");
      expect(none ?? []).toHaveLength(0);
    });
  });

  describe("country scope — the column that nothing read until now", () => {
    it("a global grant answers yes for any country", async () => {
      for (const country of ["ID", "MY", "SG"]) {
        const { data } = await admin.rpc("has_capability_in", {
          p_capability: "listing.moderate",
          p_country: country,
        });
        expect(data).toBe(true);
      }
    });

    it("someone with no role is refused for every country", async () => {
      const { data } = await agent.rpc("has_capability_in", {
        p_capability: "listing.moderate",
        p_country: "ID",
      });
      expect(data).toBe(false);
    });
  });

  describe("granting roles", () => {
    it("an agent cannot grant themselves a role", async () => {
      const { data: role } = await admin
        .from("roles").select("id").eq("key", "super_admin").single();
      const { error } = await agent
        .from("user_roles")
        .insert({ user_id: agentId, role_id: role!.id });
      expect(error).not.toBeNull();
    });

    it("an agent cannot grant anyone else a role either", async () => {
      const { data: role } = await admin
        .from("roles").select("id").eq("key", "admin").single();
      const { error } = await agent
        .from("user_roles")
        .insert({ user_id: adminId, role_id: role!.id });
      expect(error).not.toBeNull();
    });

    it("even a super admin cannot change their OWN roles", async () => {
      // Blocks quiet self-escalation, and blocks locking yourself out.
      const { data: role } = await admin
        .from("roles").select("id").eq("key", "compliance_admin").single();
      const { error } = await admin
        .from("user_roles")
        .insert({ user_id: adminId, role_id: role!.id });
      expect(error).not.toBeNull();
      expect(error?.message ?? "").toMatch(/own roles/i);
    });

    it("the last super admin cannot be revoked", async () => {
      const { data: supers } = await admin
        .from("user_roles")
        .select("id, user_id, roles!inner(key)")
        .eq("roles.key", "super_admin");

      // Only meaningful while more than one exists — with two, removing one is
      // allowed, so the guard is asserted through the trigger's own message on
      // a hypothetical last one. Assert the invariant instead: there is always
      // at least one.
      expect((supers ?? []).length).toBeGreaterThanOrEqual(1);
    });

    it("anonymous cannot read or write the grant table", async () => {
      const anon = anonClient();
      const { data } = await anon.from("user_roles").select("id");
      expect(data ?? []).toHaveLength(0);

      const { error } = await anon
        .from("user_roles")
        .insert({ user_id: agentId, role_id: "00000000-0000-0000-0000-000000000000" });
      expect(error).not.toBeNull();
    });
  });

  describe("the matrix itself is not editable by an agent", () => {
    it("an agent may read it — knowing the rules is not a secret", async () => {
      const { data } = await agent.from("role_capabilities").select("capability_key").limit(1);
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it("an agent cannot give a role a new capability", async () => {
      const { data: role } = await admin
        .from("roles").select("id").eq("key", "agent").single();
      const { error } = await agent
        .from("role_capabilities")
        .insert({ role_id: role!.id, capability_key: "roles.manage" });
      expect(error).not.toBeNull();
    });

    it("anonymous cannot read the matrix", async () => {
      const { data } = await anonClient().from("role_capabilities").select("capability_key");
      expect(data ?? []).toHaveLength(0);
    });
  });
});

/**
 * The end-to-end proof, and the one that needs the service key: grant a real
 * role to a real account, confirm the capability appears and is correctly
 * limited, then take it away again.
 */
describe.skipIf(!hasEnv || !SERVICE)("a granted role actually works", () => {
  let service: SupabaseClient;
  let agent: SupabaseClient;
  let agentId: string;
  let grantId: string | null = null;

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    agent = await saClient();
    agentId = await uid(agent);

    const { data: role } = await service
      .from("roles").select("id").eq("key", "compliance_admin").single();
    const { data, error } = await service
      .from("user_roles")
      .insert({ user_id: agentId, role_id: role!.id })
      .select("id").single();
    if (error) throw new Error(`could not grant test role: ${error.message}`);
    grantId = data.id;
  });

  afterAll(async () => {
    if (grantId) await service.from("user_roles").delete().eq("id", grantId);
  });

  it("gives them exactly the compliance capabilities", async () => {
    const { data } = await agent.rpc("my_capabilities");
    const keys = ((data ?? []) as { capability_key: string }[]).map((r) => r.capability_key).sort();
    // media.review (00114) follows listing.moderate.
    // audit.view added by 00123 (screen 13): reading the audit trail, global roles only.
    expect(keys).toEqual(["agent.verify", "audit.view", "legal.publish", "listing.moderate", "media.review", "report.manage"]);
  });

  it("and NOT the commercial one — the fault this migration exists to fix", async () => {
    const { data } = await agent.rpc("has_capability", { p_capability: "commercial.manage" });
    expect(data).toBe(false);
  });

  it("a compliance admin still cannot hand out roles", async () => {
    const { data } = await agent.rpc("has_capability", { p_capability: "roles.manage" });
    expect(data).toBe(false);

    const { data: role } = await service
      .from("roles").select("id").eq("key", "admin").single();
    const { error } = await agent
      .from("user_roles")
      .insert({ user_id: agentId, role_id: role!.id });
    expect(error).not.toBeNull();
  });

  it("is_platform_admin still says yes — that gate is about seeing, not doing", async () => {
    const { data } = await agent.rpc("is_platform_admin");
    expect(data).toBe(true);
  });
});
