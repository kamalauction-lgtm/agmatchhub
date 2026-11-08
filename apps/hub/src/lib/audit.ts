import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AuditEntry = {
  action: string;            // e.g. "request.approved", "agent.verified"
  entityType: string;        // e.g. "property_request"
  entityId?: string;
  previous?: unknown;
  next?: unknown;
  reason?: string;
  result?: "success" | "denied" | "failure";
};

/**
 * Append-only audit trail (spec §52). Writes via the SECURITY DEFINER
 * `public.log_audit` function — normal roles cannot modify audit rows.
 * Never include confidential values that the actor could not otherwise see.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_audit", {
    p_action: entry.action,
    p_entity_type: entry.entityType,
    p_entity_id: entry.entityId ?? null,
    p_previous: entry.previous ?? null,
    p_new: entry.next ?? null,
    p_reason: entry.reason ?? null,
    p_result: entry.result ?? "success",
  });
  if (error) {
    // Audit failures must be visible in server logs but not crash the action.
    console.error("[audit] failed:", entry.action, error.message);
  }
}
