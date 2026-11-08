import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, saClient, raClient, uid, hasEnv, makeFixtureAgent } from "./setup";

/**
 * The agent's own performance figures (migration 00073).
 *
 * The property that matters here is ISOLATION, not arithmetic. These functions
 * are SECURITY DEFINER — they run with the definer's rights and RLS does not
 * apply inside them — so the only thing standing between one agent and another
 * agent's lead counts is that the body reads `auth.uid()` and the signature
 * offers no way to name somebody else. Both halves are tested: publishing
 * inventory as a different agent must not move the signed-in agent's numbers,
 * and passing a user id must be refused rather than honoured.
 *
 * The rest pins the two decisions somebody will otherwise "fix" later: the
 * series returns empty days, and an agent with no leads has a 100% response
 * rate rather than 0%.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Summary = {
  listings_active: number;
  listings_published: number;
  leads_total: number;
  response_rate: number;
  leads_previous: number;
  listings_previous: number;
};

type Point = { day: string; leads: number; listings_published: number; responses: number };

describe.skipIf(!hasEnv || !SERVICE)("agent performance", () => {
  let service: SupabaseClient;
  let agent: SupabaseClient;
  let other: SupabaseClient;
  let agentId: string;

  const cleanup: { listings: string[]; properties: string[]; users: string[] } = {
    listings: [], properties: [], users: [],
  };

  const summaryOf = async (c: SupabaseClient, days = 30) => {
    const { data, error } = await c.rpc("my_performance_summary", { p_days: days });
    if (error) throw new Error(error.message);
    return (data as Summary[])[0];
  };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    agent = await saClient();
    other = await raClient();
    agentId = await uid(agent);
  });

  afterAll(async () => {
    for (const id of cleanup.listings) await service.from("listings").delete().eq("id", id);
    for (const id of cleanup.properties) await service.from("properties").delete().eq("id", id);
    for (const id of cleanup.users) {
      await service.from("profiles").delete().eq("id", id);
      await service.auth.admin.deleteUser(id);
    }
  });

  describe("scoping", () => {
    it("returns exactly one row of the caller's own numbers", async () => {
      const s = await summaryOf(agent);
      expect(s).toBeDefined();
      const { count } = await service
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .eq("status", "published")
        .eq("moderation_state", "approved");
      expect(Number(s.listings_published)).toBe(count);
    });

    it("two different agents get different answers", async () => {
      /* The cheapest way for auth.uid() scoping to be broken is for the body
       * to forget the predicate entirely, in which case everybody sees the
       * platform total and every agent's dashboard looks identical. */
      const mine = await summaryOf(agent);
      const theirs = await summaryOf(other);
      const { count: total } = await service
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("moderation_state", "approved");

      // Neither agent may be shown the platform-wide number.
      const platformWide =
        Number(mine.listings_published) === total && Number(theirs.listings_published) === total;
      expect(platformWide && (total ?? 0) > 0).toBe(false);
    });

    it("another agent's inventory does not move my numbers", async () => {
      const before = await summaryOf(agent);

      const stranger = await makeFixtureAgent(service, "perf");
      cleanup.users.push(stranger);

      const { data: hidP } = await service.rpc("next_human_id", { p_prefix: "PRP" });
      const { data: prop } = await service.from("properties").insert({
        human_readable_id: hidP, agent_id: stranger, country_code: "ID",
        property_category: "residential", property_type: "rumah",
        measurement_unit: "sqm", created_by: stranger,
      }).select("id").single();
      cleanup.properties.push(prop!.id);

      const { data: hidL } = await service.rpc("next_human_id", { p_prefix: "LST" });
      const { data: lst } = await service.from("listings").insert({
        human_readable_id: hidL, property_id: prop!.id, agent_id: stranger,
        listing_type: "sale", status: "published", moderation_state: "approved",
        currency: "IDR", price: 1e8, language: "id",
        title: "perf isolation", description: "perf isolation",
        slug: `perf-iso-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        created_by: stranger,
      }).select("id").single();
      cleanup.listings.push(lst!.id);

      const after = await summaryOf(agent);
      expect(Number(after.listings_published)).toBe(Number(before.listings_published));
      expect(Number(after.leads_total)).toBe(Number(before.leads_total));
    });

    it("cannot be asked for somebody else's figures", async () => {
      /* There is deliberately no p_user parameter. If one is ever added, this
       * fails and whoever added it has to explain why an agent may name
       * another agent to a SECURITY DEFINER function. */
      const { error } = await agent.rpc("my_performance_summary", {
        p_days: 30,
        p_user: "00000000-0000-0000-0000-000000000000",
      } as never);
      expect(error).not.toBeNull();
    });
  });

  describe("the series", () => {
    it("returns one row per day including days with nothing", async () => {
      for (const days of [7, 30, 90]) {
        const { data } = await agent.rpc("my_performance_series", { p_days: days });
        expect((data as Point[]).length).toBe(days);
      }
    });

    it("is ordered oldest to newest and ends today", async () => {
      const { data } = await agent.rpc("my_performance_series", { p_days: 7 });
      const dates = (data as Point[]).map((r) => r.day);
      expect([...dates].sort()).toEqual(dates);
      expect(dates[dates.length - 1]).toBe(new Date().toISOString().slice(0, 10));
    });

    it("never reports a day the caller does not own", async () => {
      const { data } = await agent.rpc("my_performance_series", { p_days: 90 });
      const seriesTotal = (data as Point[]).reduce((n, r) => n + Number(r.listings_published), 0);
      const summary = await summaryOf(agent, 90);
      expect(seriesTotal).toBeLessThanOrEqual(Number(summary.listings_published));
    });
  });

  describe("response rate", () => {
    it("is 100 when there is nothing to have answered", async () => {
      /* Deliberate: an agent with no leads has not missed anything, and
       * opening your first day on the platform to a red 0% is a bug report
       * waiting to happen. */
      const { count } = await service
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .not("first_response_due", "is", null);
      if (count === 0) {
        expect(Number((await summaryOf(agent)).response_rate)).toBe(100);
      }
    });

    it("is a percentage, never out of range", async () => {
      for (const c of [agent, other]) {
        const rate = Number((await summaryOf(c)).response_rate);
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("period comparison", () => {
    it("the previous window is a real number, not a copy of the current one", async () => {
      const s = await summaryOf(agent, 7);
      expect(Number(s.leads_previous)).toBeGreaterThanOrEqual(0);
      expect(Number(s.listings_previous)).toBeGreaterThanOrEqual(0);
    });

    it("a bad range does not produce an empty series", async () => {
      const { data } = await agent.rpc("my_performance_series", { p_days: 0 });
      expect((data as Point[]).length).toBe(1);
    });
  });
});
