import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { csvCell, parseAuditFilter } from "@/lib/admin/audit-filter";
import { auditQuery } from "@/lib/admin/audit-query";

/**
 * CSV export of the audit trail (screen 13): exactly the rows the page's
 * filters select, up to 5,000. audit.view is checked here and enforced by RLS
 * (00123); the export itself is audited with its filters and row count.
 * Values are quoted and formula-leading characters neutralised (csvCell).
 */
const MAX_ROWS = 5000;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const { data: allowed } = await supabase.rpc("has_capability", { p_capability: "audit.view" });
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const f = parseAuditFilter(Object.fromEntries(url.searchParams.entries()));
  const { data: rows, error } = await auditQuery(supabase, f, MAX_ROWS);
  if (error) return new NextResponse("Export failed", { status: 500 });

  const header = ["created_at", "actor", "actor_role", "action", "entity_type", "entity_id", "result", "reason"];
  const name = (p: unknown) => ((Array.isArray(p) ? p[0] : p) as { display_name?: string } | null)?.display_name ?? "";
  const lines = [header.join(",")].concat((rows ?? []).map((r) =>
    [r.created_at, name(r.profiles), r.actor_role, r.action, r.entity_type, r.entity_id, r.result, r.reason].map(csvCell).join(",")));

  await logAudit({ action: "audit.exported", entityType: "audit_logs", next: { filter: f, rows: (rows ?? []).length } });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
