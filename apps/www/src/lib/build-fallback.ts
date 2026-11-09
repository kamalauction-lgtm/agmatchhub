/**
 * Build-time fallback for the marketplace homepage — CI only, by explicit flag.
 *
 * `next build` prerenders the ISR homepage. In CI the Supabase host is a
 * placeholder that does not resolve, so the reads fail and, without a
 * fallback, the build exits. The fallback must never apply to a genuine
 * release build: a production deployment whose database is unreachable has
 * to FAIL, not ship a statically generated empty catalogue.
 *
 * So two conditions are required, and neither alone is enough:
 *   1. the build phase (`NEXT_PHASE === "phase-production-build"`), and
 *   2. the explicit opt-in `WWW_CI_PLACEHOLDER_BUILD=1`, set only in
 *      `.github/workflows/ci.yml`. No deploy script sets it; it is not a
 *      `NEXT_PUBLIC_*` value, so it cannot arrive through the committed env
 *      files either.
 *
 * At runtime (not the build phase) errors always propagate, whatever the flag
 * says, so ISR keeps serving the last good page instead of an empty one.
 *
 * Pure and dependency-free so it can be unit-tested outside Next.
 */

export type BuildEnv = {
  NEXT_PHASE?: string;
  WWW_CI_PLACEHOLDER_BUILD?: string;
};

export const BUILD_PHASE = "phase-production-build";

/** True only for a CI placeholder build: build phase AND the explicit flag. */
export function allowsEmptyCatalogue(env: BuildEnv): boolean {
  return env.NEXT_PHASE === BUILD_PHASE && env.WWW_CI_PLACEHOLDER_BUILD === "1";
}

/**
 * Resolve `reads`; on failure return `empty` only when `allowsEmptyCatalogue`,
 * otherwise rethrow. `warn` receives one line naming the cause when the
 * fallback is used, so even a CI build log says what happened.
 */
export async function withBuildFallback<T>(
  reads: Promise<T>,
  empty: T,
  env: BuildEnv,
  warn: (message: string) => void = console.warn,
): Promise<T> {
  if (!allowsEmptyCatalogue(env)) return reads;
  try {
    return await reads;
  } catch (err) {
    warn(
      `[www] CI placeholder build: homepage prerendered without data (${err instanceof Error ? err.message : String(err)}).`,
    );
    return empty;
  }
}
