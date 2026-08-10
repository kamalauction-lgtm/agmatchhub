/**
 * Refuse to deploy a bundle built against the wrong database.
 *
 * Next.js gives `.env.local` precedence over `.env.production`, and both apps'
 * `.env.local` gets pointed at staging routinely — it is how every feature in
 * this repo gets verified. `NEXT_PUBLIC_*` values are INLINED INTO THE BUNDLE at
 * build time, so a build run on a developer machine with a staging `.env.local`
 * produces a worker that talks to staging no matter what `wrangler.jsonc` says
 * at runtime. Runtime vars cannot override an inlined constant.
 *
 * The failure is silent and total: the deploy succeeds, the site loads, and the
 * public marketplace serves seeded test listings from the staging project under
 * the staging anon key. Nothing errors. You find out from a customer.
 *
 * So this reads the Supabase project ref out of the built output and compares it
 * against the app's `.env.production`. Any mismatch stops the deploy.
 *
 *   node ../../scripts/verify-build-target.mjs
 *
 * Run from an app directory, after `opennextjs-cloudflare build`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = process.cwd();
const OUT = join(APP, ".open-next");

function fail(message) {
  console.error(`\n✗ Build target check FAILED\n\n${message}\n`);
  process.exit(1);
}

if (!existsSync(OUT)) {
  fail(`No .open-next directory in ${APP}. Run the build before this check.`);
}

// --- what the bundle SHOULD point at ------------------------------------------
const prodEnv = join(APP, ".env.production");
if (!existsSync(prodEnv)) {
  fail(".env.production is missing, so there is nothing to verify the build against.");
}

const expectedUrl = readFileSync(prodEnv, "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_URL="))
  ?.split("=", 2)[1]
  ?.trim();

if (!expectedUrl) {
  fail("NEXT_PUBLIC_SUPABASE_URL is not set in .env.production.");
}

const expectedRef = new URL(expectedUrl).hostname.split(".")[0];

// --- what it ACTUALLY points at ------------------------------------------------
const REF = /https:\/\/([a-z]{20})\.supabase\.co/g;
const found = new Map(); // ref -> first file that contained it

function scan(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      scan(path);
    } else if (/\.(js|mjs|cjs|json)$/.test(entry)) {
      const text = readFileSync(path, "utf8");
      for (const m of text.matchAll(REF)) {
        if (!found.has(m[1])) found.set(m[1], path.slice(APP.length + 1));
      }
    }
  }
}

scan(OUT);

const wrong = [...found.keys()].filter((ref) => ref !== expectedRef);

if (wrong.length) {
  fail(
    `The build is wired to the wrong Supabase project.\n\n` +
      `  expected : ${expectedRef}  (from .env.production)\n` +
      wrong.map((r) => `  found    : ${r}  in ${found.get(r)}`).join("\n") +
      `\n\nAlmost certainly .env.local — it overrides .env.production in Next.js,\n` +
      `and its values are inlined into the bundle, so wrangler.jsonc cannot\n` +
      `correct this at runtime.\n\n` +
      `Fix: move .env.local aside, rebuild, then deploy.\n\n` +
      `    mv .env.local .env.local.dev && npm run deploy && mv .env.local.dev .env.local`
  );
}

if (!found.has(expectedRef)) {
  fail(
    `No Supabase project reference found in the build at all.\n\n` +
      `Expected ${expectedRef}. Either the build is incomplete, or the app no\n` +
      `longer reads NEXT_PUBLIC_SUPABASE_URL — in which case update this check\n` +
      `rather than deleting it.`
  );
}

console.log(`✓ Build target verified: ${expectedRef}`);
