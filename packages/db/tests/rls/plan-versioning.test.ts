import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, hasEnv, makeFixtureAgent } from "./setup";

/**
 * Repricing a plan, and granting capacity by hand.
 *
 * The rule under test is the one that is easy to "simplify" away later: a
 * price change creates a NEW VERSION and retires the old one. An UPDATE would
 * rewrite what every existing subscription was sold at and leave no record the
 * old number existed — which is precisely the silent rewrite the versioned-
 * immutables rule exists to prevent.
 *
 * Also covers the grant path, which was SQL-only until the admin form landed:
 * a grant adds, a revoke subtracts, and the revoked row survives.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("plan versioning and admin grants", () => {
  let service: SupabaseClient;
  let agentId: string;
  let planId: string;
  let originalVersionId: string;
  const madeVersions: string[] = [];
  const madeGrants: string[] = [];

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    // A per-run fixture, not the standing SA: concurrent runs moved the SA's
    // listing capacity under this suite (main CI, 10 Nov: 360 ≠ 355).
    agentId = await makeFixtureAgent(service, "plan-versioning", { country_code: "ID" });

    const { data: plan } = await service.from("plans").select("id").eq("key", "silver").single();
    planId = plan!.id;
    // Since 00091 a plan has one current version PER CURRENCY; this suite
    // works the IDR list, which is what the original price book was.
    const { data: v } = await service
      .from("plan_versions").select("id").eq("plan_id", planId).eq("currency", "IDR").eq("is_current", true).single();
    originalVersionId = v!.id;
  });

  afterAll(async () => {
    for (const id of madeGrants) await service.from("entitlement_grants").delete().eq("id", id);
    if (agentId) await service.auth.admin.deleteUser(agentId);
    for (const id of madeVersions) await service.from("plan_versions").delete().eq("id", id);
    // Restore the original as current, so the price book is left as found.
    await service
      .from("plan_versions")
      .update({ is_current: true, effective_until: null })
      .eq("id", originalVersionId);
  });

  /** Exactly what `repricePlan` does, so the test covers that logic. */
  async function reprice(monthly: number, annual: number, note: string) {
    const { data: current } = await service
      .from("plan_versions")
      .select("id, version, currency")
      .eq("plan_id", planId).eq("currency", "IDR").eq("is_current", true).single();

    await service
      .from("plan_versions")
      .update({ is_current: false, effective_until: new Date().toISOString() })
      .eq("id", current!.id);

    const { data, error } = await service.from("plan_versions").insert({
      plan_id: planId,
      version: current!.version + 1,
      currency: current!.currency,
      monthly_price: monthly,
      annual_price: annual,
      note,
      is_current: true,
    }).select("id, version").single();
    if (error) throw new Error(error.message);
    madeVersions.push(data.id);
    return data;
  }

  describe("repricing", () => {
    it("creates a new version instead of editing the old one", async () => {
      const { data: before } = await service
        .from("plan_versions").select("id, monthly_price").eq("id", originalVersionId).single();

      const created = await reprice(199000, 1990000, "test reprice");

      // The original row is untouched — same id, same number.
      const { data: after } = await service
        .from("plan_versions").select("id, monthly_price, is_current").eq("id", originalVersionId).single();
      expect(after!.monthly_price).toBe(before!.monthly_price);
      expect(after!.is_current).toBe(false);
      expect(created.version).toBeGreaterThan(1);
    });

    it("leaves exactly one current version per currency", async () => {
      const { data } = await service
        .from("plan_versions").select("id, currency").eq("plan_id", planId).eq("is_current", true);
      const byCurrency = new Map<string, number>();
      for (const v of data ?? []) byCurrency.set(v.currency, (byCurrency.get(v.currency) ?? 0) + 1);
      expect(byCurrency.get("IDR")).toBe(1);
      for (const n of byCurrency.values()) expect(n).toBe(1);
    });

    it("a new version carries the plan's entitlements (00092)", async () => {
      const { data: cur } = await service
        .from("plan_versions").select("id").eq("plan_id", planId).eq("currency", "IDR").eq("is_current", true).single();
      const { data: ents } = await service.from("plan_entitlements").select("entitlement_key").eq("plan_version_id", cur!.id);
      expect((ents ?? []).length).toBeGreaterThanOrEqual(11);
    });

    it("keeps the whole price history readable", async () => {
      await reprice(249000, 2490000, "second test reprice");
      const { data } = await service
        .from("plan_versions").select("version, monthly_price").eq("plan_id", planId).eq("currency", "IDR")
        .order("version");
      const prices = (data ?? []).map((v) => Number(v.monthly_price));
      // Original plus both test versions — nothing overwritten.
      expect(prices.length).toBeGreaterThanOrEqual(3);
      expect(prices).toContain(199000);
      expect(prices).toContain(249000);
    });
  });

  describe("admin grants", () => {
    const capacity = async () => {
      const { data } = await service.rpc("resolve_entitlement_int", {
        p_user: agentId, p_key: "listing.active_limit",
      });
      return Number(data ?? 0);
    };

    it("adds capacity, with a reason attached", async () => {
      const before = await capacity();
      const { data, error } = await service.from("entitlement_grants").insert({
        user_id: agentId,
        entitlement_key: "listing.active_limit",
        int_value: 40,
        source: "admin_grant",
        reason: "test: import failed, compensating",
      }).select("id, reason").single();
      if (error) throw new Error(error.message);
      madeGrants.push(data.id);

      expect(await capacity()).toBe(before + 40);
      expect(data.reason).toBeTruthy();
    });

    it("a time-limited grant expires on its own", async () => {
      const before = await capacity();
      const { data } = await service.from("entitlement_grants").insert({
        user_id: agentId,
        entitlement_key: "listing.active_limit",
        int_value: 500,
        source: "admin_grant",
        reason: "test: already expired",
        effective_from: new Date(Date.now() - 2 * 86400000).toISOString(),
        effective_until: new Date(Date.now() - 86400000).toISOString(),
      }).select("id").single();
      madeGrants.push(data!.id);
      expect(await capacity()).toBe(before);
    });

    it("revoking removes the capacity but keeps the row", async () => {
      const before = await capacity();
      const { data } = await service.from("entitlement_grants").insert({
        user_id: agentId,
        entitlement_key: "listing.active_limit",
        int_value: 15,
        source: "admin_grant",
        reason: "test: to revoke",
      }).select("id").single();
      madeGrants.push(data!.id);
      expect(await capacity()).toBe(before + 15);

      await service.from("entitlement_grants")
        .update({ revoked_at: new Date().toISOString(), revoke_reason: "test" })
        .eq("id", data!.id);

      expect(await capacity()).toBe(before);
      const { data: still } = await service
        .from("entitlement_grants").select("id, revoke_reason").eq("id", data!.id).single();
      expect(still?.revoke_reason).toBe("test");
    });

    it("a grant against an unknown entitlement key is refused", async () => {
      const { error } = await service.from("entitlement_grants").insert({
        user_id: agentId,
        entitlement_key: "listing.acive_limit",      // typo, on purpose
        int_value: 10,
        source: "admin_grant",
        reason: "test: typo",
      });
      expect(error).not.toBeNull();                   // foreign key to definitions
    });
  });
});
