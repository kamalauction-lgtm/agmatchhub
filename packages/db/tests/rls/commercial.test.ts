import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, adminClient, saClient, uid, hasEnv, fixtureName } from "./setup";

/**
 * Plans, entitlements and commercial policy (migrations 00061, 00062).
 *
 * The three things this suite exists to prove, because getting any of them
 * wrong produces a system that quietly bills or blocks the wrong people:
 *
 *   1. PRICE resolves by PRECEDENCE — one policy wins, the most specific one.
 *   2. ENTITLEMENTS resolve by COMBINATION — plan + bonuses add up.
 *   3. A compliance admin cannot touch either, per the role matrix in 00060.
 *
 * Fixtures are created with the service key and removed afterwards, because
 * precedence cannot be demonstrated without overlapping policies to resolve.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("commercial engine", () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let agent: SupabaseClient;
  let agentId: string;

  const made = { policies: [] as string[], grants: [] as string[], agencies: [] as string[] };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    admin = await adminClient();
    agent = await saClient();
    agentId = await uid(agent);
  });

  afterAll(async () => {
    /* Order matters, and getting it wrong left seven orphan agencies in the
       production admin before this was fixed: `agent_profiles.agency_id`
       references `agencies`, so the profile must be unlinked BEFORE the agency
       is deleted or the delete is refused. supabase-js returns that refusal in
       `error`, which nothing was reading, so each run failed silently. */
    await service.from("agent_profiles").update({ agency_id: null }).eq("user_id", agentId);
    for (const id of made.grants) await service.from("entitlement_grants").delete().eq("id", id);
    for (const id of made.policies) await service.from("commercial_policies").delete().eq("id", id);
    for (const id of made.agencies) {
      const { error } = await service.from("agencies").delete().eq("id", id);
      if (error) console.error("agency cleanup failed", id, error.message);
    }
  });

  const price = async (userId: string) => {
    const { data } = await service.rpc("resolve_price", { p_user: userId });
    return (data ?? [])[0];
  };

  const capacity = async (userId: string) => {
    const { data } = await service.rpc("resolve_entitlement_int", {
      p_user: userId,
      p_key: "listing.active_limit",
    });
    return Number(data ?? 0);
  };

  /** Create a policy plus one target, tracked for cleanup. */
  async function policy(
    fields: Record<string, unknown>,
    target: Record<string, unknown>,
  ): Promise<string> {
    const { data, error } = await service
      .from("commercial_policies").insert(fields).select("id").single();
    if (error) throw new Error(error.message);
    made.policies.push(data.id);
    const { error: te } = await service
      .from("commercial_policy_targets").insert({ policy_id: data.id, ...target });
    if (te) throw new Error(te.message);
    return data.id;
  }

  describe("the plan book", () => {
    it("has the four tiers, and Platinum keeps a real price", async () => {
      const { data } = await service
        .from("plans")
        .select("key, plan_versions(monthly_price, is_current)")
        .order("rank");
      const keys = (data ?? []).map((p) => p.key);
      expect(keys).toEqual(["basic", "silver", "gold", "platinum"]);

      const platinum = (data ?? []).find((p) => p.key === "platinum");
      const version = (platinum!.plan_versions as unknown as { monthly_price: string; is_current: boolean }[])
        .find((v) => v.is_current)!;
      // The Rp0 agents see must come from a POLICY. Pricing the plan at zero
      // would destroy the ability to switch monetisation on later.
      expect(Number(version.monthly_price)).toBeGreaterThan(0);
    });

    it("starts in FREE_LAUNCH, and no migration may set live billing", async () => {
      const { data } = await service.from("commercial_settings").select("billing_mode").single();
      expect(data?.billing_mode).toBe("FREE_LAUNCH");
    });
  });

  describe("price resolution", () => {
    it("the launch policy makes Platinum free without zeroing the plan", async () => {
      const p = await price(agentId);
      expect(p.plan_key).toBe("platinum");
      expect(Number(p.base_price)).toBeGreaterThan(0);
      expect(Number(p.effective_price)).toBe(0);
      expect(p.policy_name).toBe("Indonesia Free Launch");
    });

    it("an organisation policy beats the everyone policy", async () => {
      const { data: agency } = await service
        .from("agencies").insert({ name: fixtureName("Org for precedence"), country_code: "ID" })
        .select("id").single();
      made.agencies.push(agency!.id);
      await service.from("agent_profiles").update({ agency_id: agency!.id }).eq("user_id", agentId);

      await policy(
        { name: "Test Org 80%", treatment: "percent_discount", percent: 80, priority: 100 },
        { target_type: "agency", agency_id: agency!.id },
      );

      const p = await price(agentId);
      expect(p.policy_name).toBe("Test Org 80%");
      // 599000 * 0.20
      expect(Number(p.effective_price)).toBeCloseTo(Number(p.base_price) * 0.2, 2);
    });

    it("a policy aimed at the person beats the organisation's", async () => {
      await policy(
        { name: "Test Individual fixed", treatment: "fixed_price", amount: 12345, currency: "IDR", priority: 100 },
        { target_type: "user", user_id: agentId },
      );
      const p = await price(agentId);
      expect(p.policy_name).toBe("Test Individual fixed");
      expect(Number(p.effective_price)).toBe(12345);
    });

    it("an expired policy stops applying", async () => {
      const id = await policy(
        {
          name: "Test Expired", treatment: "complimentary", priority: 999,
          effective_from: new Date(Date.now() - 2 * 86400000).toISOString(),
          effective_until: new Date(Date.now() - 86400000).toISOString(),
        },
        { target_type: "user", user_id: agentId },
      );
      const p = await price(agentId);
      expect(p.policy_id).not.toBe(id);
    });

    it("an inactive policy stops applying", async () => {
      const id = await policy(
        { name: "Test Inactive", treatment: "complimentary", priority: 999, is_active: false },
        { target_type: "user", user_id: agentId },
      );
      const p = await price(agentId);
      expect(p.policy_id).not.toBe(id);
    });

    it("a discount never produces a negative price", async () => {
      await policy(
        { name: "Test Over-discount", treatment: "fixed_discount", amount: 9_999_999, currency: "IDR", priority: 5000 },
        { target_type: "user", user_id: agentId },
      );
      const p = await price(agentId);
      expect(Number(p.effective_price)).toBe(0);
    });
  });

  describe("entitlements combine, they do not override", () => {
    it("starts at the plan allowance", async () => {
      expect(await capacity(agentId)).toBe(300);          // Platinum
    });

    it("a referral reward adds to it rather than replacing it", async () => {
      const { data } = await service.from("entitlement_grants").insert({
        user_id: agentId,
        entitlement_key: "listing.active_limit",
        int_value: 35,
        source: "referral_reward",
        reason: "test: 5 activated referrals",
      }).select("id").single();
      made.grants.push(data!.id);
      expect(await capacity(agentId)).toBe(335);
    });

    it("an admin grant stacks on top of that", async () => {
      const { data } = await service.from("entitlement_grants").insert({
        user_id: agentId,
        entitlement_key: "listing.active_limit",
        int_value: 20,
        source: "admin_grant",
        reason: "test: goodwill",
      }).select("id").single();
      made.grants.push(data!.id);
      expect(await capacity(agentId)).toBe(355);
    });

    it("explains itself — every line, with its source", async () => {
      const { data } = await service.rpc("entitlement_lines", {
        p_user: agentId,
        p_key: "listing.active_limit",
      });
      const lines = (data ?? []) as { source: string; int_value: number }[];
      const sources = lines.map((l) => l.source).sort();
      expect(sources).toEqual(["admin_grant", "plan", "referral_reward"]);
      // The explanation must add up to what is enforced, or it is fiction.
      expect(lines.reduce((n, l) => n + (l.int_value ?? 0), 0)).toBe(await capacity(agentId));
    });

    it("an expired grant stops counting", async () => {
      const { data } = await service.from("entitlement_grants").insert({
        user_id: agentId,
        entitlement_key: "listing.active_limit",
        int_value: 500,
        source: "campaign",
        reason: "test: expired campaign",
        effective_from: new Date(Date.now() - 2 * 86400000).toISOString(),
        effective_until: new Date(Date.now() - 86400000).toISOString(),
      }).select("id").single();
      made.grants.push(data!.id);
      expect(await capacity(agentId)).toBe(355);
    });

    it("a revoked grant stops counting, and the row survives for history", async () => {
      const { data } = await service.from("entitlement_grants").insert({
        user_id: agentId,
        entitlement_key: "listing.active_limit",
        int_value: 99,
        source: "admin_grant",
        reason: "test: to be revoked",
      }).select("id").single();
      made.grants.push(data!.id);
      expect(await capacity(agentId)).toBe(454);

      await service.from("entitlement_grants")
        .update({ revoked_at: new Date().toISOString(), revoke_reason: "test" })
        .eq("id", data!.id);
      expect(await capacity(agentId)).toBe(355);

      const { data: still } = await service
        .from("entitlement_grants").select("id").eq("id", data!.id).maybeSingle();
      expect(still).not.toBeNull();          // reversal is history, not deletion
    });

    it("booleans are true if any source says true", async () => {
      const { data } = await service.rpc("resolve_entitlement_bool", {
        p_user: agentId, p_key: "matchhub.enabled",
      });
      expect(data).toBe(true);               // Platinum
    });

    it("tiers take the highest, not the alphabetically first", async () => {
      const { data } = await service.rpc("resolve_entitlement_tier", {
        p_user: agentId, p_key: "analytics.level",
      });
      expect(data).toBe("advanced");
    });
  });

  describe("authorization — the role matrix from 00060 holds here too", () => {
    it("an agent cannot read commercial policies", async () => {
      const { data } = await agent.from("commercial_policies").select("id");
      expect(data ?? []).toHaveLength(0);
    });

    it("an agent cannot create a policy for themselves", async () => {
      const { error } = await agent
        .from("commercial_policies")
        .insert({ name: "self-serve discount", treatment: "complimentary" });
      expect(error).not.toBeNull();
    });

    it("an agent cannot grant themselves listing capacity", async () => {
      const { error } = await agent.from("entitlement_grants").insert({
        user_id: agentId,
        entitlement_key: "listing.active_limit",
        int_value: 10_000,
        source: "admin_grant",
        reason: "helping myself",
      });
      expect(error).not.toBeNull();
    });

    it("an agent CAN see their own grants — knowing your own allowance is not privileged", async () => {
      const { data } = await agent.from("entitlement_grants").select("id").eq("user_id", agentId);
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it("an agent cannot change the billing mode", async () => {
      const { error } = await agent
        .from("commercial_settings").update({ billing_mode: "LIVE_BILLING" }).eq("id", true);
      expect(error !== null || true).toBe(true);
      const { data } = await service.from("commercial_settings").select("billing_mode").single();
      expect(data?.billing_mode).toBe("FREE_LAUNCH");
    });

    it("the super admin can read the price book", async () => {
      const { data } = await admin.from("plans").select("key");
      expect((data ?? []).length).toBe(4);
    });
  });
});

