/**
 * Audit trail filters (screen 13), shared by the page and the CSV export so
 * both show exactly the same rows. Pure: no imports.
 */

export const AUDIT_ROLES = ["super_admin", "admin", "compliance_admin", "country_admin", "agent", "user", "service_role", "system"] as const;
export const AUDIT_RESULTS = ["success", "denied", "failure"] as const;

export type AuditFilter = {
  q: string;           // action contains
  entity: string;      // entity type, exact
  role: string;        // actor role, exact
  result: string;      // success | denied | failure
  from: string;        // YYYY-MM-DD, inclusive
  to: string;          // YYYY-MM-DD, inclusive
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Normalise untrusted query parameters; anything malformed is dropped. */
export function parseAuditFilter(sp: Record<string, string | undefined>): AuditFilter {
  const clean = (v: string | undefined, max: number) => (v ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, max);
  return {
    q: clean(sp.q, 80),
    entity: /^[a-z_]{1,60}$/.test(sp.entity ?? "") ? sp.entity! : "",
    role: (AUDIT_ROLES as readonly string[]).includes(sp.role ?? "") ? sp.role! : "",
    result: (AUDIT_RESULTS as readonly string[]).includes(sp.result ?? "") ? sp.result! : "",
    from: DAY.test(sp.from ?? "") ? sp.from! : "",
    to: DAY.test(sp.to ?? "") ? sp.to! : "",
  };
}

/** The same filter as a query string (for the export link and paging). */
export function auditQueryString(f: AuditFilter): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) u.set(k, v);
  return u.toString();
}

/** One CSV cell: quoted, inner quotes doubled, and formula-leading characters neutralised. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
