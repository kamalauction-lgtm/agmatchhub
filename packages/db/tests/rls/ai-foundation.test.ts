import { describe, it, expect } from "vitest";
import { hasEnv, anonClient, raClient, saClient, adminClient, uid } from "./setup";

/**
 * Migrations 00078–00080: the AI ledger and its gates.
 *
 * What must hold: an agent sees routing but not prompts; an agent can ask
 * about and record for THEMSELVES only; the ledger is append-only for
 * everyone including admins; the quota resolver answers from the plan.
 *
 * Rows this file inserts into ai_jobs stay — the table is append-only by
 * design and a purge is a retention job, not a test teardown. They are
 * marked by feature 'test_fixture' so a report can exclude them.
 */
describe.skipIf(!hasEnv)("AI foundation (00078–00080)", () => {
  it("anon reaches nothing", async () => {
    const anon = anonClient();
    for (const table of ["ai_models", "ai_settings", "ai_prompts", "ai_jobs", "ai_roles", "ai_briefs"]) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("an agent reads model routing and the catalogue, not prompts", async () => {
    const ra = await raClient();
    const { data: models } = await ra.from("ai_models").select("feature").limit(1);
    expect((models ?? []).length).toBe(1);
    const { data: roles } = await ra.from("ai_roles").select("key");
    expect((roles ?? []).length).toBe(36);
    const { data: prompts } = await ra.from("ai_prompts").select("id");
    expect(prompts ?? []).toHaveLength(0);
  });

  it("an agent cannot change routing, settings or roles", async () => {
    const ra = await raClient();
    const { data: m } = await ra.from("ai_models").update({ model: "hacked" }).eq("feature", "brief").select();
    expect(m ?? []).toHaveLength(0);
    const { data: s } = await ra.from("ai_settings").update({ enabled: false }).eq("id", true).select();
    expect(s ?? []).toHaveLength(0);
    const { data: r } = await ra.from("ai_roles").update({ status: "live" }).eq("key", "ai_manager").select();
    expect(r ?? []).toHaveLength(0);
  });

  it("quota resolves from the plan and only for oneself", async () => {
    const ra = await raClient();
    const sa = await saClient();
    const me = await uid(ra);
    const other = await uid(sa);
    const { data, error } = await ra.rpc("ai_quota_status", { p_user: me });
    expect(error).toBeNull();
    const row = (Array.isArray(data) ? data[0] : data) as { monthly_allowance: number; remaining: number; enabled: boolean };
    expect(row.enabled).toBe(true);
    // The default plan during FREE_LAUNCH grants a positive allowance.
    expect(row.monthly_allowance).toBeGreaterThan(0);
    expect(row.remaining).toBeLessThanOrEqual(row.monthly_allowance);

    const { error: denied } = await ra.rpc("ai_quota_status", { p_user: other });
    expect(denied).not.toBeNull();
  });

  it("an agent records a job for themselves and never for someone else; rows are visible to owner and admin only", async () => {
    const ra = await raClient();
    const sa = await saClient();
    const admin = await adminClient();
    const me = await uid(ra);
    const other = await uid(sa);

    const args = {
      p_feature: "test_fixture", p_provider: "none", p_model: "none", p_prompt_version: 0, p_status: "denied",
      p_denied_reason: "no_provider", p_ref_type: null, p_ref_id: null, p_input_hash: null,
      p_tokens_in: 0, p_tokens_out: 0, p_cost_micros: 0, p_latency_ms: null, p_error: null,
    };
    const { data: id, error } = await ra.rpc("ai_record_job", { p_user: me, ...args });
    expect(error, error?.message).toBeNull();
    expect(id).toBeTruthy();

    const { error: forged } = await ra.rpc("ai_record_job", { p_user: other, ...args });
    expect(forged).not.toBeNull();

    const { data: mine } = await ra.from("ai_jobs").select("id").eq("id", id as string);
    expect(mine).toHaveLength(1);
    const { data: theirs } = await sa.from("ai_jobs").select("id").eq("id", id as string);
    expect(theirs ?? []).toHaveLength(0);
    const { data: seenByAdmin } = await admin.from("ai_jobs").select("id").eq("id", id as string);
    expect(seenByAdmin).toHaveLength(1);
  });

  it("the ledger is append-only, even for an admin", async () => {
    const admin = await adminClient();
    const { data: rows } = await admin.from("ai_jobs").select("id").limit(1);
    expect((rows ?? []).length).toBe(1);
    const id = rows![0].id;
    const { data: upd } = await admin.from("ai_jobs").update({ status: "ok" }).eq("id", id).select();
    expect(upd ?? []).toHaveLength(0);
    await admin.from("ai_jobs").delete().eq("id", id);
    const { data: still } = await admin.from("ai_jobs").select("id").eq("id", id);
    expect(still).toHaveLength(1);
  });

  it("the admin reporting RPCs answer the admin and refuse an agent", async () => {
    const admin = await adminClient();
    const ra = await raClient();
    const { data: daily, error } = await admin.rpc("ai_admin_daily", { p_days: 7 });
    expect(error).toBeNull();
    expect((daily ?? []).length).toBe(7);
    const { data: agentView } = await ra.rpc("ai_admin_daily", { p_days: 7 });
    expect(agentView ?? []).toHaveLength(0);
  });

  it("the new entitlement keys resolve (tier ladder knows core/workforce)", async () => {
    const ra = await raClient();
    const me = await uid(ra);
    const { data: tier } = await ra.rpc("resolve_entitlement_tier", { p_user: me, p_key: "ai.roles" });
    expect(["core", "workforce"]).toContain(tier);
    const { data: posters } = await ra.rpc("resolve_entitlement_int", { p_user: me, p_key: "ai.poster_exports_monthly" });
    expect(Number(posters)).toBeGreaterThanOrEqual(0);
  });
});
