import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { URL_, saClient, raClient, uid, hasEnv } from "./setup";

/**
 * Announcements (migrations 00068, 00069).
 *
 * The design decision under test is that the audience is a RULE evaluated at
 * read time, not a fan-out written at send time. Everything below follows from
 * that, and each one is a way the design could be got wrong:
 *
 *   - a draft must be invisible, including to the people it would match;
 *   - the admin's "who will see this" count and what an agent actually
 *     receives must be the same computation, or the preview is a lie;
 *   - a read receipt must remove it from ONE person's feed and leave both the
 *     announcement and everyone else's copy alone;
 *   - and an agent must not be able to read the table directly, or drafts
 *     leak before they are meant to be seen.
 */

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasEnv || !SERVICE)("announcements", () => {
  let service: SupabaseClient;
  let agent: SupabaseClient;
  let other: SupabaseClient;
  let agentId: string;
  let otherId: string;
  const made: string[] = [];

  const announce = async (fields: Record<string, unknown>) => {
    const { data, error } = await service
      .from("announcements")
      .insert({ title: "test", body: "test body", ...fields })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    made.push(data!.id);
    return data!.id as string;
  };

  const matches = async (id: string, user: string) => {
    const { data } = await service.rpc("announcement_matches", {
      p_announcement: id,
      p_user: user,
    });
    return data;
  };

  const reach = async (id: string) => {
    const { data } = await service.rpc("announcement_audience_count", { p_announcement: id });
    return Number(data ?? -1);
  };

  const feedIds = async (c: SupabaseClient) => {
    const { data, error } = await c.rpc("my_announcements");
    if (error) throw new Error(error.message);
    return (data ?? []).map((a: { id: string }) => a.id);
  };

  beforeAll(async () => {
    service = createClient(URL_, SERVICE!, { auth: { persistSession: false } });
    agent = await saClient();
    other = await raClient();
    agentId = await uid(agent);
    otherId = await uid(other);
  });

  afterAll(async () => {
    // Reads first: they reference the announcement. The FK is ON DELETE
    // CASCADE, but deleting in dependency order is the habit that stops the
    // next table without a cascade from leaving orphans in production.
    for (const id of made) {
      await service.from("announcement_reads").delete().eq("announcement_id", id);
      await service.from("announcements").delete().eq("id", id);
    }
  });

  describe("drafts", () => {
    it("a draft reaches nobody's feed, even when the rule matches them", async () => {
      const id = await announce({ audience: "all", is_published: false });

      // The rule says yes...
      expect(await matches(id, agentId)).toBe(true);
      // ...and the feed still says no, because it is not published.
      expect(await feedIds(agent)).not.toContain(id);
    });

    it("an agent cannot read the announcements table directly", async () => {
      const id = await announce({ audience: "all", is_published: false });
      const { data } = await agent.from("announcements").select("id, title").eq("id", id);
      // RLS returns an empty set rather than an error. Either way the draft
      // must not be in it.
      expect((data ?? []).length).toBe(0);
    });

    it("an agent cannot write an announcement", async () => {
      const { error } = await agent
        .from("announcements")
        .insert({ title: "self-service", body: "nope", audience: "all" });
      expect(error).not.toBeNull();
    });
  });

  describe("audience rules", () => {
    it("published, audience all: every signed-in agent gets it", async () => {
      const id = await announce({ audience: "all", is_published: true });
      expect(await feedIds(agent)).toContain(id);
      expect(await feedIds(other)).toContain(id);
    });

    it("the admin preview counts exactly the people the rule matches", async () => {
      const id = await announce({ audience: "all", is_published: true });
      const { count } = await service
        .from("profiles").select("id", { count: "exact", head: true });
      expect(await reach(id)).toBe(count);
    });

    it("verified and unverified partition the population", async () => {
      const yes = await announce({ audience: "verified", is_published: true });
      const no = await announce({ audience: "unverified", is_published: true });
      const { count: total } = await service
        .from("profiles").select("id", { count: "exact", head: true });
      expect(await reach(yes) + await reach(no)).toBe(total);
      // Nobody is in both.
      expect(await matches(yes, agentId)).toBe(!(await matches(no, agentId)));
    });

    it("country reads the agent record, not the bare profile (00069)", async () => {
      /* The bug this replaces: `announcement_matches` and `is_feature_enabled`
       * read different country columns, and the one the flags resolver used is
       * populated on 1 profile in 11. A country audience that matches nobody
       * looks exactly like a working one. */
      const { data: withCountry } = await service
        .from("agent_profiles")
        .select("user_id, country_code")
        .not("country_code", "is", null)
        .limit(1)
        .single();
      if (!withCountry) return;

      const id = await announce({
        audience: "country",
        country_code: withCountry.country_code,
        is_published: true,
      });
      expect(await matches(id, withCountry.user_id)).toBe(true);
      expect(await reach(id)).toBeGreaterThan(0);
    });

    it("a country nobody is in reaches nobody, and says so", async () => {
      const { data: unused } = await service
        .from("countries")
        .select("code")
        .not("code", "in",
          `(${(await service.from("agent_profiles").select("country_code"))
            .data!.map((r) => `"${r.country_code}"`).join(",") || '""'})`)
        .limit(1)
        .maybeSingle();
      if (!unused) return;
      const id = await announce({
        audience: "country", country_code: unused.code, is_published: true,
      });
      expect(await reach(id)).toBe(0);
    });
  });

  describe("read receipts", () => {
    it("dismissing removes it from one feed and nobody else's", async () => {
      const id = await announce({ audience: "all", is_published: true });
      expect(await feedIds(agent)).toContain(id);
      expect(await feedIds(other)).toContain(id);

      const { error } = await agent.rpc("mark_announcement_read", { p_announcement: id });
      expect(error).toBeNull();

      expect(await feedIds(agent)).not.toContain(id);
      expect(await feedIds(other)).toContain(id);
    });

    it("reading does not shrink the audience — the rule is unchanged", async () => {
      const id = await announce({ audience: "all", is_published: true });
      const before = await reach(id);
      await agent.rpc("mark_announcement_read", { p_announcement: id });
      // Reach answers "who is this for", not "who has not read it yet". If a
      // read shrank it, the admin's number would drift downward after send
      // and stop meaning anything.
      expect(await reach(id)).toBe(before);
    });

    it("dismissing twice is not an error", async () => {
      const id = await announce({ audience: "all", is_published: true });
      await agent.rpc("mark_announcement_read", { p_announcement: id });
      const { error } = await agent.rpc("mark_announcement_read", { p_announcement: id });
      expect(error).toBeNull();
    });

    it("an agent cannot forge a read receipt for somebody else", async () => {
      const id = await announce({ audience: "all", is_published: true });
      const { error } = await agent
        .from("announcement_reads")
        .insert({ announcement_id: id, user_id: otherId });
      expect(error).not.toBeNull();
      // ...and the victim's feed is untouched.
      expect(await feedIds(other)).toContain(id);
    });
  });

  describe("scheduling", () => {
    it("an announcement that has not started yet is not delivered", async () => {
      const id = await announce({
        audience: "all",
        is_published: true,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect(await feedIds(agent)).not.toContain(id);
    });

    it("an expired announcement is not delivered", async () => {
      const id = await announce({
        audience: "all",
        is_published: true,
        starts_at: new Date(Date.now() - 172_800_000).toISOString(),
        ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      });
      expect(await feedIds(agent)).not.toContain(id);
    });
  });
});
