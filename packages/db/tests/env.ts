import { readFileSync, existsSync } from "node:fs";

/**
 * Which database is the suite about to touch?
 *
 * Answered by ONE environment variable, `PG_ENV_FILE`, set by
 * `scripts/test.mjs --env=<target>` — never by a filename written into a test.
 * Until 7 Nov 2026 four separate files each hard-coded `.env.production`,
 * which was honest (there was nothing else) and also the reason the suite could
 * not be pointed anywhere safer without editing all four. Now there is a
 * staging project, and the rule from `scripts/load-env.mjs` applies to tests
 * too: no default target. Bare `vitest` fails here, loudly, before any client
 * is created.
 */
export function loadTestEnv(): { file: string; ref: string } {
  const file = process.env.PG_ENV_FILE;
  if (!file) {
    throw new Error(
      "PG_ENV_FILE is not set. Run the suite through `npm test` (staging) or " +
        "`node scripts/test.mjs --env=<target>` — not bare vitest, which would " +
        "not know which database it is about to write fixtures into."
    );
  }
  if (!existsSync(file)) throw new Error(`PG_ENV_FILE points at a missing file: ${file}`);

  // Shell wins over file — same precedence as the scripts.
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }

  const ref =
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? "unknown";
  return { file, ref };
}
