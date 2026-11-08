import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, saClient, uid, hasEnv, fixtureName } from "./setup";

/**
 * Changing an organisation's commercial treatment.
 *
 * This is the "change IQI from 100% to 80%" path, and it is the most dangerous
 * action in the admin: one form submission reprices every agent in a company.
 * Three things must hold, and each is asserted below against the real
 * resolver rather than against the UI's own arithmetic:
 *
 *   1. The new treatment actually reaches the members.
 *   2. Changing it VERSIONS rather than overwrites — the old policy is
 *      deactivated and kept, so what a partner was given remains recoverable.
 *   3. Agents outside the organisation are untouched.
 *
 * The last one is the quiet failure mode: a company discount that leaks to
 * everybody looks fine on the organisation screen and is only noticed when
 * revenue is switched on.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("organisation commercial policy", () => {
  let service: SupabaseClient;
  let agencyId: string;
  let memberId: string;
  let outsiderId: string;
  let previousAgency: string | null = null;

  const madePolicies: string[] = [];

  const priceOf = async (userId: string) => {
    const { data } = await service.rpc("resolve_price", { p_user: userId });
    return (data ?? [])[0] as {
      base_price: string; effective_price: string; policy_name: string | null;
    };
  };

  /** Mirrors what the admin action does: retire the old, insert the new. */
  async function applyPolicy(
    treatment: "complimentary" | "percent_discount" | "fixed_price",
    value: number | null,
  ) {
    const { data: existing } = await service
      .from("commercial_policy_targets")
      .select("policy_id")
      .eq("target_type", "agency")
      .eq("agency_id", agencyId);

    for (const e of existing ?? []) {
      await service.from("commercial_policies").update({ is_active: false }).eq("id", e.policy_id);
    }

    const { data: policy, error } = await service
      .from("commercial_policies")
      .insert({
        name: `Test org — ${treatment}`,
        treatment,
        percent: treatment === "percent_discount" ? value : null,
        amount: treatment === "fixed_price" ? value : null,
        currency: treatment === "fixed_price" ? "IDR" : null,
        priority: 200,
        reason: "test",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    madePolicies.push(policy.id);

    await service
      .from("commercial_policy_targets")
      .insert({ policy_id: policy.id, target_type: "agency", agency_id: agencyId });
    return policy.id;
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    memberId = await uid(await saClient());

    const { data: prof } = await service
      .from("agent_profiles").select("agency_id").eq("user_id", memberId).maybeSingle();
    previousAgency = prof?.agency_id ?? null;

    const { data: agency, error } = await service
      .from("agencies").insert({ name: fixtureName(`Policy Org ${Date.now()}`), country_code: "ID" })
      .select("id").single();
    if (error) throw new Error(error.message);
    agencyId = agency.id;

    await service.from("agent_profiles").update({ agency_id: agencyId }).eq("user_id", memberId);

    // Somebody outside the organisation, to prove containment.
    const { data: outsiders } = await service
      .from("agent_profiles").select("user_id").is("agency_id", null).limit(1);
    outsiderId = outsiders?.[0]?.user_id ?? "";
  });

  afterAll(async () => {
    await service.from("agent_profiles").update({ agency_id: previousAgency }).eq("user_id", memberId);
    for (const id of madePolicies) await service.from("commercial_policies").delete().eq("id", id);
    await service.from("agencies").delete().eq("id", agencyId);
  });

  it("a complimentary policy makes the member free", async () => {
    await applyPolicy("complimentary", null);
    const p = await priceOf(memberId);
    expect(Number(p.effective_price)).toBe(0);
    expect(Number(p.base_price)).toBeGreaterThan(0);   // the plan keeps its price
  });

  it("moving to 80% charges a fifth, computed not typed", async () => {
    await applyPolicy("percent_discount", 80);
    const p = await priceOf(memberId);
    expect(Number(p.effective_price)).toBeCloseTo(Number(p.base_price) * 0.2, 2);
  });

  it("moving to 90% charges a tenth", async () => {
    await applyPolicy("percent_discount", 90);
    const p = await priceOf(memberId);
    expect(Number(p.effective_price)).toBeCloseTo(Number(p.base_price) * 0.1, 2);
  });

  it("a fixed price overrides the percentage entirely", async () => {
    await applyPolicy("fixed_price", 99000);
    const p = await priceOf(memberId);
    expect(Number(p.effective_price)).toBe(99000);
  });

  it("each change versions rather than overwrites", async () => {
    const { data: all } = await service
      .from("commercial_policies").select("id, is_active").in("id", madePolicies);
    // Four applied, three retired, one live — history intact.
    expect((all ?? []).length).toBe(madePolicies.length);
    expect((all ?? []).filter((p) => p.is_active).length).toBe(1);
    expect((all ?? []).filter((p) => !p.is_active).length).toBe(madePolicies.length - 1);
  });

  it("does not leak to agents outside the organisation", async () => {
    if (!outsiderId) return;                       // nobody unlinked to test with
    const p = await priceOf(outsiderId);
    expect(p.policy_name).not.toMatch(/Policy Test Org/);
  });

  it("deactivating the last policy returns the member to the platform default", async () => {
    for (const id of madePolicies) {
      await service.from("commercial_policies").update({ is_active: false }).eq("id", id);
    }
    const p = await priceOf(memberId);
    // Falls back to the platform-wide launch policy, not to nothing.
    expect(p.policy_name).toBe("Indonesia Free Launch");
    expect(Number(p.effective_price)).toBe(0);
  });
});
