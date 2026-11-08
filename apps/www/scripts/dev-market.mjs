#!/usr/bin/env node
/**
 * Run the marketplace dev server for a named market.
 *
 *   node scripts/dev-market.mjs my     → .env.my.local, port 8155
 *   node scripts/dev-market.mjs id     → .env.local,    port 8154
 *
 * WHY A LAUNCHER AND NOT JUST AN ENV FILE
 *   Next loads `.env.local` automatically and nothing else, so a second market
 *   cannot simply have a second file — `next dev` would read the Indonesian
 *   one and silently serve Indonesia on the Malaysian port. The variables are
 *   injected into the child process instead, which Next will not override
 *   because anything already in `process.env` wins.
 *
 * WHY NOT `set VAR=... && next dev`
 *   That is shell-specific; this repo is developed on Windows and deployed
 *   from POSIX CI. A tiny launcher is less fragile than two copies of the
 *   command, and it prints the market it is about to serve — which is the
 *   whole point, given both markets share one database.
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");

const marketArg = (process.argv[2] ?? "id").toLowerCase();
const PORTS = { id: "8154", my: "8155" };

const envFile = marketArg === "id" ? ".env.local" : `.env.${marketArg}.local`;
const envPath = join(appDir, envFile);

if (!existsSync(envPath)) {
  console.error(
    `No ${envFile} in apps/www.\n` +
      `Known markets: ${Object.keys(PORTS).join(", ")}.`
  );
  process.exit(1);
}

const env = { ...process.env };
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const port = PORTS[marketArg] ?? "8154";
const ref = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1];

console.log(
  `\n  Market      ${env.NEXT_PUBLIC_MARKET ?? "ID (default)"}\n` +
    `  Brand       ${env.NEXT_PUBLIC_APP_NAME ?? "(unset)"}\n` +
    `  Database    ${ref ?? "unknown"}\n` +
    `  Listening   http://localhost:${port}\n`
);

spawn("npx", ["next", "dev", "--port", port], {
  cwd: appDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
}).on("exit", (code) => process.exit(code ?? 0));
