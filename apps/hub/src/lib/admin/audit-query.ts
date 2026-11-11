import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AuditFilter } from "./audit-filter";

/** Builds the audit_logs query for a filter. RLS (00123) limits it to audit.view holders. */
export function auditQuery(supabase: Awaited<ReturnType<typeof createClient>>, f: AuditFilter, limit: number) {
  let q = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, actor_role, reason, result, created_at, profiles:actor_id(display_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (f.q) q = q.ilike("action", `%${f.q}%`);
  if (f.entity) q = q.eq("entity_type", f.entity);
  if (f.role) q = q.eq("actor_role", f.role);
  if (f.result) q = q.eq("result", f.result);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59.999Z`);
  return q;
}
