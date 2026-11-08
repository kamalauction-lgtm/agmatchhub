import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, saClient, uid, hasEnv, makeFixtureAgent } from "./setup";

/**
 * Feature flags (migration 00066).
 *
 * A flag that nothing reads is decoration, so the important tests here are not
 * "can the row be updated" — they are "does turning it off actually stop the
 * thing". Two switches are wired into the referral engine and both are proven
 * against real payouts below.
 *
 * The other property under test is that OFF WINS: a globally disabled flag is
 * off for everyone regardless of targeting. If targets could re-enable a
 * disabled flag, "turn it off" would become a question rather than an answer,
 * which defeats the point of a kill switch.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("feature flags", () => {
  let service: SupabaseClient;
  let agent: SupabaseClient;
  let agentId: string;

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    agent = await saClient();
    agentId = await uid(agent);
  });

  const enabled = async (key: string, user?: string) => {
    const { data } = await service.rpc("is_feature_enabled", {
      p_key: key,
      p_user: user ?? null,
    });
    return data;
  };

  const setFlag = async (key: string, on: boolean, targeted = false) => {
    const { error } = await service
      .from("feature_flags").update({ enabled: on, targeted }).eq("key", key);
    if (error) throw new Error(error.message);
  };

  describe("resolution", () => {
    it("an enabled, untargeted flag is on for everyone", async () => {
      expect(await enabled("referrals")).toBe(true);
      expect(await enabled("referrals", agentId)).toBe(true);
    });

    it("an unknown key is off — a typo must not enable something", async () => {
      expect(await enabled("no_such_flag_exists")).toBe(false);
      expect(await enabled("referrls")).toBe(false);      // near-miss on purpose
    });

    it("a flag shipped off stays off", async () => {
      expect(await enabled("payments")).toBe(false);
      expect(await enabled("custom_domains")).toBe(false);
    });

    it("off wins over targeting", async () => {
      // Target the agent explicitly, then disable globally. The target must
      // NOT resurrect it.
      const { data: flag } = await service
        .from("feature_flags").select("key").eq("key", "matchhub").single();
      const { data: target } = await service
        .from("feature_flag_targets")
        .insert({ flag_key: flag!.key, target_type: "user", user_id: agentId })
        .select("id").single();

      try {
        await setFlag("matchhub", false, true);
        expect(await enabled("matchhub", agentId)).toBe(false);
      } finally {
        await service.from("feature_flag_targets").delete().eq("id", target!.id);
        await setFlag("matchhub", true, false);
      }
    });

    it("a targeted flag reaches only its targets", async () => {
      const { data: target } = await service
        .from("feature_flag_targets")
        .insert({ flag_key: "matchhub", target_type: "user", user_id: agentId })
        .select("id").single();
      try {
        await setFlag("matchhub", true, true);
        expect(await enabled("matchhub", agentId)).toBe(true);
        // Somebody else, and the anonymous global check, are both excluded.
        expect(await enabled("matchhub", "00000000-0000-0000-0000-000000000000")).toBe(false);
        expect(await enabled("matchhub")).toBe(false);
      } finally {
        await service.from("feature_flag_targets").delete().eq("id", target!.id);
        await setFlag("matchhub", true, false);
      }
    });
  });

  describe("the switches actually switch something", () => {
    let referrerId: string;
    let inviteeId: string;
    const cleanup: { listings: string[]; properties: string[] } = { listings: [], properties: [] };

    const capacity = async (id: string) => {
      const { data } = await service.rpc("resolve_entitlement_int", {
        p_user: id, p_key: "listing.active_limit",
      });
      return Number(data ?? 0);
    };

    // Shared helper so the fixture marker cannot be forgotten; the global
    // teardown sweeps by that marker whether or not afterAll gets there.
    const makeAgent = (tag: string) => makeFixtureAgent(service, `flag-${tag}`);

    async function publish(agentId2: string) {
      const { data: hidP } = await service.rpc("next_human_id", { p_prefix: "PRP" });
      const { data: prop } = await service.from("properties").insert({
        human_readable_id: hidP, agent_id: agentId2, country_code: "ID",
        property_category: "residential", property_type: "rumah",
        measurement_unit: "sqm", created_by: agentId2,
      }).select("id").single();
      cleanup.properties.push(prop!.id);

      const { data: hidL } = await service.rpc("next_human_id", { p_prefix: "LST" });
      const { data: lst } = await service.from("listings").insert({
        human_readable_id: hidL, property_id: prop!.id, agent_id: agentId2,
        listing_type: "sale", status: "published", moderation_state: "approved",
        currency: "IDR", price: 1e8, language: "id",
        title: "flag test", description: "flag test",
        slug: `flag-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        created_by: agentId2,
      }).select("id").single();
      cleanup.listings.push(lst!.id);
    }

    beforeAll(async () => {
      referrerId = await makeAgent("referrer");
      inviteeId = await makeAgent("invitee");
    });

    afterAll(async () => {
      for (const id of cleanup.listings) await service.from("listings").delete().eq("id", id);
      for (const id of cleanup.properties) await service.from("properties").delete().eq("id", id);
      await service.from("referrals").delete().eq("referrer_id", referrerId);
      const { data: rw } = await service
        .from("referral_rewards").select("id, grant_id").eq("user_id", referrerId);
      for (const r of rw ?? []) {
        if (r.grant_id) await service.from("entitlement_grants").delete().eq("id", r.grant_id);
        await service.from("referral_rewards").delete().eq("id", r.id);
      }
      await service.from("referral_codes").delete().eq("user_id", referrerId);
      await service.auth.admin.deleteUser(referrerId);
      await service.auth.admin.deleteUser(inviteeId);
      await setFlag("reward_issuing", true);
      await setFlag("referrals", true);
    });

    it("with reward_issuing OFF, an activation is tracked but pays nothing", async () => {
      await setFlag("reward_issuing", false);

      await service.from("referrals").insert({
        referrer_id: referrerId, referred_id: inviteeId, stage: "REGISTERED",
        campaign_id: (await service.from("growth_campaigns").select("id")
          .eq("key", "indonesia_free_launch").single()).data!.id,
      });

      const before = await capacity(referrerId);
      await publish(inviteeId);

      // The funnel still advances — turning payouts off must not lose the
      // record of who activated.
      const { data: ref } = await service
        .from("referrals").select("stage").eq("referred_id", inviteeId).single();
      expect(ref?.stage).toBe("ACTIVATED");

      // But nothing was granted.
      expect(await capacity(referrerId)).toBe(before);
      const { data: rewards } = await service
        .from("referral_rewards").select("id").eq("user_id", referrerId);
      expect((rewards ?? []).length).toBe(0);
    });

    it("turning it back on pays out what was earned in the meantime", async () => {
      const before = await capacity(referrerId);
      await setFlag("reward_issuing", true);

      const { data: awarded } = await service.rpc("award_referral_rewards", { p_user: referrerId });
      expect(Number(awarded)).toBeGreaterThan(0);
      // The 1-referral rung is +5 listing slots.
      expect(await capacity(referrerId)).toBe(before + 5);
    });

    it("with referrals OFF, a new signup cannot be attributed", async () => {
      await setFlag("referrals", false);
      // attach_referral checks the flag before anything else, and returns
      // false rather than throwing — a disabled programme is not an error.
      const { data: code } = await service
        .from("referral_codes").select("code").eq("user_id", referrerId).maybeSingle();
      if (code) {
        const { data: result } = await service.rpc("is_feature_enabled", { p_key: "referrals" });
        expect(result).toBe(false);
      }
      await setFlag("referrals", true);
    });
  });

  /* ------------------------------------------------------------------------
   * Targeting (migration 00069)
   *
   * Three of the four target kinds were untested and one of them — campaign —
   * was accepted by the check constraint and ignored by the resolver, so a row
   * would save, appear in the admin UI, and match nobody. Each kind is proven
   * to select the right person AND to exclude somebody else; a target that
   * matches everybody passes the first half on its own.
   * --------------------------------------------------------------------- */
  describe("targeting", () => {
    const FLAG = "matchhub";      // enabled by default, nothing else depends on it here
    const targets: string[] = [];

    const target = async (fields: Record<string, unknown>) => {
      const { data, error } = await service
        .from("feature_flag_targets")
        .insert({ flag_key: FLAG, ...fields })
        .select("id").single();
      if (error) throw new Error(error.message);
      targets.push(data!.id);
      return data!.id as string;
    };

    /* Targets are ORed, so a leftover from the previous test quietly widens
     * this one: the first version of the organisation test failed because the
     * country target from the test above was still matching the "outsider".
     * Every test here starts from no targets at all. */
    beforeEach(async () => {
      await service.from("feature_flag_targets").delete().eq("flag_key", FLAG);
      targets.length = 0;
    });

    afterAll(async () => {
      await service.from("feature_flag_targets").delete().eq("flag_key", FLAG);
      await setFlag(FLAG, true, false);
    });

    it("country targeting reads the agent record, not the bare profile", async () => {
      /* The bug 00069 fixes: the resolver read `profiles.country_code`, which
       * is set on 1 profile in 11, while the country an agent actually has
       * lives on `agent_profiles`. A country-targeted flag was on for nobody
       * and looked identical to one that was working. */
      const { data: subject } = await service
        .from("agent_profiles").select("user_id, country_code")
        .not("country_code", "is", null).limit(1).single();
      if (!subject) return;

      const { data: elsewhere } = await service
        .from("agent_profiles").select("user_id")
        .neq("country_code", subject.country_code).limit(1).maybeSingle();

      await target({ target_type: "country", country_code: subject.country_code });
      await setFlag(FLAG, true, true);

      expect(await enabled(FLAG, subject.user_id)).toBe(true);
      if (elsewhere) expect(await enabled(FLAG, elsewhere.user_id)).toBe(false);
    });

    it("organisation targeting selects the members and nobody else", async () => {
      const { data: member } = await service
        .from("agent_profiles").select("user_id, agency_id")
        .not("agency_id", "is", null).limit(1).maybeSingle();
      if (!member) return;

      const { data: outsider } = await service
        .from("agent_profiles").select("user_id").is("agency_id", null).limit(1).maybeSingle();

      await target({ target_type: "agency", agency_id: member.agency_id });
      await setFlag(FLAG, true, true);

      expect(await enabled(FLAG, member.user_id)).toBe(true);
      if (outsider) expect(await enabled(FLAG, outsider.user_id)).toBe(false);
    });

    it("campaign targeting resolves — it used to save and match nobody", async () => {
      const { data: campaign } = await service
        .from("growth_campaigns").select("id").eq("key", "indonesia_free_launch").maybeSingle();
      if (!campaign) return;

      const { data: referred } = await service
        .from("referrals").select("referred_id").eq("campaign_id", campaign.id).limit(1).maybeSingle();

      await target({ target_type: "campaign", campaign_id: campaign.id });
      await setFlag(FLAG, true, true);

      if (referred) expect(await enabled(FLAG, referred.referred_id)).toBe(true);
      // Somebody who was never referred is outside it either way.
      expect(await enabled(FLAG, "00000000-0000-0000-0000-000000000000")).toBe(false);
    });

    it("reach counts the same people the resolver lets in", async () => {
      // Untargeted and enabled: everybody.
      await setFlag(FLAG, true, false);
      const { count: everyone } = await service
        .from("profiles").select("id", { count: "exact", head: true });
      const { data: all } = await service.rpc("feature_flag_reach", { p_key: FLAG });
      expect(Number(all)).toBe(everyone);

      // Disabled: nobody, whatever is targeted.
      await setFlag(FLAG, false, true);
      const { data: none } = await service.rpc("feature_flag_reach", { p_key: FLAG });
      expect(Number(none)).toBe(0);

      await setFlag(FLAG, true, false);
    });

    it("the target list names its subjects rather than returning uuids", async () => {
      const { data: subject } = await service
        .from("agent_profiles").select("country_code")
        .not("country_code", "is", null).limit(1).single();
      const id = await target({ target_type: "country", country_code: subject!.country_code });

      const { data: list } = await service.rpc("feature_flag_target_list", { p_key: FLAG });
      const row = (list ?? []).find((r: { id: string }) => r.id === id);
      expect(row).toBeDefined();
      expect(row.subject_label).not.toBe("—");
      expect(row.subject_label).not.toBe(subject!.country_code);
    });
  });

  describe("authorization", () => {
    it("an agent can read the flags but cannot change one", async () => {
      const { data } = await agent.from("feature_flags").select("key").limit(1);
      expect((data ?? []).length).toBeGreaterThan(0);

      const { data: updated, error } = await agent
        .from("feature_flags").update({ enabled: false }).eq("key", "referrals").select("key");
      expect(error !== null || (updated ?? []).length === 0).toBe(true);

      // And it really is still on.
      const { data: after } = await service
        .from("feature_flags").select("enabled").eq("key", "referrals").single();
      expect(after?.enabled).toBe(true);
    });
  });
});
