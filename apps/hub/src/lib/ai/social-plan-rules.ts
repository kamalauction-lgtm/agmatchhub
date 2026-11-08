/**
 * Social Calendar Planner — the deterministic week.
 *
 * Seven days, one post a day, rotating through the agent's listings
 * (photographed ones first, newest first) and alternating platforms. The
 * caption comes from the same writer the Studio uses; the model later varies
 * the angle. Pure, unit-tested.
 */
export type PlanListing = { id: string; title: string; hasPhoto: boolean; publishedAt: string | null; caption: string };
export type PlanPlatform = "facebook" | "instagram";
export type PlanSlot = { day: string; weekday: number; platform: PlanPlatform; listingId: string; title: string; caption: string; angle: string | null; hasPhoto: boolean };

export const ANGLES = ["price", "location", "lifestyle", "feature", "question", "photos", "cta"] as const;

export function weekDays(weekStartIso: string): string[] {
  const d = new Date(`${weekStartIso}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

export function planWeek(listings: PlanListing[], platforms: PlanPlatform[], weekStartIso: string): PlanSlot[] {
  if (!listings.length) return [];
  const sorted = [...listings].sort((a, b) => Number(b.hasPhoto) - Number(a.hasPhoto) || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const plats: PlanPlatform[] = platforms.length ? platforms : ["instagram", "facebook"];
  return weekDays(weekStartIso).map((day, i) => {
    const l = sorted[i % sorted.length];
    const platform = plats[i % plats.length];
    return { day, weekday: i, platform, listingId: l.id, title: l.title, caption: l.caption, angle: ANGLES[i % ANGLES.length], hasPhoto: l.hasPhoto };
  });
}
