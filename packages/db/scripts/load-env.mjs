/**
 * Shared environment loader for the database tooling.
 *
 *   --env=production  -> .env.production   (jokyyhvtahiypuzmfydp — the live DB)
 *   --env=legacy      -> .env.legacy       (jtruwmwinymflkrvuuwd — consolidated
 *                                           away, frozen at migration 00054)
 *   --env=<path>      -> that file
 *
 * THERE IS NO DEFAULT, ON PURPOSE
 *   The flag is required. Every script here can write to a database, and a
 *   default target means the one time somebody forgets the flag they hit
 *   whichever database the default happened to point at. Making the argument
 *   mandatory converts that from a silent wrong-database write into an error
 *   message before anything runs.
 *
 * WHAT THIS REPLACED
 *   `.env.staging` held PRODUCTION credentials and `.env.local` held a dead
 *   project, and the default was `.env.local`. So `--env=staging` was the way
 *   to reach production, `--env=production` reached the dead project, and the
 *   two seed scripts that refuse to "seed production" were checking for the
 *   dead one — they blocked the safe database and waved seed data into the
 *   live one. The files are now named after what they contain and the loader
 *   prints the Supabase project ref, which is the one identifier that cannot
 *   be misfiled.
 *
 * Returns { url, envName, host, ref, isProduction, fileName, requested } and
 * prints the target. The connection string itself is never printed — only the
 * host and ref, so the password cannot reach a log, a terminal scrollback or a
 * screenshot.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ALIASES = {
  production: ".env.production",
  staging: ".env.staging",
  legacy: ".env.legacy",
};

/** The project both apps deploy against. Identified by ref, never by filename. */
export const PRODUCTION_REF = "jokyyhvtahiypuzmfydp";

export function loadEnv(argv = process.argv.slice(2)) {
  const arg = argv.find((a) => a.startsWith("--env="));
  if (!arg) {
    console.error(
      "Missing --env. Choose one explicitly:\n" +
        "  --env=production   the live database (jokyyhvtahiypuzmfydp)\n" +
        "  --env=legacy       the retired project, frozen at 00054\n" +
        "  --env=<path>       any other env file, relative to packages/db\n"
    );
    process.exit(1);
  }
  const requested = arg.slice(6);
  const fileName = ALIASES[requested] ?? requested;
  const envFile = join(root, fileName);

  if (!existsSync(envFile)) {
    console.error(`Environment file not found: ${fileName}`);
    process.exit(1);
  }

  // Shell wins over file — the standard dotenv precedence, and what the
  // original db-migrate loader did. A one-off override like
  // `GHL_LIVE=true node scripts/ghl-drain.mjs` must actually take effect;
  // silently ignoring it cost a debugging round.
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`DATABASE_URL not set in ${fileName}`);
    process.exit(1);
  }

  let host = "unknown";
  let ref = "unknown";
  try {
    const parsed = new URL(url);
    host = parsed.host;
    // Supabase pooler usernames are `postgres.<project-ref>`.
    ref = decodeURIComponent(parsed.username).split(".")[1] ?? "unknown";
  } catch {
    /* keep the placeholders rather than risk echoing the string */
  }

  const isProduction = ref === PRODUCTION_REF;

  // The owner's rule (7 Nov 2026): the production database is never staging.
  // If someone pastes the production connection string into .env.staging —
  // the single most likely mistake — every staging script must refuse to run
  // rather than quietly rehearse a migration on the live data.
  if (requested === "staging" && isProduction) {
    console.error(
      ".env.staging points at the PRODUCTION project (" + PRODUCTION_REF + ").\n" +
        "Staging must be a separate Supabase project. Refusing to continue."
    );
    process.exit(1);
  }

  const label = isProduction ? "PRODUCTION" : requested;
  console.log(`Target: ${label}  (${fileName} -> ${ref} @ ${host})\n`);

  return { url, envName: label, host, ref, isProduction, fileName, requested };
}

/** Rest arguments with the --env flag removed. */
export function restArgs(argv = process.argv.slice(2)) {
  return argv.filter((a) => !a.startsWith("--env="));
}
