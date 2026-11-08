import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — BYPASSES Row-Level Security.
 *
 * Use ONLY inside trusted server code paths that have already performed
 * explicit authorisation checks (e.g. client-presentation projections,
 * audit writes, admin jobs). Never import from a client component; the
 * "server-only" import makes that a build error.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
