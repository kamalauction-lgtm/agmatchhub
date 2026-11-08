import { describe, it, expect } from "vitest";
import { hasEnv, hasPairEnv, raClient, laClient, uid } from "./setup";

/**
 * Migration 00086: intent is written only for one's own lead, radar sees only
 * one's own leads, and matches never cross an agent's boundary or a border.
 */
describe.skipIf(!hasEnv || !hasPairEnv)("lead intelligence (00086)", () => {
  it("the assigned agent writes and reads an intent; another agent can do neither", async () => {
    const la = await laClient();
    const ra = await raClient();
    const { data: lead } = await la.from("leads").select("id").eq("human_readable_id", "LEAD-2026-900001").single();

    const { error } = await la.rpc("lead_intel_upsert", {
      p_lead: lead!.id, p_intent: 4, p_reason: "asks to view", p_signals: ["asks_viewing"], p_action: "offer slots", p_source: "rules", p_model: null,
    });
    expect(error, error?.message).toBeNull();
    const { data: mine } = await la.from("lead_intelligence").select("intent, reason").eq("lead_id", lead!.id).single();
    expect(mine?.intent).toBe(4);

    const { error: forged } = await ra.rpc("lead_intel_upsert", {
      p_lead: lead!.id, p_intent: 1, p_reason: "x", p_signals: [], p_action: null, p_source: "rules", p_model: null,
    });
    expect(forged).not.toBeNull();
    const { data: theirs } = await ra.from("lead_intelligence").select("intent").eq("lead_id", lead!.id);
    expect(theirs ?? []).toHaveLength(0);
  });

  it("radar lists only the caller's leads", async () => {
    const la = await laClient();
    const ra = await raClient();
    const { data: forLa } = await la.rpc("lead_radar");
    expect((forLa ?? []).length).toBeGreaterThanOrEqual(1);
    const { data: forRa } = await ra.rpc("lead_radar");
    expect(forRa ?? []).toHaveLength(0);
  });

  it("matches come from the open pool in the same country, exclude the enquired listing, and refuse other agents", async () => {
    const la = await laClient();
    const ra = await raClient();
    const { data: lead } = await la.from("leads").select("id, listing_id").eq("human_readable_id", "LEAD-2026-900001").single();
    const { data: matches, error } = await la.rpc("lead_matches", { p_lead: lead!.id, p_limit: 3 });
    expect(error).toBeNull();
    const rows = (matches ?? []) as { listing_id: string; human_readable_id: string; source: string; reasons: string[]; score: number }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.listing_id !== lead!.listing_id)).toBe(true);
    const pondok = rows.find((r) => r.human_readable_id === "LST-2026-900003");
    expect(pondok?.source).toBe("pool");
    expect(pondok?.reasons).toEqual(expect.arrayContaining(["same_area", "same_type"]));

    const { error: denied } = await ra.rpc("lead_matches", { p_lead: lead!.id, p_limit: 3 });
    expect(denied).not.toBeNull();
  });
});
