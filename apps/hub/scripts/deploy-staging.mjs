#!/usr/bin/env node
/**
 * Build and deploy the hub to the STAGING Worker.
 *
 *   npm run deploy:staging -w @pg/hub
 *   → ag-matchhub-staging on https://hub-staging.propertiguru.id
 *
 * Same discipline as apps/www/scripts/deploy-market.mjs: the build-time values
 * are injected into the child process (Next never overrides process.env), so
 * a developer `.env.local` cannot leak into the bundle. The Supabase project
 * is taken from packages/db/.env.staging — the one file that defines what
 * "staging" is — and must agree with .env.staging.production; the build-target
 * check then reads the bundle and refuses any other project ref.
 *
 * Secrets are not here. Set them once on the Worker:
 *   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.staging.jsonc   (etc.)
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const ENV_FILE = ".env.staging.production";
const CONFIG = "wrangler.staging.jsonc";
const PRODUCTION_REF = "jokyyhvtahiypuzmfydp";

const parse = (path) => {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
};

const stagingFile = join(appDir, "..", "..", "packages", "db", ".env.staging");
if (!existsSync(stagingFile)) { console.error("packages/db/.env.staging not found."); process.exit(1); }
if (!existsSync(join(appDir, ENV_FILE))) { console.error(`${ENV_FILE} not found in apps/hub.`); process.exit(1); }

const staging = parse(stagingFile);
const build = parse(join(appDir, ENV_FILE));
const ref = (staging.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1];
if (!ref || ref === PRODUCTION_REF) { console.error(`Refusing: .env.staging resolves to ${ref ?? "nothing"}.`); process.exit(1); }
if (build.NEXT_PUBLIC_SUPABASE_URL !== staging.NEXT_PUBLIC_SUPABASE_URL || build.NEXT_PUBLIC_SUPABASE_ANON_KEY !== staging.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error(`Refusing: ${ENV_FILE} and packages/db/.env.staging disagree on the Supabase project or key.`);
  process.exit(1);
}

const env = { ...process.env, ...build, NEXT_PUBLIC_SUPABASE_URL: staging.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: staging.NEXT_PUBLIC_SUPABASE_ANON_KEY };
delete env.SUPABASE_SERVICE_ROLE_KEY; // never needed at build time
delete env.DATABASE_URL;

console.log(`\n  Target      STAGING Worker (${CONFIG})\n  Site        ${build.NEXT_PUBLIC_APP_URL}\n  Database    ${ref}\n`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: appDir, env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`))));
  });
}

try {
  for (const dir of [".open-next", ".next"]) rmSync(join(appDir, dir), { recursive: true, force: true });
  await run("npx", ["opennextjs-cloudflare", "build"]);
  /* OpenNext copies the app's .env.production into the server function, where
   * Next would load it at runtime. For staging that file names PRODUCTION, so
   * it is replaced with the staging build values. The build-target check below
   * would refuse the bundle otherwise — which is how this was found. */
  const copied = join(appDir, ".open-next", "server-functions", "default", "apps", "hub", ".env.production");
  if (existsSync(copied)) writeFileSync(copied, readFileSync(join(appDir, ENV_FILE)));
  await run("node", ["../../scripts/verify-build-target.mjs", `--env=${ENV_FILE}`]);
  await run("npx", ["opennextjs-cloudflare", "deploy", "--", "--config", CONFIG]);
  console.log(`\n✓ Deployed the STAGING hub → ${build.NEXT_PUBLIC_APP_URL}\n`);
} catch (err) {
  console.error(`\n✗ Deploy stopped: ${err.message}\n`);
  process.exit(1);
}
