import { describe, it, expect } from "vitest";
import { STAGE_KEYS, stageOf, stageIndex, TABS, isTabKey } from "../../../../apps/hub/src/lib/requests/stages";

/** The 23 requirement statuses as the hub's translations list them. */
const STATUSES = [
  "draft", "pending_admin_approval", "under_admin_review", "amendment_required", "resubmitted",
  "approved", "link_ready", "link_active", "receiving_submissions", "reviewing_submissions",
  "client_presentation_preparation", "client_review", "viewing_stage", "negotiation_stage",
  "offer_stage", "transaction_in_progress", "successfully_closed", "unsuccessful", "expired",
  "cancelled", "frozen", "archived",
];

describe("stageOf()", () => {
  it("maps every known status to one of the six stages, in workflow order", () => {
    for (const s of STATUSES) expect(STAGE_KEYS).toContain(stageOf(s));
    expect(stageIndex("draft")).toBe(0);
    expect(stageIndex("amendment_required")).toBe(1);
    expect(stageIndex("receiving_submissions")).toBe(2);
    expect(stageIndex("reviewing_submissions")).toBe(3);
    expect(stageIndex("negotiation_stage")).toBe(4);
    expect(stageIndex("successfully_closed")).toBe(5);
    expect(stageIndex("cancelled")).toBe(5);
  });

  it("treats an unknown status as draft rather than inventing progress", () => {
    expect(stageOf("something_new")).toBe("draft");
    expect(stageIndex("")).toBe(0);
  });
});

describe("tabs", () => {
  it("cover every stage exactly once across the named tabs", () => {
    const named = Object.entries(TABS).filter(([k]) => k !== "all").flatMap(([, v]) => v ?? []);
    expect([...named].sort()).toEqual([...STAGE_KEYS].sort());
    expect(isTabKey("open")).toBe(true);
    expect(isTabKey("nope")).toBe(false);
    expect(isTabKey(undefined)).toBe(false);
  });
});
