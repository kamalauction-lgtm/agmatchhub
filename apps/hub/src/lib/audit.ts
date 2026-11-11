import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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
 * Append-only audit trail (spec §52). Since 00123 clients cannot write audit
 * rows at all: the actor is the VERIFIED session user (auth.getUser checks the
 * token with Supabase), and the row is written by the server with
 * `public.log_audit_as`, which looks the actor's role up itself.
 * Never include confidential values that the actor could not otherwise see.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const args = {
    p_action: entry.action,
    p_entity_type: entry.entityType,
    p_entity_id: entry.entityId ?? null,
    p_previous: entry.previous ?? null,
    p_new: entry.next ?? null,
    p_reason: entry.reason ?? null,
    p_result: entry.result ?? "success",
  };
  let { error } = await createServiceClient().rpc("log_audit_as", { p_actor: user?.id ?? null, ...args });
  // Release window only: until 00123 is applied (it follows the Hub deploy),
  // log_audit_as does not exist yet and the session path still works. Once
  // 00123 is in, this branch is never taken (and would be refused anyway).
  if (error && /log_audit_as|PGRST202|function .* does not exist/i.test(`${error.code ?? ""} ${error.message}`)) {
    ({ error } = await supabase.rpc("log_audit", args));
  }
  if (error) {
    // Audit failures must be visible in server logs but not crash the action.
    console.error("[audit] failed:", entry.action, error.message);
  }
}
