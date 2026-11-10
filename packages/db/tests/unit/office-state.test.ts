import { describe, it, expect } from "vitest";
import { buildOffice, type JobRow, type RoleRow, type TaskRow } from "../../../../apps/hub/src/lib/ai/office-state";
import type { WorkforceModel } from "../../../../apps/hub/src/lib/ai/workforce-status-rules";

/** The Live Office must never show work that did not happen. */

const now = new Date("2026-11-10T09:00:00Z");
const role = (over: Partial<RoleRow>): RoleRow => ({
  key: "x", category: "leads_crm", sort: 10, status: "live", route: "/leads", external_url: null, feature: "lead_qualify",
  name: { en: "X" }, ...over,
});
const models: WorkforceModel[] = [{ feature: "lead_qualify", provider: "gemini", fallback_provider: null, enabled: true }];
const job = (over: Partial<JobRow>): JobRow => ({
  feature: "lead_qualify", status: "denied", denied_reason: "no_provider", created_at: now.toISOString(),
  latency_ms: 10, input_ref_type: null, input_ref_id: null, ...over,
});
const base = { personas: [], models, tasks: [] as TaskRow[], ctx: { verified: true, heroLinked: false }, country: "ID", locale: "id", now, keyPresent: () => false, categoryOrder: ["leads_crm"] };

const one = (roles: RoleRow[], jobs: JobRow[] = [], tasks: TaskRow[] = [], ctx = base.ctx) =>
  buildOffice({ ...base, roles, jobs, tasks, ctx }).departments.flatMap((d) => d.workers);

describe("AI Live Office state", () => {
  it("a role with no job today is on standby, never 'working'", () => {
    const [w] = one([role({})]);
    expect(w.state).toBe("idle");
    expect(w.lastAt).toBeNull();
  });

  it("a job minutes ago celebrates; a job earlier today is 'active'; rule-based fallback is labelled, not hidden", () => {
    const [recent] = one([role({})], [job({ created_at: new Date(now.getTime() - 2 * 60_000).toISOString() })]);
    expect(recent.state).toBe("finished");
    expect(recent.engine).toBe("rules"); // model routed but no key present
    expect(recent.lastStatus).toBe("denied");
    const [earlier] = one([role({})], [job({ created_at: new Date(now.getTime() - 3 * 3600_000).toISOString() })]);
    expect(earlier.state).toBe("active");
  });

  it("a planned role never animates as working, even with jobs on its feature", () => {
    const [w] = one([role({ status: "planned", route: null })], [job({})]);
    expect(w.state).toBe("planned");
    expect(w.access).toBe("planned");
  });

  it("an unverified agent sees the office offline", () => {
    const [w] = one([role({})], [job({})], [], { verified: false, heroLinked: false });
    expect(w.state).toBe("offline");
  });

  it("an open AI-proposed task puts its role in 'needs you'; manual tasks never do", () => {
    const task: TaskRow = { id: "t1", title: "Call back", source: "ai_manager", status: "open", due_at: null, kind: "call", lead_id: null, listing_id: null };
    const [w] = one([role({ key: "ai_manager", feature: "brief", route: "/dashboard" })], [], [task]);
    expect(w.state).toBe("attention");
    expect(w.pending).toHaveLength(1);
    const [m] = one([role({ key: "ai_manager", feature: "brief", route: "/dashboard" })], [], [{ ...task, source: "manual" }]);
    expect(m.state).toBe("idle");
  });

  it("the last run failing shows as error", () => {
    const [w] = one([role({})], [job({ status: "error", denied_reason: null })]);
    expect(w.state).toBe("error");
  });

  it("roles sharing one engine feature are attributed the same jobs and know about each other", () => {
    const ws = one([role({ key: "a", feature: "listing_copy" }), role({ key: "b", feature: "listing_copy" })], [job({ feature: "listing_copy" })]);
    expect(ws.map((w) => w.counts7d.denied)).toEqual([1, 1]);
    expect(ws[0].sharedWith).toEqual(["b"]);
  });

  it("engine is model-powered only when a provider key is present", () => {
    const [w] = buildOffice({ ...base, roles: [role({})], jobs: [], keyPresent: () => true }).departments[0].workers;
    expect(w.engine).toBe("ai");
  });
});

describe("AI Live Office counters", () => {
  it("counts today's jobs per role and across the office, and the queue is only pending approvals", () => {
    const today = job({ created_at: new Date(now.getTime() - 3 * 3600_000).toISOString() });
    const yesterday = job({ created_at: new Date(now.getTime() - 30 * 3600_000).toISOString() });
    const data = buildOffice({ ...base, roles: [role({}), role({ key: "y", feature: "listing_copy" })], jobs: [today, yesterday], tasks: [] });
    const [x, y] = data.departments[0].workers;
    expect(x.todayCount).toBe(1);
    expect(x.recent).toHaveLength(2);
    expect(x.queueCount).toBe(0);
    expect(y.todayCount).toBe(0);
    expect(data.totals.completedToday).toBe(1);
    expect(data.totals.activeNow).toBe(0);
    expect(data.totals.departments).toBe(1);
  });
});
