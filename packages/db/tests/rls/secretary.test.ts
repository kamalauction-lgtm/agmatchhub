import { describe, it, expect } from "vitest";
import { hasEnv, hasPairEnv, raClient, laClient, uid } from "./setup";

/**
 * Migration 00085: the Secretary's two lead-event kinds.
 * The seeded scenario gives LA a lead (LEAD-2026-900001) on their published
 * listing. LA may record a draft and an e-mail on it; RA — who has nothing to
 * do with that lead — may not, and may not read its timeline either.
 */
describe.skipIf(!hasEnv || !hasPairEnv)("Communication Secretary (00085)", () => {
  it("the assigned agent can record a draft and a sent e-mail on their lead", async () => {
    const la = await laClient();
    const me = await uid(la);
    const { data: lead } = await la.from("leads").select("id").eq("human_readable_id", "LEAD-2026-900001").maybeSingle();
    expect(lead).toBeTruthy();

    for (const kind of ["ai.reply_drafted", "email.sent"]) {
      const { error } = await la.from("lead_events").insert({ lead_id: lead!.id, kind, detail: { test: true }, actor_id: me });
      expect(error, `${kind}: ${error?.message}`).toBeNull();
    }
    const { data: events } = await la.from("lead_events").select("kind").eq("lead_id", lead!.id).in("kind", ["ai.reply_drafted", "email.sent"]);
    expect((events ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("another agent cannot see the lead, its timeline, or write to it", async () => {
    const la = await laClient();
    const ra = await raClient();
    const raId = await uid(ra);
    const { data: lead } = await la.from("leads").select("id").eq("human_readable_id", "LEAD-2026-900001").single();

    const { data: visible } = await ra.from("leads").select("id").eq("id", lead!.id);
    expect(visible ?? []).toHaveLength(0);
    const { data: timeline } = await ra.from("lead_events").select("id").eq("lead_id", lead!.id);
    expect(timeline ?? []).toHaveLength(0);
    const { error } = await ra.from("lead_events").insert({ lead_id: lead!.id, kind: "ai.reply_drafted", detail: {}, actor_id: raId });
    expect(error).not.toBeNull();
  });

  it("an agent still cannot invent kinds the policy does not list", async () => {
    const la = await laClient();
    const me = await uid(la);
    const { data: lead } = await la.from("leads").select("id").eq("human_readable_id", "LEAD-2026-900001").single();
    const { error } = await la.from("lead_events").insert({ lead_id: lead!.id, kind: "nudge.sent", detail: {}, actor_id: me });
    expect(error).not.toBeNull();   // cron-only kind
  });
});
