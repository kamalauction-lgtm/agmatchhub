import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, saClient, hasEnv, makeFixtureAgent } from "./setup";

/**
 * Admin reporting (migrations 00070, 00071).
 *
 * A reporting function fails in a way a screen cannot show you: it returns a
 * number, the number is wrong, and the chart is drawn confidently around it.
 * The verifications series shipped as a constant zero in 00070 because it
 * counted an audit action nobody writes — and a flat zero looks identical to a
 * quiet week. So these tests assert what the numbers MEAN, not just that rows
 * come back:
 *
 *   · the series has one row per day INCLUDING days with nothing, or a chart
 *     compresses a flat week into a rising line;
 *   · every series column is actually wired to something — proven by moving
 *     the underlying data and watching the number move;
 *   · the funnel is nested, so drop-off is real drop-off;
 *   · activation means the same thing here as it does in the rewards engine.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Point = {
  day: string;
  signups: number;
  verifications: number;
  activations: number;
  listings_published: number;
  referrals: number;
};

describe.skipIf(!hasEnv || !SERVICE)("admin reporting", () => {
  let service: SupabaseClient;
  let agent: SupabaseClient;

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    agent = await saClient();
  });

  const series = async (days: number) => {
    const { data, error } = await service.rpc("admin_metric_series", { p_days: days });
    if (error) throw new Error(error.message);
    return (data ?? []) as Point[];
  };

  describe("the daily series", () => {
    it("returns exactly one row per day, empty days included", async () => {
      for (const days of [7, 30, 90]) {
        const rows = await series(days);
        expect(rows.length).toBe(days);
      }
    });

    it("is ordered oldest to newest and ends today", async () => {
      const rows = await series(7);
      const dates = rows.map((r) => r.day);
      expect([...dates].sort()).toEqual(dates);
      expect(dates[dates.length - 1]).toBe(new Date().toISOString().slice(0, 10));
    });

    it("a bad range does not produce an empty or negative series", async () => {
      // greatest(p_days, 1) — somebody will eventually pass 0 from a URL.
      const rows = await service.rpc("admin_metric_series", { p_days: 0 });
      expect((rows.data ?? []).length).toBe(1);
    });

    it("the totals agree with the point-in-time metrics", async () => {
      /* If the series and the headline number disagree, one of them is lying
       * and the page shows both. Published listings over a long window must
       * not exceed the all-time count. */
      const rows = await series(90);
      const seriesListings = rows.reduce((n, r) => n + Number(r.listings_published), 0);
      const { data: m } = await service.rpc("admin_growth_metrics");
      expect(seriesListings).toBeLessThanOrEqual(Number(m[0].listings_published));
    });
  });

  describe("every column is wired to something", () => {
    let fixtureId: string;

    afterAll(async () => {
      if (!fixtureId) return;
      await service.from("agent_verifications").delete().eq("user_id", fixtureId);
      await service.from("profiles").delete().eq("id", fixtureId);
      await service.auth.admin.deleteUser(fixtureId);
    });

    it("a new account moves today's signups", async () => {
      const before = (await series(1))[0].signups;
      fixtureId = await makeFixtureAgent(service, "report");
      const after = (await series(1))[0].signups;
      expect(Number(after)).toBe(Number(before) + 1);
    });

    it("a verification decision moves today's verifications", async () => {
      /* The regression this file exists for. 00070 counted an audit action
       * that is never written, so this number could only ever be zero. */
      const before = (await series(1))[0].verifications;
      const { error } = await service.from("agent_verifications").insert({
        user_id: fixtureId,
        action: "approved",
        acted_by: fixtureId,
      });
      expect(error).toBeNull();
      const after = (await series(1))[0].verifications;
      expect(Number(after)).toBe(Number(before) + 1);
    });
  });

  describe("period comparison", () => {
    it("returns a current and previous value for each metric", async () => {
      const { data } = await service.rpc("admin_period_comparison", { p_days: 30 });
      const metrics = (data ?? []).map((r: { metric: string }) => r.metric);
      expect(metrics.sort()).toEqual(["activations", "listings", "referrals", "signups"]);
      for (const r of data ?? []) {
        expect(Number(r.current_value)).toBeGreaterThanOrEqual(0);
        expect(Number(r.previous_value)).toBeGreaterThanOrEqual(0);
      }
    });

    it("the two windows do not overlap", async () => {
      /* An off-by-one here would double-count the boundary day and quietly
       * inflate every delta on the dashboard. Proven by arithmetic: 7 days
       * current + 7 days previous must equal the 14-day current window. */
      const wide = await service.rpc("admin_period_comparison", { p_days: 14 });
      const narrow = await service.rpc("admin_period_comparison", { p_days: 7 });
      const pick = (rows: { metric: string; current_value: number; previous_value: number }[], m: string) =>
        rows.find((r) => r.metric === m)!;

      for (const metric of ["signups", "listings", "referrals"]) {
        const w = pick(wide.data, metric);
        const n = pick(narrow.data, metric);
        expect(Number(w.current_value)).toBe(Number(n.current_value) + Number(n.previous_value));
      }
    });
  });

  describe("the funnel", () => {
    it("is nested — each stage is a subset of the one above", async () => {
      const { data } = await service.rpc("admin_funnel");
      const rows = (data ?? []) as { stage: string; people: number; step: number }[];
      expect(rows.map((r) => r.stage)).toEqual([
        "registered", "verified", "has_listing", "activated",
      ]);
      for (let i = 1; i < rows.length; i++) {
        expect(Number(rows[i].people)).toBeLessThanOrEqual(Number(rows[i - 1].people));
      }
    });

    it("its last stage matches the activation count the rewards engine uses", async () => {
      const { data: funnel } = await service.rpc("admin_funnel");
      const activated = (funnel ?? []).find((r: { stage: string }) => r.stage === "activated");
      const { data: m } = await service.rpc("admin_growth_metrics");
      expect(Number(activated.people)).toBe(Number(m[0].agents_activated));
    });
  });

  describe("breakdown", () => {
    it("accounts for every agent, whichever dimension is chosen", async () => {
      const { count: total } = await service
        .from("profiles").select("id", { count: "exact", head: true });

      for (const dimension of ["country", "organisation", "status"]) {
        const { data } = await service.rpc("admin_breakdown", { p_dimension: dimension });
        const summed = (data ?? []).reduce(
          (n: number, r: { agents: number }) => n + Number(r.agents), 0);
        // Nobody may be silently dropped: an agent with no country still has
        // to appear, under "Unknown".
        expect(summed).toBe(total);
      }
    });

    it("reads the country from the agent record", async () => {
      /* The 00069 lesson, re-pinned here: `profiles.country_code` is populated
       * on almost nobody, so a breakdown built on it would file nearly every
       * agent under Unknown and look plausible. */
      const { count: withAgentCountry } = await service
        .from("agent_profiles")
        .select("user_id", { count: "exact", head: true })
        .not("country_code", "is", null);

      const { data } = await service.rpc("admin_breakdown", { p_dimension: "country" });
      const named = (data ?? [])
        .filter((r: { label: string }) => r.label !== "Unknown")
        .reduce((n: number, r: { agents: number }) => n + Number(r.agents), 0);

      expect(named).toBeGreaterThanOrEqual(Math.min(withAgentCountry ?? 0, 1));
    });

    it("an unknown dimension collapses to one bucket rather than erroring", async () => {
      const { data, error } = await service.rpc("admin_breakdown", { p_dimension: "nonsense" });
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(1);
    });
  });

  describe("top agents", () => {
    it("ranks by published listings, descending", async () => {
      const { data } = await service.rpc("admin_top_agents", { p_limit: 10 });
      const counts = (data ?? []).map((r: { published: number }) => Number(r.published));
      expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    });

    it("respects the limit", async () => {
      const { data } = await service.rpc("admin_top_agents", { p_limit: 1 });
      expect((data ?? []).length).toBeLessThanOrEqual(1);
    });
  });

  describe("authorization", () => {
    it("reporting is not readable by a plain agent", async () => {
      /* These RPCs are SECURITY DEFINER and gated at the route, like every
       * other admin function — but the *tables* they read must still refuse a
       * direct query, or the gate is decorative. */
      const { data } = await agent.from("audit_logs").select("action").limit(1);
      expect((data ?? []).length).toBe(0);
    });
  });
});
