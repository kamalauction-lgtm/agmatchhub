#!/usr/bin/env node
/**
 * Build and deploy the marketplace for one market.
 *
 *   node scripts/deploy-market.mjs id   → .env.production,    wrangler.jsonc
 *   node scripts/deploy-market.mjs my   → .env.my.production, wrangler.my.jsonc
 *
 * WHY A LAUNCHER RATHER THAN TWO npm SCRIPTS
 *   `NEXT_PUBLIC_*` is inlined into the bundle at build time, and Next gives
 *   `.env.local` precedence over `.env.production`. A developer machine almost
 *   always has a `.env.local`, so a plain `next build` can silently produce a
 *   bundle for the wrong market or the wrong database — and the deploy then
 *   succeeds, the site loads, and nothing errors.
 *
 *   The variables are injected into the child process instead. Next does not
 *   override anything already present in `process.env`, so the market is
 *   settled before the build starts rather than hoped for afterwards.
 *
 * The build-target check still runs — belt and braces — and is pointed at the
 * same env file, so it verifies the database AND that the bundle carries this
 * market's app URL.
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");

const MARKETS = {
  id: { envFile: ".env.production", config: "wrangler.jsonc" },
  my: { envFile: ".env.my.production", config: "wrangler.my.jsonc" },
};

const key = (process.argv[2] ?? "").toLowerCase();
const target = MARKETS[key];

if (!target) {
  console.error(
    `Usage: node scripts/deploy-market.mjs <market>\n` +
      `Known markets: ${Object.keys(MARKETS).join(", ")}`
  );
  process.exit(1);
}

const envPath = join(appDir, target.envFile);
if (!existsSync(envPath)) {
  console.error(`Missing ${target.envFile} in apps/www.`);
  process.exit(1);
}

const env = { ...process.env };
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const ref = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1];
console.log(
  `\n  Market      ${env.NEXT_PUBLIC_MARKET ?? "ID (default)"}\n` +
    `  Brand       ${env.NEXT_PUBLIC_APP_NAME ?? "(unset)"}\n` +
    `  Site        ${env.NEXT_PUBLIC_APP_URL ?? "(unset)"}\n` +
    `  Database    ${ref ?? "unknown"}\n` +
    `  Config      ${target.config}\n`
);

/** Run a command to completion, failing the whole deploy if it fails. */
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: appDir,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`))
    );
  });
}

try {
  /* OpenNext does NOT clear its fetch cache between builds, so a correct build
     can still ship a cache full of the previous build's responses — which, with
     two markets, means the other country's listings. */
  for (const dir of [".open-next", ".next"]) {
    rmSync(join(appDir, dir), { recursive: true, force: true });
  }

  await run("npx", ["opennextjs-cloudflare", "build"]);
  await run("node", ["../../scripts/verify-build-target.mjs", `--env=${target.envFile}`]);
  await run("npx", ["opennextjs-cloudflare", "deploy", "--", "--config", target.config]);

  console.log(`\n✓ Deployed the ${key.toUpperCase()} marketplace.\n`);
} catch (err) {
  console.error(`\n✗ Deploy stopped: ${err.message}\n`);
  process.exit(1);
}