/**
 * The separation the audit found missing and 00060 introduced, now proven
 * against real commercial tables: a compliance admin reviews, and does not
 * price.
 */
describe.skipIf(!hasEnv || !SERVICE)("compliance admin cannot make commercial changes", () => {
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
      .from("user_roles").insert({ user_id: agentId, role_id: role!.id }).select("id").single();
    if (error) throw new Error(error.message);
    grantId = data.id;
  });

  afterAll(async () => {
    if (grantId) await service.from("user_roles").delete().eq("id", grantId);
  });

  it("holds review capabilities but not commercial.manage", async () => {
    const { data } = await agent.rpc("has_capability", { p_capability: "commercial.manage" });
    expect(data).toBe(false);
    const { data: review } = await agent.rpc("has_capability", { p_capability: "report.manage" });
    expect(review).toBe(true);
  });

  it("cannot create a commercial policy", async () => {
    const { error } = await agent
      .from("commercial_policies")
      .insert({ name: "compliance tries pricing", treatment: "complimentary" });
    expect(error).not.toBeNull();
  });

  it("cannot grant entitlements", async () => {
    const { error } = await agent.from("entitlement_grants").insert({
      user_id: agentId,
      entitlement_key: "listing.active_limit",
      int_value: 100,
      source: "admin_grant",
      reason: "compliance overreach",
    });
    expect(error).not.toBeNull();
  });

  it("cannot change plan pricing", async () => {
    const { data: pv } = await service
      .from("plan_versions").select("id").eq("is_current", true).limit(1).single();
    const { data, error } = await agent
      .from("plan_versions").update({ monthly_price: 1 }).eq("id", pv!.id).select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("cannot switch on live billing", async () => {
    await agent.from("commercial_settings").update({ billing_mode: "LIVE_BILLING" }).eq("id", true);
    const { data } = await service.from("commercial_settings").select("billing_mode").single();
    expect(data?.billing_mode).toBe("FREE_LAUNCH");
  });
});
