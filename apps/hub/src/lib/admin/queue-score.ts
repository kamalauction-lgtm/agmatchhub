/**
 * Command Centre action queue (screen 1): one list of what needs an admin,
 * sorted by risk and age. Pure: no imports, shared by the page and the tests.
 *
 *   score = weight × (1 + age in days), capped at 30 days of age
 *
 * A heavier kind outranks a lighter one of the same age; a light item that has
 * waited long enough rises above a fresh heavy one. Ties go to the older item.
 */

export type QueueKind =
  | "report_scam" | "report" | "lead_overdue" | "listing_review" | "agent_review"
  | "change_answered" | "request_review" | "photo_failed" | "invite_expiring";

export const QUEUE_WEIGHT: Record<QueueKind, number> = {
  report_scam: 8,      // a buyer says this listing is a scam
  lead_overdue: 5,     // a buyer is waiting past the agent's due time
  report: 4,           // other buyer reports
  listing_review: 3,   // an agent is waiting to go live
  agent_review: 3,     // an agent is waiting to be verified
  change_answered: 3,  // an agent answered a moderator; the moderator owes a reply
  request_review: 2,   // a client requirement is waiting for approval
  photo_failed: 2,     // a photo could not be processed
  invite_expiring: 1,  // an invitation lapses within two days
};

export type QueueItem = {
  kind: QueueKind;
  id: string;
  title: string;
  href: string;
  since: string; // ISO time the item started waiting
};

export function queueScore(item: Pick<QueueItem, "kind" | "since">, now: string): number {
  const days = Math.min(30, Math.max(0, (Date.parse(now) - Date.parse(item.since)) / 86_400_000));
  return QUEUE_WEIGHT[item.kind] * (1 + days);
}

export function rankQueue<T extends QueueItem>(items: T[], now: string): (T & { score: number })[] {
  return items
    .map((i) => ({ ...i, score: queueScore(i, now) }))
    .sort((a, b) => b.score - a.score || Date.parse(a.since) - Date.parse(b.since));
}
