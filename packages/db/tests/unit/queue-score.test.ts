import { describe, it, expect } from "vitest";
import { queueScore, rankQueue, QUEUE_WEIGHT } from "../../../../apps/hub/src/lib/admin/queue-score";

/** Screen 1: the Command Centre action queue ranking (apps/hub/src/lib/admin/queue-score.ts). */
const NOW = "2026-11-11T12:00:00.000Z";
const ago = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();

describe("action queue ranking", () => {
  it("a fresh item scores its weight; a day of waiting doubles it", () => {
    expect(queueScore({ kind: "listing_review", since: NOW }, NOW)).toBe(3);
    expect(queueScore({ kind: "listing_review", since: ago(24) }, NOW)).toBe(6);
  });

  it("age is capped at 30 days and never negative", () => {
    expect(queueScore({ kind: "invite_expiring", since: ago(24 * 400) }, NOW)).toBe(31);
    expect(queueScore({ kind: "invite_expiring", since: ago(-5) }, NOW)).toBe(1);
  });

  it("a scam report outranks everything of the same age", () => {
    const max = Math.max(...Object.values(QUEUE_WEIGHT));
    expect(QUEUE_WEIGHT.report_scam).toBe(max);
  });

  it("a light item that has waited long rises above a fresh heavy one", () => {
    const ranked = rankQueue([
      { kind: "report", id: "fresh-report", title: "", href: "", since: ago(1) },
      { kind: "photo_failed", id: "old-photo", title: "", href: "", since: ago(24 * 5) },
    ], NOW);
    expect(ranked.map((r) => r.id)).toEqual(["old-photo", "fresh-report"]);
  });

  it("ties go to the older item", () => {
    const ranked = rankQueue([
      { kind: "agent_review", id: "b", title: "", href: "", since: ago(10) },
      { kind: "listing_review", id: "a", title: "", href: "", since: ago(10.0001) },
    ], NOW);
    expect(ranked[0].id).toBe("a");
  });
});
