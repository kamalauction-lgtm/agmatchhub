#!/usr/bin/env node
/**
 * Run the test suite against a NAMED database.
 *
 *   node scripts/test.mjs --env=staging                       (what `npm test` does)
 *   node scripts/test.mjs --env=production --i-mean-production
 *   node scripts/test.mjs --env=staging tests/rls/announcements.test.ts
 *
 * Why a launcher and not `vitest` straight from package.json: vitest cannot
 * take `--env=`, and an npm script of the form `DB_ENV=staging vitest` does not
 * work on Windows. So the target is resolved here with the same loader every
 * other script uses (mandatory flag, prints the project ref, refuses a
 * staging file that points at production) and handed to the test processes as
 * `PG_ENV_FILE`. Every test file and the global setup/teardown read only that.
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, restArgs } from "./load-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { fileName, isProduction } = loadEnv();

const args = restArgs().filter((a) => a !== "--i-mean-production");
if (isProduction && !process.argv.includes("--i-mean-production")) {
  console.error(
    "This would run the suite against PRODUCTION. Since 7 Nov 2026 there is a\n" +
      "staging project for that (`npm test`). If you really mean production, add\n" +
      "--i-mean-production. Fixtures are swept afterwards either way."
  );
  process.exit(1);
}

const child = spawn("npx", ["vitest", "run", ...(args.length ? args : ["tests"])], {
  cwd: root,
  env: { ...process.env, PG_ENV_FILE: join(root, fileName) },
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 1));
