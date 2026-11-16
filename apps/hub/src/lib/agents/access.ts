import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * May this agent use the platform? (00129)
 *
 * Not the same as the Verified badge. Since 13 Nov 2026 new agents have access
 * as soon as they confirm their email, unless a super admin has switched
 * `agent_approval_required` on; suspended and banned agents never do. The rule
 * lives in the database (`agent_access_ok`) so the app and RLS cannot drift.
 *
 * Pass the caller's own client for the signed-in user, or the service client
 * with a user id.
 */
export async function agentHasAccess(db: SupabaseClient, userId?: string): Promise<boolean> {
  const { data, error } = await db.rpc("agent_has_access", userId ? { p_user: userId } : {});
  if (error) {
    console.error("agent_has_access failed", error.code, error.message);
    return false;
  }
  return data === true;
}
