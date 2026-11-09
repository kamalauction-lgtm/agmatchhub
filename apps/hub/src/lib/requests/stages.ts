/**
 * Six visible stages over the 23-state requirement status machine (MatchHub
 * 2.0). This is a GROUPING for display: the exact status stays in its badge,
 * and nothing here changes what a status means or what the workflow allows.
 * Pure, and unit-tested.
 */

export const STAGE_KEYS = ["draft", "approval", "receiving", "reviewing", "client", "closed"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

const MAP: Record<string, StageKey> = {
  draft: "draft",
  pending_admin_approval: "approval",
  under_admin_review: "approval",
  amendment_required: "approval",
  resubmitted: "approval",
  approved: "receiving",
  link_ready: "receiving",
  link_active: "receiving",
  receiving_submissions: "receiving",
  reviewing_submissions: "reviewing",
  client_presentation_preparation: "reviewing",
  client_review: "client",
  viewing_stage: "client",
  negotiation_stage: "client",
  offer_stage: "client",
  transaction_in_progress: "client",
  successfully_closed: "closed",
  unsuccessful: "closed",
  expired: "closed",
  cancelled: "closed",
  frozen: "closed",
  archived: "closed",
};

/** The stage a status belongs to; an unknown status counts as draft. */
export function stageOf(status: string): StageKey {
  return MAP[status] ?? "draft";
}

export function stageIndex(status: string): number {
  return STAGE_KEYS.indexOf(stageOf(status));
}

/** Tabs on the list: which stages each one shows. "all" shows every row. */
export const TABS = {
  all: null,
  open: ["draft", "receiving", "reviewing"],
  approval: ["approval"],
  client: ["client"],
  closed: ["closed"],
} as const satisfies Record<string, readonly StageKey[] | null>;
export type TabKey = keyof typeof TABS;

export function isTabKey(v: string | undefined): v is TabKey {
  return !!v && v in TABS;
}
