import { describe, it, expect } from "vitest";
import { parseAuditFilter, auditQueryString, csvCell } from "../../../../apps/hub/src/lib/admin/audit-filter";

/** Screen 13: audit filters and the CSV export's escaping (apps/hub/src/lib/admin/audit-filter.ts). */
describe("audit filter", () => {
  it("keeps valid values and drops malformed ones", () => {
    expect(parseAuditFilter({ q: "agent.%suspend_ed", entity: "agent_profile", role: "country_admin", result: "denied", from: "2026-11-01", to: "2026-11-11" }))
      .toEqual({ q: "agent. suspend ed", entity: "agent_profile", role: "country_admin", result: "denied", from: "2026-11-01", to: "2026-11-11" });
    expect(parseAuditFilter({ entity: "Agent;drop", role: "owner", result: "maybe", from: "11/11/2026", to: "x" }))
      .toEqual({ q: "", entity: "", role: "", result: "", from: "", to: "" });
  });

  it("round-trips into a query string with only the set fields", () => {
    expect(auditQueryString(parseAuditFilter({ role: "admin", from: "2026-11-01" }))).toBe("role=admin&from=2026-11-01");
  });
});

describe("CSV cells", () => {
  it("quotes values and doubles inner quotes", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("neutralises spreadsheet formulas", () => {
    for (const v of ["=HYPERLINK(\"x\")", "+1", "-2+3", "@SUM(A1)"]) expect(csvCell(v).startsWith("\"'")).toBe(true);
  });
});
