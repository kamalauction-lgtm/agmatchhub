#!/usr/bin/env node
/**
 * Run the hub dev server against STAGING.
 *
 *   npm run dev:staging -w @pg/hub        → http://localhost:8153
 *
 * `.env.local` points the hub at production, which is right for day-to-day
 * work on shipped features and wrong for anything whose migration has only
 * run on staging. Next gives `process.env` precedence over every env file, so
 * this launcher injects the staging project's URL, keys and connection string
 * from `packages/db/.env.staging` and leaves everything else to `.env.local`.
 *
 * Sign in with the standing staging accounts (`*@seed.propertiguru.test`,
 * passwords in packages/db/.env.staging). Nothing here can reach production:
 * the loader refuses a staging file that names the production ref.
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

const port = process.argv[2] ?? "8153";
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: staging.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: staging.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: staging.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: staging.DATABASE_URL,
  NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
  APP_BASE_URL: `http://localhost:${port}`,
  AUTH_CALLBACK_URL: `http://localhost:${port}/auth/callback`,
  PG_TARGET_LABEL: "staging",
  // Staging-only ingest secret, so the Hero → hub route can be exercised locally.
  ...(staging.LISTING_INGEST_SECRET ? { LISTING_INGEST_SECRET: staging.LISTING_INGEST_SECRET } : {}),
  // Gateway SANDBOX keys for staging only (E11). Absent = the adapters report "not configured".
  ...Object.fromEntries(
    ["BILLPLZ_API_KEY", "BILLPLZ_COLLECTION_ID", "BILLPLZ_X_SIGNATURE_KEY", "MIDTRANS_SERVER_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
     "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]
      .filter((k) => staging[k])
      .map((k) => [k, staging[k]]),
  ),
};
console.log(`\n  Hub dev → STAGING (${ref}) on http://localhost:${port}\n`);

const child = spawn("npx", ["next", "dev", "-p", port], {
  cwd: appDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 1));
