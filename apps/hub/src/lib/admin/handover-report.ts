/**
 * Handover reporting (screen 14, P2-b "advanced reporting"): pure arithmetic
 * over rows the page reads with the admin's own session (RLS-scoped). No
 * imports, so the page and the unit tests share exactly the same rules.
 */

const DAY = 86_400_000;
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY;

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type BatchRow = { created_at: string; handed_over_at: string | null; agent_review_completed_at: string | null };

/** Prepared → handed over → agent complete; "within 14 days" counts only batches handed over at least 14 days ago or already complete. */
export function batchStats(rows: BatchRow[], now: string) {
  const prep = rows.filter((r) => r.handed_over_at).map((r) => days(r.created_at, r.handed_over_at!));
  const review = rows.filter((r) => r.handed_over_at && r.agent_review_completed_at).map((r) => days(r.handed_over_at!, r.agent_review_completed_at!));
  const decided = rows.filter((r) => r.handed_over_at && (r.agent_review_completed_at || days(r.handed_over_at, now) >= 14));
  const within = decided.filter((r) => r.agent_review_completed_at && days(r.handed_over_at!, r.agent_review_completed_at) <= 14);
  return {
    batches: rows.length,
    handedOver: rows.filter((r) => r.handed_over_at).length,
    complete: rows.filter((r) => r.agent_review_completed_at).length,
    medianPrepDays: median(prep),
    medianReviewDays: median(review),
    completedWithin14: decided.length ? within.length / decided.length : null,
  };
}

export type InviteRow = { created_at: string; redeemed_at: string | null; status: string };

/** 14-day activation: invitations redeemed within 14 days, among those old enough to know. */
export function activationRate(rows: InviteRow[], now: string): { decided: number; activated: number; rate: number | null } {
  const decided = rows.filter((r) => r.status !== "revoked" && (r.redeemed_at || days(r.created_at, now) >= 14));
  const activated = decided.filter((r) => r.redeemed_at && days(r.created_at, r.redeemed_at) <= 14).length;
  return { decided: decided.length, activated, rate: decided.length ? activated / decided.length : null };
}

/** Monday-start ISO week key (UTC) for trend buckets. */
export function weekOf(iso: string): string {
  const d = new Date(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
}

/** Median hours per week between two timestamps, for the last `weeks` weeks ending at `now`. */
export function weeklyMedianHours(pairs: { start: string; end: string | null }[], now: string, weeks = 8) {
  const first = Date.parse(weekOf(now)) - (weeks - 1) * 7 * DAY;
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < weeks; i++) buckets.set(new Date(first + i * 7 * DAY).toISOString().slice(0, 10), []);
  for (const p of pairs) {
    if (!p.end) continue;
    const k = weekOf(p.end);
    if (buckets.has(k)) buckets.get(k)!.push((Date.parse(p.end) - Date.parse(p.start)) / 3_600_000);
  }
  return [...buckets.entries()].map(([week, xs]) => ({ week, count: xs.length, medianHours: median(xs) }));
}

/** Admin actions per live listing, from audit rows (entity_id = listing id). */
export function adminEffort(liveListingIds: string[], auditEntityIds: string[]) {
  if (!liveListingIds.length) return { live: 0, actions: 0, perListing: null as number | null };
  const live = new Set(liveListingIds);
  const actions = auditEntityIds.filter((id) => live.has(id)).length;
  return { live: live.size, actions, perListing: actions / live.size };
}
