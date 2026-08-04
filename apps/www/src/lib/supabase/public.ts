import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The marketplace's ONLY database connection.
 *
 * It uses the anonymous publishable key, whose database role has had its table
 * grants revoked (migration 00031) and can therefore reach nothing but the
 * `public_*` views. This is the boundary that stops a compromise of the public
 * app from reaching MatchHub minimum prices, commission terms, owner
 * identities or client contact details, all of which live in the same
 * database.
 *
 * There is deliberately no service-role client in this application, and no
 * variable holding one. If you are here because you need elevated privilege,
 * the answer is not to add it — enqueue the work and let a privileged consumer
 * perform it. See CLAUDE.md, hard rule 1.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Fails the build rather than the request. A service-role key reaching this
 * app's environment is a deployment mistake serious enough to stop everything:
 * silently ignoring it would leave the boundary intact by luck rather than by
 * design, and nobody would notice until it mattered.
 */
function assertNoPrivilegedKey(): void {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is present in the marketplace environment. " +
        "This application must never hold it. Remove it from .env and from the " +
        "Worker secrets before continuing."
    );
  }
}

let cached: SupabaseClient | null = null;

export function publicDb(): SupabaseClient {
  assertNoPrivilegedKey();

  if (!URL_ || !ANON) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set."
    );
  }

  cached ??= createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application": "propertiguru-www" } },
  });

  return cached;
}
