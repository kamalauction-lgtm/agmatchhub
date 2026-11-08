import { describe, it, expect, afterAll } from "vitest";
import { hasEnv, hasPairEnv, raClient, laClient, adminClient, uid } from "./setup";

/**
 * 00098 — the rest of the AI Workforce. Facts and closing steps are read-only
 * for agents and owned by admins; checklists and weekly reviews are private
 * to their agent; the new functions answer for the caller only; every role
 * in the catalogue is live and opens somewhere.
 */
describe.skipIf(!hasEnv || !hasPairEnv)("AI Workforce complete (00098)", () => {
  const made: { checklists: string[] } = { checklists: [] };
  let touchedFact: { id: string; status: string } | null = null;

  afterAll(async () => {
    const la = await laClient();
    if (made.checklists.length) await la.from("closing_checklists").delete().in("id", made.checklists);
    const admin = await adminClient();
    if (touchedFact) await admin.from("market_facts").update({ status: touchedFact.status, verified_by: null, verified_at: null }).eq("id", touchedFact.id);
    const me = await uid(la);
    await la.rpc("ai_clear_weekly_review", { p_user: me, p_week: new Date().toISOString().slice(0, 10) });
  });

  it("every role is live and has a route; new features are routed", async () => {
    const ra = await raClient();
    const { data: roles } = await ra.from("ai_roles").select("key, status, route, feature");
    expect(roles?.length).toBe(36);
    for (const r of roles ?? []) {
      expect(r.status, r.key).toBe("live");
      expect(r.route, `${r.key} has no route`).toBeTruthy();
    }
    const { data: models } = await ra.from("ai_models").select("feature, provider").in("feature", ["social_plan", "photo_check", "translate", "crossborder_brief", "requirement_extract", "coach", "offer_summary", "weekly_review", "video_script"]);
    expect(models?.length).toBe(9);
    for (const m of models ?? []) expect(m.provider, m.feature).not.toBe("none");
  });

  it("market facts and closing steps: agents read drafts, cannot write; an admin verifies, audited", async () => {
    const ra = await raClient();
    const admin = await adminClient();
    const { data: facts, error } = await ra.from("market_facts").select("id, country_code, topic, body, status").eq("country_code", "MY");
    expect(error).toBeNull();
    expect(facts?.length).toBeGreaterThanOrEqual(10);
    for (const f of facts ?? []) for (const l of ["en", "id", "ms"]) expect((f.body as Record<string, string>)[l]?.length ?? 0, `${f.topic} ${l}`).toBeGreaterThan(20);
    const { data: steps } = await ra.from("closing_steps").select("id, country_code, transaction_type").in("country_code", ["MY", "ID"]);
    expect(steps?.length).toBeGreaterThanOrEqual(30);

    expect((await ra.from("market_facts").update({ status: "verified" }).eq("id", facts![0].id).select("id")).data ?? []).toHaveLength(0);
    expect((await ra.from("market_facts").insert({ country_code: "MY", topic: "hack", body: { en: "x" } })).error).not.toBeNull();
    expect((await ra.from("closing_steps").update({ status: "retired" }).eq("id", steps![0].id).select("id")).data ?? []).toHaveLength(0);

    touchedFact = { id: facts![0].id, status: facts![0].status };
    const { error: up } = await admin.from("market_facts").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", facts![0].id);
    expect(up).toBeNull();
    const { data: after } = await ra.from("market_facts").select("status").eq("id", facts![0].id).single();
    expect(after?.status).toBe("verified");
    // A retired fact disappears from agents.
    await admin.from("market_facts").update({ status: "retired" }).eq("id", facts![0].id);
    expect((await ra.from("market_facts").select("id").eq("id", facts![0].id)).data ?? []).toHaveLength(0);
  });

  it("closing checklists are private to their agent", async () => {
    const la = await laClient();
    const ra = await raClient();
    const me = await uid(la);
    const { data: row, error } = await la.from("closing_checklists").insert({ agent_id: me, label: "[fixture] Unit 12-3", country_code: "MY", transaction_type: "sale" }).select("id").single();
    expect(error, error?.message).toBeNull();
    made.checklists.push(row!.id);
    const { data: steps } = await la.from("closing_steps").select("id").eq("country_code", "MY").eq("transaction_type", "sale").order("position").limit(1);
    const { error: tick } = await la.from("closing_checklists").update({ done_step_ids: [steps![0].id] }).eq("id", row!.id);
    expect(tick).toBeNull();
    expect((await ra.from("closing_checklists").select("id").eq("id", row!.id)).data ?? []).toHaveLength(0);
    expect((await ra.from("closing_checklists").update({ status: "archived" }).eq("id", row!.id).select("id")).data ?? []).toHaveLength(0);
    const raId = await uid(ra);
    expect((await ra.from("closing_checklists").insert({ agent_id: me, label: "spoof", country_code: "MY", transaction_type: "rent" })).error).not.toBeNull();
    void raId;
  });

  it("weekly review: numbers for the caller, cache written only for oneself", async () => {
    const la = await laClient();
    const ra = await raClient();
    const me = await uid(la);
    const other = await uid(ra);
    const { data, error } = await la.rpc("my_weekly_review");
    expect(error, error?.message).toBeNull();
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    expect(row).toHaveProperty("leads_this");
    expect(row).toHaveProperty("peer_leads_median");
    const week = new Date().toISOString().slice(0, 10);
    const forged = await la.rpc("ai_upsert_weekly_review", { p_user: other, p_week: week, p_locale: "en", p_source: "rules", p_paragraph: null, p_metrics: {}, p_hash: "x", p_model: null, p_reason: "test" });
    expect(forged.error?.code).toBe("42501");
    const own = await la.rpc("ai_upsert_weekly_review", { p_user: me, p_week: week, p_locale: "en", p_source: "rules", p_paragraph: null, p_metrics: {}, p_hash: "x", p_model: null, p_reason: "test" });
    expect(own.error).toBeNull();
    expect((await ra.from("ai_weekly_reviews").select("user_id").eq("user_id", me)).data ?? []).toHaveLength(0);
    expect((await la.from("ai_weekly_reviews").select("user_id").eq("user_id", me).eq("week_start", week)).data?.length).toBe(1);
    expect((await la.from("ai_weekly_reviews").insert({ user_id: me, week_start: "2020-01-06", locale: "en", source: "rules" })).error).not.toBeNull();
  });

  it("refresh plan, onboarding steps, partner candidates, comparables list and owner report answer for the caller", async () => {
    const la = await laClient();
    const ra = await raClient();
    const { data: plan, error: e1 } = await la.rpc("my_refresh_plan");
    expect(e1).toBeNull();
    expect(Array.isArray(plan)).toBe(true);
    const { data: steps, error: e2 } = await la.rpc("my_onboarding_steps");
    expect(e2).toBeNull();
    expect((steps as { step: string; done: boolean }[]).map((s) => s.step)).toContain("first_published");
    expect((steps as { step: string; done: boolean }[]).find((s) => s.step === "verified")?.done).toBe(true);
    const { data: partners, error: e3 } = await la.rpc("my_partner_candidates", { p_limit: 5 });
    expect(e3).toBeNull();
    expect(Array.isArray(partners)).toBe(true);
    const { data: comps, error: e4 } = await ra.rpc("listing_comparables_list", { p_country: "ID", p_listing_type: "sale", p_property_type: "rumah", p_regency: null, p_bedrooms: null, p_exclude: null, p_limit: 5 });
    expect(e4).toBeNull();
    expect((comps as unknown[]).length).toBeGreaterThan(0);

    const { data: mine } = await la.from("listings").select("id").eq("human_readable_id", "LST-2026-900001").single();
    const { data: rep, error: e5 } = await la.rpc("my_listing_owner_report", { p_listing: mine!.id, p_days: 7 });
    expect(e5).toBeNull();
    expect((Array.isArray(rep) ? rep[0] : rep) as Record<string, unknown>).toHaveProperty("views");
    // Somebody else's listing yields no numbers (the CTE is empty), never theirs.
    const { data: theirs } = await ra.rpc("my_listing_owner_report", { p_listing: mine!.id, p_days: 7 });
    const t = (Array.isArray(theirs) ? theirs[0] : theirs) as { leads_total: number | null };
    expect(t.leads_total ?? 0).toBe(0);
  });
});
