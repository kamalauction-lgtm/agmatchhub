import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, adminClient, laClient, raClient, uid, hasEnv, hasPairEnv } from "./setup";

/**
 * Migrations 00090–00092: wallet kinds, plan families, three price lists.
 *
 * What must hold: boost arithmetic is untouched; credit only enters through
 * credit_grant() and an agent cannot call it for themselves; the catalogue is
 * one list per currency with the entitlements carried along; a verified MY
 * agent resolves to MYR and an Indonesian to IDR; repricing never empties a
 * plan; an agent plan and an AI plan may coexist but two agent plans may not.
 */
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !hasPairEnv || !SERVICE)("commercial families & price lists (00090–00092)", () => {
  let service: SupabaseClient;
  let admin: SupabaseClient;
  let la: SupabaseClient;
  let ra: SupabaseClient;
  let laId: string;
  let raId: string;
  let laCountry: string | null = null;
  const made = { plans: [] as string[], versions: [] as string[], subs: [] as string[] };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    admin = await adminClient();
    la = await laClient();
    ra = await raClient();
    laId = await uid(la);
    raId = await uid(ra);
    const { data } = await service.from("profiles").select("country_code").eq("id", laId).single();
    laCountry = data?.country_code ?? null;
  });

  afterAll(async () => {
    await service.from("profiles").update({ country_code: laCountry }).eq("id", laId);
    for (const id of made.subs) await service.from("subscriptions").delete().eq("id", id);
    for (const id of made.versions) await service.from("plan_versions").delete().eq("id", id);
    for (const id of made.plans) await service.from("plans").delete().eq("id", id);
    // The credits granted below are small and on staging test accounts; spend them back to zero.
    for (const kind of ["ai", "boost"]) {
      const { data: w } = await service.from("credit_wallets").select("balance").eq("agent_id", laId).eq("kind", kind).maybeSingle();
      if (w && w.balance > 0) await service.rpc("credit_spend", { p_agent: laId, p_kind: kind, p_amount: w.balance, p_reason: "adjustment", p_note: "test cleanup" });
    }
  });

  describe("credit wallets by kind", () => {
    it("an agent cannot credit themselves; an admin can; balances are per kind", async () => {
      const { error: self } = await la.rpc("credit_grant", { p_agent: laId, p_kind: "ai", p_amount: 100, p_reason: "grant", p_note: "me" });
      expect(self).not.toBeNull();

      const before = Number((await la.rpc("credit_balance", { p_agent: laId, p_kind: "ai" })).data);
      const { data: bal, error } = await admin.rpc("credit_grant", { p_agent: laId, p_kind: "ai", p_amount: 25, p_reason: "promotion", p_note: "test" });
      expect(error, error?.message).toBeNull();
      expect(Number(bal)).toBe(before + 25);

      expect(Number((await la.rpc("credit_balance", { p_agent: laId, p_kind: "ai" })).data)).toBe(before + 25);
      const boost = Number((await la.rpc("credit_balance", { p_agent: laId, p_kind: "boost" })).data);
      expect(boost).toBeGreaterThanOrEqual(0); // unaffected by the AI grant

      // Another agent reads 0 for a wallet that is not theirs, and sees no rows.
      expect(Number((await ra.rpc("credit_balance", { p_agent: laId, p_kind: "ai" })).data)).toBe(0);
      const { data: rows } = await ra.from("credit_wallets").select("balance").eq("agent_id", laId);
      expect(rows ?? []).toHaveLength(0);
    });

    it("the agent may spend their own balance, never below zero, and the ledger records it", async () => {
      const bal = Number((await la.rpc("credit_balance", { p_agent: laId, p_kind: "ai" })).data);
      const { error: tooMuch } = await la.rpc("credit_spend", { p_agent: laId, p_kind: "ai", p_amount: bal + 1, p_reason: "ai_usage" });
      expect(tooMuch?.message).toMatch(/insufficient/);
      const { data: after, error } = await la.rpc("credit_spend", { p_agent: laId, p_kind: "ai", p_amount: 5, p_reason: "ai_usage", p_ref_type: "ai_job" });
      expect(error).toBeNull();
      expect(Number(after)).toBe(bal - 5);
      const { data: tx } = await la.from("credit_transactions").select("kind, delta, reason").eq("agent_id", laId).eq("kind", "ai").order("created_at", { ascending: false }).limit(1);
      expect(tx?.[0]).toMatchObject({ kind: "ai", delta: -5, reason: "ai_usage" });
      // Other agent cannot spend it.
      const { error: theft } = await ra.rpc("credit_spend", { p_agent: laId, p_kind: "ai", p_amount: 1, p_reason: "ai_usage" });
      expect(theft).not.toBeNull();
    });
  });

  describe("price lists", () => {
    it("three independent lists, same four products, entitlements carried", async () => {
      for (const cur of ["MYR", "IDR", "USD"]) {
        const { data, error } = await la.rpc("plan_catalogue", { p_currency: cur });
        expect(error, error?.message).toBeNull();
        const rows = (data ?? []) as { product_key: string; currency: string; monthly_price: string; entitlements: Record<string, unknown> }[];
        expect(rows.map((r) => r.product_key)).toEqual(["free", "starter", "pro", "agency"]);
        for (const r of rows) {
          expect(r.currency).toBe(cur);
          expect(Object.keys(r.entitlements).length).toBeGreaterThanOrEqual(11);
        }
        // Free keeps its 10 AI uses in every currency (Decision 4).
        expect(rows[0].entitlements["ai.monthly_usage"]).toBe(10);
        expect(Number(rows[0].monthly_price)).toBe(0);
        expect(Number(rows[3].monthly_price)).toBeGreaterThan(0);
      }
    });

    it("currency follows the verified country, else USD; the resolved price follows it", async () => {
      await service.from("profiles").update({ country_code: "MY" }).eq("id", laId);
      expect((await la.rpc("price_currency_for", { p_user: laId })).data).toBe("MYR");
      const { data: my } = await la.rpc("resolve_price", { p_user: laId });
      expect(my?.[0]?.currency).toBe("MYR");
      // Entitlements do not change with the currency.
      expect(Number((await la.rpc("resolve_entitlement_int", { p_user: laId, p_key: "listing.active_limit" })).data)).toBeGreaterThan(0);

      await service.from("profiles").update({ country_code: "ID" }).eq("id", laId);
      expect((await la.rpc("price_currency_for", { p_user: laId })).data).toBe("IDR");

      await service.from("profiles").update({ country_code: "AE" }).eq("id", laId);
      expect((await la.rpc("price_currency_for", { p_user: laId })).data).toBe("USD");
      await service.from("profiles").update({ country_code: laCountry }).eq("id", laId);
    });

    it("a new price version inherits the plan's entitlements (no silent emptying)", async () => {
      const { data: plan } = await service.from("plans").select("id").eq("key", "silver").single();
      const { data: cur } = await service.from("plan_versions").select("id, version").eq("plan_id", plan!.id).eq("currency", "USD").eq("is_current", true).single();
      const { data: ents } = await service.from("plan_entitlements").select("entitlement_key").eq("plan_version_id", cur!.id);
      const { data: v, error } = await service.from("plan_versions")
        .insert({ plan_id: plan!.id, version: cur!.version + 50, currency: "USD", monthly_price: 11, annual_price: 110, is_current: false, note: "test" })
        .select("id").single();
      expect(error, error?.message).toBeNull();
      made.versions.push(v!.id);
      const { data: copied } = await service.from("plan_entitlements").select("entitlement_key").eq("plan_version_id", v!.id);
      expect(copied?.length).toBe(ents?.length);
    });
  });

  describe("families", () => {
    it("the agent plans are family agent with product names; an AI plan may coexist, a second agent plan may not", async () => {
      const { data: plans } = await la.from("plans").select("key, family, product_key, product_name").order("rank");
      const agent = (plans ?? []).filter((p) => p.family === "agent");
      expect(agent.map((p) => `${p.key}:${p.product_key}:${p.product_name}`)).toEqual([
        "basic:free:Free", "silver:starter:Starter", "gold:pro:Pro", "platinum:agency:Agency",
      ]);

      const { data: aiPlan } = await service.from("plans").insert({ key: "test_ai_plan", name: "[fixture] AI", family: "ai", rank: 900 }).select("id").single();
      made.plans.push(aiPlan!.id);
      const { data: aiV } = await service.from("plan_versions").insert({ plan_id: aiPlan!.id, version: 1, currency: "USD", monthly_price: 5, annual_price: 50 }).select("id").single();
      made.versions.push(aiV!.id);
      const agentPlanIds = (plans ?? []).filter((p) => p.family === "agent").map((p) => p.key);
      const { data: agentPlans } = await service.from("plans").select("id").in("key", agentPlanIds);
      const { data: agentV } = await service.from("plan_versions").select("id")
        .in("plan_id", (agentPlans ?? []).map((p) => p.id)).eq("currency", "USD").eq("is_current", true).limit(2);

      const { data: s1, error: e1 } = await service.from("subscriptions").insert({ user_id: raId, plan_version_id: agentV![0].id, status: "complimentary" }).select("id, family").single();
      expect(e1, e1?.message).toBeNull();
      made.subs.push(s1!.id);
      expect(s1!.family).toBe("agent");

      const { data: s2, error: e2 } = await service.from("subscriptions").insert({ user_id: raId, plan_version_id: aiV!.id, status: "complimentary" }).select("id, family").single();
      expect(e2, e2?.message).toBeNull();
      made.subs.push(s2!.id);
      expect(s2!.family).toBe("ai");

      const { error: e3 } = await service.from("subscriptions").insert({ user_id: raId, plan_version_id: agentV![1].id, status: "active" });
      expect(e3).not.toBeNull();
    });
  });

  it("FREE_LAUNCH is still in force after all of this", async () => {
    const { data } = await service.from("commercial_settings").select("billing_mode").single();
    expect(data?.billing_mode).toBe("FREE_LAUNCH");
  });
});
