import "server-only";
import { z } from "zod";
import { runAi, type DeniedReason } from "./engine";
import type { PlanSlot } from "./social-plan-rules";

/**
 * The Social Calendar Planner's model layer: one call for the whole week,
 * each slot's caption rewritten for its platform and angle from that
 * listing's facts. Day, platform and listing never change.
 */
export type PlannedWeek = { slots: PlanSlot[]; source: "ai" | "rules"; reason?: DeniedReason | "failed"; model?: string };

const schema = z.object({
  slots: z.array(z.object({
    day: z.string(), platform: z.string(), listing_id: z.string(),
    caption: z.string().min(30).max(2200), angle: z.string().max(60).default(""),
  })).min(1).max(7),
});

export async function improveWeek(input: { weekStart: string; slots: PlanSlot[]; facts: Record<string, unknown>; userId: string; locale: string }): Promise<PlannedWeek> {
  if (!input.slots.length) return { slots: [], source: "rules" };
  const res = await runAi(
    "social_plan",
    {
      week_start: input.weekStart,
      slots: input.slots.map((s) => ({ day: s.day, platform: s.platform, listing_id: s.listingId, angle: s.angle, listing: input.facts[s.listingId], deterministic_caption: s.caption })),
    },
    schema,
    { userId: input.userId, locale: input.locale, refType: "social_plan", redactInput: false },
  );
  if (!res.ok) return { slots: input.slots, source: "rules", reason: res.kind === "denied" ? res.reason : "failed" };
  const byKey = new Map(res.output.slots.map((s) => [`${s.day}|${s.platform}|${s.listing_id}`, s]));
  const slots = input.slots.map((s) => {
    const o = byKey.get(`${s.day}|${s.platform}|${s.listingId}`);
    return o ? { ...s, caption: o.caption, angle: o.angle || s.angle } : s;
  });
  return { slots, source: "ai", model: `${res.provider}/${res.model}` };
}
