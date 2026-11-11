// Relative import only: unit tests load this module without the hub alias.
import { rightsBasis, type ProvenanceFacts, type RightsBasis } from "../media/rights";

/**
 * Moderation vocabulary and photo summaries (P1-a). Pure: used by the
 * moderation queue, the Photo Quality Centre, the agent's listing page and tests.
 */

/** Rejection reason codes — mirror of listings_moderation_reason_code_check (00114). */
export const REJECTION_CODES = [
  "incomplete_details", "photos_quality", "photos_rights", "price_unrealistic",
  "wrong_location", "duplicate", "prohibited_content", "other",
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

export type PhotoRow = {
  id: string;
  storage_path: string;
  processing_state: string;
  processing_error: string | null;
  processing_attempts: number | null;
};

/** What a reviewer needs to see about one photo, in one word. */
export type PhotoStatus =
  | "live" | "awaiting_approval" | "processing" | "queued"
  | "paused_quota" | "paused_cap" | "failed" | "kept_out" | "removed";

export function photoStatus(m: Pick<PhotoRow, "processing_state" | "processing_error">): PhotoStatus {
  switch (m.processing_state) {
    case "ready": return "live";
    case "processed": return "awaiting_approval";
    case "processing": return "processing";
    case "failed": return "failed";
    case "quarantined": return "kept_out";
    case "removed": return "removed";
    case "pending":
      if (m.processing_error === "paused_quota") return "paused_quota";
      if (m.processing_error === "paused_cap") return "paused_cap";
      return "queued";
    default: return "queued";
  }
}

export type PhotoSummary = {
  total: number;
  byStatus: Partial<Record<PhotoStatus, number>>;
  rightsMissing: number;
  /** Photos that will be public after approval: already live, or processed with rights evidence. */
  willPublish: number;
  /** Photos that will NOT be public after approval, by reason. */
  heldBack: number;
};

export function summarisePhotos(rows: PhotoRow[], provenance: Map<string, ProvenanceFacts>): PhotoSummary {
  const byStatus: Partial<Record<PhotoStatus, number>> = {};
  let rightsMissing = 0, willPublish = 0, total = 0;
  for (const m of rows) {
    const s = photoStatus(m);
    if (s === "removed") continue;
    total++;
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    const basis: RightsBasis = rightsBasis(m.storage_path, provenance.get(m.id));
    if (basis === "missing") rightsMissing++;
    if (s === "live" || (s === "awaiting_approval" && basis !== "missing")) willPublish++;
  }
  return { total, byStatus, rightsMissing, willPublish, heldBack: total - willPublish };
}
