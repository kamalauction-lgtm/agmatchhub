import { describe, it, expect } from "vitest";
import { ruleTasksForLead, ruleTasksForBrief } from "../../../../apps/hub/src/lib/ai/task-rules";

describe("ruleTasksForLead()", () => {
  const now = new Date("2026-11-07T01:00:00Z");

  it("a viewing request yields propose → confirm → follow-up with sensible due times", () => {
    const tasks = ruleTasksForLead({ locale: "en", firstName: "Siti", inquiryType: "viewing_request", now });
    expect(tasks.map((t) => t.kind)).toEqual(["message", "viewing", "follow_up"]);
    expect(tasks[0].title).toContain("Siti");
    expect(tasks[0].dueAt).toBe(new Date(now.getTime() + 4 * 3_600_000).toISOString());
    expect(tasks[2].dueAt).toBe(new Date(now.getTime() + 48 * 3_600_000).toISOString());
  });

  it("writes Indonesian and Malay, and copes with no name and an unknown type", () => {
    expect(ruleTasksForLead({ locale: "id", firstName: null, inquiryType: "price_question", now })[0].title).toMatch(/^Kirim detail harga/);
    expect(ruleTasksForLead({ locale: "ms", firstName: "Aina", inquiryType: "whatever", now })[0].title).toMatch(/^Balas Aina/);
  });
});

describe("ruleTasksForBrief()", () => {
  it("maps each ranked action to a task of the matching kind, capped at five", () => {
    const actions = Array.from({ length: 7 }, (_, i) => ({ label: `Action ${i}`, href: i % 2 ? "/leads" : "/listings" }));
    const tasks = ruleTasksForBrief(actions, "2026-11-07T09:00:00.000Z");
    expect(tasks).toHaveLength(5);
    expect(tasks[0].kind).toBe("document");
    expect(tasks[1].kind).toBe("message");
    expect(tasks.every((t) => t.dueAt === "2026-11-07T09:00:00.000Z")).toBe(true);
  });
});
