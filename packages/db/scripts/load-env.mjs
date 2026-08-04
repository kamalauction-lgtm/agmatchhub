/**
 * Shared environment loader for the database tooling.
 *
 * Every script that can write to a database must state which one, out loud, so
 * "I thought I was on staging" is not a failure mode available to us:
 *
 *   --env=staging     -> .env.staging
 *   --env=local       -> .env.local   (default)
 *   --env=<path>      -> that file
 *
 * Returns { url, envName, host } and prints the target. The connection string
 * itself is never printed — only the host, so the password cannot reach a log,
 * a terminal scrollback or a screenshot.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ALIASES = { staging: ".env.staging", local: ".env.local", production: ".env.local" };

export function loadEnv(argv = process.argv.slice(2)) {
  const arg = argv.find((a) => a.startsWith("--env="));
  const requested = arg ? arg.slice(6) : "local";
  const fileName = ALIASES[requested] ?? requested;
  const envFile = join(root, fileName);

  if (!existsSync(envFile)) {
    console.error(`Environment file not found: ${fileName}`);
    process.exit(1);
  }

  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`DATABASE_URL not set in ${fileName}`);
    process.exit(1);
  }

  let host = "unknown";
  try {
    host = new URL(url).host;
  } catch {
    /* keep the placeholder rather than risk echoing the string */
  }

  const label = requested === "local" ? "local/production" : requested;
  console.log(`Target: ${label}  (${fileName} -> ${host})\n`);

  return { url, envName: label, host, fileName };
}

/** Rest arguments with the --env flag removed. */
export function restArgs(argv = process.argv.slice(2)) {
  return argv.filter((a) => !a.startsWith("--env="));
}
