#!/usr/bin/env node
/**
 * Run the marketplace dev server against STAGING.
 *
 *   npm run dev:staging -w @pg/www        → http://localhost:8156
 *
 * `.env.local` points the marketplace at production, which is right for work
 * on shipped features and wrong for a preview that must show the DEMO catalogue
 * seeded on staging (packages/db/scripts/seed-staging-demo.mjs). Next gives
 * `process.env` precedence over every env file, so this launcher injects ONLY
 * the staging project's public URL and publishable key from
 * `packages/db/.env.staging`, and leaves everything else to `.env.local`.
 *
 * The service-role key in that file is deliberately NOT copied: hard rule 1
 * says this app must never hold it, and src/lib/supabase/public.ts throws if
 * it ever sees one. The loader also refuses a staging file that names the
 * production ref, so this cannot be pointed at live data by mistake.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const stagingFile = join(appDir, "..", "..", "packages", "db", ".env.staging");

if (!existsSync(stagingFile)) {
  console.error("packages/db/.env.staging not found — see its template for how to fill it.");
  process.exit(1);
}
const staging = {};
for (const line of readFileSync(stagingFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) staging[m[1]] = m[2].replace(/^"|"$/g, "");
}
const ref = (staging.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1];
if (!ref || ref === "jokyyhvtahiypuzmfydp") {
  console.error(`Refusing: .env.staging resolves to ${ref ?? "nothing"}.`);
  process.exit(1);
}

const port = process.argv[2] ?? "8156";
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: staging.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: staging.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
  NEXT_PUBLIC_HUB_URL: "https://hub-staging.propertiguru.id",
  NEXT_PUBLIC_ENVIRONMENT: "staging",
};
delete env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`\n  Marketplace dev → STAGING (${ref}) on http://localhost:${port}\n`);

const child = spawn("npx", ["next", "dev", "--port", port], {
  cwd: appDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 1));
