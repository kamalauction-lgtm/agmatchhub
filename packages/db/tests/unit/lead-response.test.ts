import { describe, it, expect } from "vitest";
import { leadResponseStats } from "../../../../apps/hub/src/lib/leads/response";

/** Screen 10: lead response-time arithmetic (apps/hub/src/lib/leads/response.ts). */
const NOW = "2026-11-11T12:00:00.000Z";
const lead = (agent: string, created: string, due: string | null, answered: string | null) =>
  ({ agent_id: agent, created_at: created, first_response_due: due, first_responded_at: answered });

describe("lead response stats", () => {
  const rows = [
    lead("a", "2026-11-10T08:00:00.000Z", "2026-11-10T10:00:00.000Z", "2026-11-10T08:30:00.000Z"), // on time, 30 min
    lead("a", "2026-11-10T09:00:00.000Z", "2026-11-10T11:00:00.000Z", "2026-11-10T13:00:00.000Z"), // late, 240 min
    lead("a", "2026-11-11T06:00:00.000Z", "2026-11-11T08:00:00.000Z", null),                       // overdue now
    lead("b", "2026-11-11T11:30:00.000Z", "2026-11-11T13:30:00.000Z", null),                       // still inside its window
    lead("b", "2026-11-09T08:00:00.000Z", "2026-11-09T10:00:00.000Z", "2026-11-09T09:00:00.000Z"), // on time, 60 min
  ];
  const s = leadResponseStats(rows, NOW);

  it("counts leads, answers and what is overdue now", () => {
    expect(s.total).toBe(5);
    expect(s.responded).toBe(3);
    expect(s.overdueNow).toBe(1);
  });

  it("the on-time rate leaves out a lead still inside its window", () => {
    // decided: 3 answered + 1 overdue = 4; on time: 2.
    expect(s.onTimeRate).toBe(0.5);
  });

  it("the median is over answered leads only", () => {
    expect(s.medianMinutes).toBe(60); // 30, 60, 240
  });

  it("per agent, sorted by overdue then volume", () => {
    expect(s.byAgent.map((a) => a.agentId)).toEqual(["a", "b"]);
    expect(s.byAgent[0]).toMatchObject({ total: 3, responded: 2, overdueNow: 1, medianMinutes: 135 });
    expect(s.byAgent[0].onTimeRate).toBeCloseTo(1 / 3);
    expect(s.byAgent[1]).toMatchObject({ total: 2, responded: 1, overdueNow: 0, onTimeRate: 1, medianMinutes: 60 });
  });

  it("no leads gives empty figures, not zeros", () => {
    expect(leadResponseStats([], NOW)).toMatchObject({ total: 0, responded: 0, onTimeRate: null, medianMinutes: null, overdueNow: 0, byAgent: [] });
  });
});
