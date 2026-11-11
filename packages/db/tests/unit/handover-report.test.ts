import { describe, it, expect } from "vitest";
import { batchStats, activationRate, weekOf, weeklyMedianHours, adminEffort, median } from "../../../../apps/hub/src/lib/admin/handover-report";

/** Screen 14 reporting arithmetic (apps/hub/src/lib/admin/handover-report.ts). */
const NOW = "2026-11-11T12:00:00.000Z";
const ago = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

describe("handover report", () => {
  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("batch timings and the 14-day completion rate", () => {
    const s = batchStats([
      { created_at: ago(30), handed_over_at: ago(28), agent_review_completed_at: ago(20) },  // 2d prep, 8d review, within
      { created_at: ago(40), handed_over_at: ago(36), agent_review_completed_at: ago(10) },  // 4d prep, 26d review, late
      { created_at: ago(20), handed_over_at: ago(15), agent_review_completed_at: null },     // handed 15d ago, not done: late
      { created_at: ago(5), handed_over_at: ago(3), agent_review_completed_at: null },       // too recent to judge
      { created_at: ago(2), handed_over_at: null, agent_review_completed_at: null },          // still preparing
    ], NOW);
    expect(s).toMatchObject({ batches: 5, handedOver: 4, complete: 2 });
    expect(s.medianPrepDays).toBeCloseTo(3);         // 2, 4, 5, 2 → 2,2,4,5 → 3
    expect(s.medianReviewDays).toBeCloseTo(17);      // 8 and 26
    expect(s.completedWithin14).toBeCloseTo(1 / 3);  // decided: 3, within: 1
  });

  it("14-day activation ignores revoked and too-recent invitations", () => {
    expect(activationRate([
      { created_at: ago(30), redeemed_at: ago(25), status: "redeemed" },
      { created_at: ago(30), redeemed_at: ago(5), status: "redeemed" },
      { created_at: ago(20), redeemed_at: null, status: "pending" },
      { created_at: ago(3), redeemed_at: null, status: "pending" },
      { created_at: ago(30), redeemed_at: null, status: "revoked" },
    ], NOW)).toEqual({ decided: 3, activated: 1, rate: 1 / 3 });
  });

  it("weeks start on Monday and the trend keeps empty weeks", () => {
    expect(weekOf("2026-11-11T12:00:00Z")).toBe("2026-11-09");
    expect(weekOf("2026-11-09T00:00:00Z")).toBe("2026-11-09");
    const t = weeklyMedianHours([{ start: "2026-11-10T00:00:00Z", end: "2026-11-10T06:00:00Z" }, { start: "2026-11-09T00:00:00Z", end: "2026-11-09T02:00:00Z" }], NOW, 3);
    expect(t.map((w) => w.week)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(t[2]).toEqual({ week: "2026-11-09", count: 2, medianHours: 4 });
    expect(t[0].medianHours).toBeNull();
  });

  it("admin actions per live listing count only live listings", () => {
    expect(adminEffort(["a", "b"], ["a", "a", "b", "x"])).toEqual({ live: 2, actions: 3, perListing: 1.5 });
    expect(adminEffort([], ["a"]).perListing).toBeNull();
  });
});
