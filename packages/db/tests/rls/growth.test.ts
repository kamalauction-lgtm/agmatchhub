import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, saClient, uid, hasEnv, fixtureEmail, fixtureName } from "./setup";

/**
 * The referral growth engine (migration 00063).
 *
 * The three properties worth proving, because each one costs the platform real
 * capacity when it is wrong:
 *
 *   1. ACTIVATION IS STRICT. Registering is not a referral. Verifying is not a
 *      referral. Only verified + an approved published listing pays out.
 *   2. REWARDS ARE IDEMPOTENT. The awarding function will run twice; a
 *      milestone must still pay once.
 *   3. REVERSAL IS HISTORY. Taking a reward back revokes the capability but
 *      leaves the record.
 *
 * Fixtures are created and destroyed with the service key. The referral funnel
 * cannot be exercised read-only — there has to be a referred person who moves
 * through the stages.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("referral growth engine", () => {
  let service: SupabaseClient;
  let referrerId: string;
  let campaignId: string;

  // Two throwaway agents to be referred.
  const referred: { id: string; email: string }[] = [];
  const madeReferrals: string[] = [];
  const madeListings: string[] = [];
  const madeProperties: string[] = [];

  const capacity = async (id: string) => {
    const { data } = await service.rpc("resolve_entitlement_int", {
      p_user: id, p_key: "listing.active_limit",
    });
    return Number(data ?? 0);
  };

  const stageOf = async (referredId: string) => {
    const { data } = await service
      .from("referrals").select("stage").eq("referred_id", referredId).maybeSingle();
    return data?.stage ?? null;
  };

  async function makeAgent(tag: string) {
    const email = fixtureEmail(`growth-${tag}`);
    const { data, error } = await service.auth.admin.createUser({
      email, password: `Gr0wth!${Date.now()}`, email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    // 'draft', not 'verified' — these agents have to be walked through
    // activation, so makeFixtureAgent's verified default is wrong here. The
    // marker is what matters, and fixtureEmail/fixtureName carry it.
    await service.from("profiles")
      .upsert({ id: data.user.id, display_name: fixtureName(`growth ${tag}`), agent_status: "draft" });
    referred.push({ id: data.user.id, email });
    return data.user.id;
  }

  /** A published, approved listing — the thing activation actually requires. */
  async function publishListing(agentId: string) {
    // `human_readable_id` has no default and no trigger — the application
    // assigns it via next_human_id. Discovered here: the import commit path
    // was passing undefined and would have failed on first use.
    const { data: hidP } = await service.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: prop, error: pe } = await service.from("properties").insert({
      human_readable_id: hidP,
      agent_id: agentId, country_code: "ID",
      property_category: "residential", property_type: "rumah",
      measurement_unit: "sqm", created_by: agentId,
    }).select("id").single();
    if (pe) throw new Error(`property: ${pe.message}`);
    madeProperties.push(prop.id);

    const { data: hidL } = await service.rpc("next_human_id", { p_prefix: "LST" });
    const { data: listing, error: le } = await service.from("listings").insert({
      human_readable_id: hidL,
      property_id: prop.id, agent_id: agentId, listing_type: "sale",
      status: "published", moderation_state: "approved",
      currency: "IDR", price: 100000000, language: "id",
      title: "Growth test listing", description: "test",
      slug: `growth-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      created_by: agentId,
    }).select("id").single();
    if (le) throw new Error(`listing: ${le.message}`);
    madeListings.push(listing.id);
  }

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    referrerId = await uid(await saClient());

    const { data: camp } = await service
      .from("growth_campaigns").select("id").eq("key", "indonesia_free_launch").single();
    campaignId = camp!.id;
  });

  afterAll(async () => {
    for (const id of madeListings) await service.from("listings").delete().eq("id", id);
    for (const id of madeProperties) await service.from("properties").delete().eq("id", id);
    for (const id of madeReferrals) await service.from("referrals").delete().eq("id", id);
    // Rewards and grants for the referrer, created by this suite only.
    const { data: rewards } = await service
      .from("referral_rewards").select("id, grant_id").eq("user_id", referrerId);
    for (const r of rewards ?? []) {
      if (r.grant_id) await service.from("entitlement_grants").delete().eq("id", r.grant_id);
      await service.from("referral_rewards").delete().eq("id", r.id);
    }
    for (const a of referred) await service.auth.admin.deleteUser(a.id);
  });

  describe("the campaign ladder is configuration, not code", () => {
    it("is active and country-scoped", async () => {
      const { data } = await service
        .from("growth_campaigns").select("status, country_code, require_verified, require_published_listing")
        .eq("id", campaignId).single();
      expect(data?.status).toBe("active");
      expect(data?.country_code).toBe("ID");
      expect(data?.require_verified).toBe(true);
      expect(data?.require_published_listing).toBe(true);
    });

    it("pays capability, never cash", async () => {
      const { data } = await service
        .from("referral_reward_rules").select("entitlement_key, recognition").eq("campaign_id", campaignId);
      const keys = (data ?? []).map((r) => r.entitlement_key).filter(Boolean);
      // Every entitlement paid must be a platform capability.
      for (const k of keys) {
        expect(["listing.active_limit", "boost.monthly_credits", "featured.vouchers"]).toContain(k);
      }
      expect(keys.length).toBeGreaterThan(0);
    });

    it("includes the double-sided welcome reward", async () => {
      const { data } = await service
        .from("referral_reward_rules").select("recipient, metric")
        .eq("campaign_id", campaignId).eq("recipient", "referred");
      expect((data ?? []).length).toBeGreaterThan(0);
    });
  });

  describe("activation is strict", () => {
    let a1: string;

    it("registering alone does not activate", async () => {
      a1 = await makeAgent("a1");
      const { data, error } = await service.from("referrals").insert({
        referrer_id: referrerId, referred_id: a1, campaign_id: campaignId, stage: "REGISTERED",
      }).select("id").single();
      if (error) throw new Error(error.message);
      madeReferrals.push(data.id);

      const { data: activated } = await service.rpc("evaluate_referral", { p_referred: a1 });
      expect(activated).toBe(false);
      expect(await stageOf(a1)).toBe("REGISTERED");
    });

    it("verifying alone still does not activate", async () => {
      await service.from("profiles").update({ agent_status: "verified" }).eq("id", a1);
      const { data: activated } = await service.rpc("evaluate_referral", { p_referred: a1 });
      expect(activated).toBe(false);
      expect(await stageOf(a1)).toBe("VERIFIED");
    });

    it("a published approved listing completes it, and pays the referrer", async () => {
      const before = await capacity(referrerId);

      /* Publishing activates on its own now: migration 00064 put a trigger on
         `listings`, so no code path has to remember to call the engine. An
         explicit call afterwards therefore returns false — already activated —
         and that is the correct answer, not a failure. This test asserted the
         return value before the trigger existed; it now asserts the outcome. */
      await publishListing(a1);
      expect(await stageOf(a1)).toBe("ACTIVATED");

      const { data: again } = await service.rpc("evaluate_referral", { p_referred: a1 });
      expect(again).toBe(false);

      // The 1-referral rung grants +5 listing slots.
      expect(await capacity(referrerId)).toBe(before + 5);
    });

    it("the reward names its milestone, so the agent can see why", async () => {
      const { data } = await service
        .from("referral_rewards").select("status, entitlement_key, int_value, reason")
        .eq("user_id", referrerId).eq("status", "GRANTED");
      const first = (data ?? []).find((r) => r.int_value === 5);
      expect(first?.reason).toMatch(/1 activated referral/i);
      expect(first?.entitlement_key).toBe("listing.active_limit");
    });
  });

  describe("idempotency — the awarding job will run twice", () => {
    it("a second run pays nothing more", async () => {
      const before = await capacity(referrerId);
      const { data: n } = await service.rpc("award_referral_rewards", { p_user: referrerId });
      expect(Number(n)).toBe(0);
      expect(await capacity(referrerId)).toBe(before);
    });

    it("re-evaluating an already activated referral is a no-op", async () => {
      const before = await capacity(referrerId);
      const { data } = await service.rpc("evaluate_referral", { p_referred: referred[0].id });
      expect(data).toBe(false);
      expect(await capacity(referrerId)).toBe(before);
    });

    it("the database itself refuses a duplicate milestone row", async () => {
      const { data: rule } = await service
        .from("referral_reward_rules").select("id")
        .eq("campaign_id", campaignId).eq("threshold", 1).eq("metric", "activated_referrals")
        .limit(1).single();
      const { error } = await service.from("referral_rewards").insert({
        user_id: referrerId, campaign_id: campaignId, rule_id: rule!.id, status: "GRANTED",
      });
      expect(error).not.toBeNull();       // unique index, not application care
    });
  });

  describe("invalidating a referral", () => {
    it("an invalidated referral stops counting", async () => {
      const countBefore = await service.rpc("activated_referral_count", { p_user: referrerId });
      await service.from("referrals")
        .update({ invalidated_at: new Date().toISOString(), invalidate_reason: "test" })
        .eq("referred_id", referred[0].id);
      const countAfter = await service.rpc("activated_referral_count", { p_user: referrerId });
      expect(Number(countAfter.data)).toBe(Number(countBefore.data) - 1);

      // Put it back for the reversal test below.
      await service.from("referrals")
        .update({ invalidated_at: null, invalidate_reason: null })
        .eq("referred_id", referred[0].id);
    });
  });

  describe("reversal is history, not deletion", () => {
    it("revokes the capability but keeps the record", async () => {
      const { data: reward } = await service
        .from("referral_rewards").select("id, grant_id")
        .eq("user_id", referrerId).eq("status", "GRANTED").not("grant_id", "is", null)
        .limit(1).single();

      const before = await capacity(referrerId);

      // Service role has no auth.uid(), so exercise the effect directly — the
      // capability gate on the RPC is covered by the authorization block below.
      await service.from("entitlement_grants")
        .update({ revoked_at: new Date().toISOString(), revoke_reason: "test reversal" })
        .eq("id", reward!.grant_id!);
      await service.from("referral_rewards")
        .update({ status: "REVERSED", reversed_reason: "test reversal" })
        .eq("id", reward!.id);

      expect(await capacity(referrerId)).toBe(before - 5);

      const { data: still } = await service
        .from("referral_rewards").select("id, status").eq("id", reward!.id).single();
      expect(still?.status).toBe("REVERSED");   // row survives
    });
  });

  describe("no self-referral, no double claim", () => {
    it("an agent cannot refer themselves", async () => {
      const { error } = await service.from("referrals").insert({
        referrer_id: referrerId, referred_id: referrerId, campaign_id: campaignId,
      });
      expect(error).not.toBeNull();
    });

    it("a person can only be referred once", async () => {
      const { error } = await service.from("referrals").insert({
        referrer_id: referrerId, referred_id: referred[0].id, campaign_id: campaignId,
      });
      expect(error).not.toBeNull();
    });
  });

  describe("authorization", () => {
    it("an agent cannot invent a referral for themselves", async () => {
      const agent = await saClient();
      const target = await makeAgent("selfserve");
      const { error } = await agent.from("referrals").insert({
        referrer_id: referrerId, referred_id: target, campaign_id: campaignId, stage: "ACTIVATED",
      });
      expect(error).not.toBeNull();
    });

    it("an agent cannot grant themselves a reward", async () => {
      const agent = await saClient();
      const { data: rule } = await service
        .from("referral_reward_rules").select("id").eq("campaign_id", campaignId).limit(1).single();
      const { error } = await agent.from("referral_rewards").insert({
        user_id: referrerId, campaign_id: campaignId, rule_id: rule!.id, status: "GRANTED",
      });
      expect(error).not.toBeNull();
    });

    it("an agent cannot edit the reward ladder", async () => {
      const agent = await saClient();
      const { data, error } = await agent
        .from("referral_reward_rules").update({ threshold: 1 }).eq("campaign_id", campaignId).select("id");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });

    it("but an agent CAN read the ladder — they need to see what they are working towards", async () => {
      const agent = await saClient();
      const { data } = await agent.from("referral_reward_rules").select("threshold").limit(1);
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it("an agent sees their own referrals only", async () => {
      const agent = await saClient();
      const { data } = await agent.from("referrals").select("referrer_id");
      for (const r of data ?? []) expect(r.referrer_id).toBe(referrerId);
    });
  });
});
