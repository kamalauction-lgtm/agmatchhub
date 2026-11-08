import { describe, it, expect } from "vitest";
import { hasEnv, raClient, saClient, adminClient, uid } from "./setup";

/**
 * Migration 00081: the AI Manager's cache and audience.
 * An agent writes and clears only their own brief; the audience list is for
 * the cron (service) and AI admins, never for an agent.
 */
describe.skipIf(!hasEnv)("AI Manager (00081)", () => {
  const today = new Date().toISOString().slice(0, 10);

  it("an agent caches, reads and clears their own brief — and nobody else's", async () => {
    const ra = await raClient();
    const sa = await saClient();
    const me = await uid(ra);
    const other = await uid(sa);

    const args = {
      p_date: today, p_locale: "id", p_source: "rules", p_paragraph: null,
      p_actions: [{ key: "newLeads", count: 1 }], p_counts_hash: "test", p_model: null,
    };
    const { error } = await ra.rpc("ai_upsert_brief", { p_user: me, ...args });
    expect(error, error?.message).toBeNull();

    const { data: mine } = await ra.from("ai_briefs").select("source").eq("user_id", me).eq("brief_date", today);
    expect(mine).toHaveLength(1);
    const { data: theirs } = await sa.from("ai_briefs").select("source").eq("user_id", me);
    expect(theirs ?? []).toHaveLength(0);

    const { error: forged } = await ra.rpc("ai_upsert_brief", { p_user: other, ...args });
    expect(forged).not.toBeNull();
    const { error: forgedClear } = await ra.rpc("ai_clear_brief", { p_user: other, p_date: today });
    expect(forgedClear).not.toBeNull();

    const { error: clearErr } = await ra.rpc("ai_clear_brief", { p_user: me, p_date: today });
    expect(clearErr).toBeNull();
    const { data: after } = await ra.from("ai_briefs").select("source").eq("user_id", me).eq("brief_date", today);
    expect(after ?? []).toHaveLength(0);
  });

  it("the brief audience is visible to an admin and empty for an agent", async () => {
    const admin = await adminClient();
    const ra = await raClient();
    const { data: forAdmin, error } = await admin.rpc("ai_brief_audience", { p_days: 365 });
    expect(error).toBeNull();
    // The test accounts have signed in today and are verified; at least RA and SA qualify.
    expect((forAdmin ?? []).length).toBeGreaterThanOrEqual(2);
    const { data: forAgent } = await ra.rpc("ai_brief_audience", { p_days: 365 });
    expect(forAgent ?? []).toHaveLength(0);
  });

  it("the AI Manager role is live and points at the dashboard", async () => {
    const ra = await raClient();
    const { data } = await ra.from("ai_roles").select("status, route").eq("key", "ai_manager").single();
    expect(data?.status).toBe("live");
    expect(data?.route).toBe("/dashboard");
  });
});
