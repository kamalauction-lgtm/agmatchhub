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
 *
 * NOTE: the deploy script deletes .open-next before building, because OpenNext
 * leaves its fetch cache in place across builds. Without that, a bundle built
 * correctly against production still ships a cache full of staging responses.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = process.cwd();
const OUT = join(APP, ".open-next");

// Which env file describes the intended target. Defaults to the Indonesian one,
// so existing invocations are unchanged.
const envArg = process.argv.find((a) => a.startsWith("--env="));
const ENV_FILE = envArg ? envArg.slice(6) : ".env.production";

function fail(message) {
  console.error(`\n✗ Build target check FAILED\n\n${message}\n`);
  process.exit(1);
}

if (!existsSync(OUT)) {
  fail(`No .open-next directory in ${APP}. Run the build before this check.`);
}

// --- what the bundle SHOULD point at ------------------------------------------
const prodEnv = join(APP, ENV_FILE);
if (!existsSync(prodEnv)) {
  fail(`${ENV_FILE} is missing, so there is nothing to verify the build against.`);
}

const envText = readFileSync(prodEnv, "utf8");
const envValue = (key) =>
  envText
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`))
    ?.split("=", 2)[1]
    ?.trim();

const expectedUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
const expectedAppUrl = envValue("NEXT_PUBLIC_APP_URL");

if (!expectedUrl) {
  fail(`NEXT_PUBLIC_SUPABASE_URL is not set in ${ENV_FILE}.`);
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
      continue;
    }
    // Every file, not just *.js — OpenNext's fetch cache under
    // .open-next/cache/__fetch/ stores entries as extensionless hashes, and an
    // earlier version of this check filtered by extension and sailed straight
    // past a cache full of staging responses. Read as utf8 and ignore anything
    // that is not text.
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(REF)) {
      if (!found.has(m[1])) found.set(m[1], path.slice(APP.length + 1));
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

/* --- which MARKET was this bundle built for? -------------------------------
 *
 * The database check above cannot tell the markets apart: they share one
 * Supabase project, so an Indonesian bundle deployed to the Malaysian Worker
 * passes it and then serves rupiah prices and Indonesian place names on a
 * Malaysian domain, with nothing erroring.
 *
 * NOT by the inlined app URL — that was the first attempt and it does not work.
 * The bundle contains BOTH markets' URLs: the market table lists every market
 * and the hub URL is shared, so the check passed on a Malaysian bundle verified
 * against the Indonesian env file. A check that always passes is worse than no
 * check, because it reads as proof.
 *
 * The prerender manifest IS decisive. `generateStaticParams` is built from
 * `routing.locales`, which comes from the market, so the set of prerendered
 * locale routes differs: /id + /en for Indonesia, /en + /ms for Malaysia.
 */

// Mirrors the locale sets in apps/www/src/config/market.ts. Duplicated on
// purpose and deliberately small: this script cannot import TypeScript, and a
// market missing from here fails loudly below rather than being waved through.
const MARKET_LOCALES = {
  ID: ["id", "en"],
  MY: ["en", "ms"],
};

const expectedMarket = (envValue("NEXT_PUBLIC_MARKET") ?? "ID").toUpperCase();
const expectedLocales = MARKET_LOCALES[expectedMarket];

if (!expectedLocales) {
  fail(
    `${ENV_FILE} names market "${expectedMarket}", which this check does not know.\n\n` +
      `Add it to MARKET_LOCALES in this file, mirroring src/config/market.ts.`
  );
}

const manifestPath = join(
  OUT,
  "server-functions",
  "default",
  "apps",
  "www",
  ".next",
  "prerender-manifest.json"
);

if (existsSync(manifestPath)) {
  const routes = Object.keys(JSON.parse(readFileSync(manifestPath, "utf8")).routes ?? {});
  const builtLocales = routes
    .filter((r) => /^\/[a-z]{2}$/.test(r))
    .map((r) => r.slice(1))
    .sort();

  const wanted = [...expectedLocales].sort();
  const mismatch =
    builtLocales.length !== wanted.length ||
    builtLocales.some((l, i) => l !== wanted[i]);

  if (builtLocales.length > 0 && mismatch) {
    fail(
      `The build was made for a different market.\n\n` +
        `  expected : ${expectedMarket} — locales ${wanted.join(", ")}  (from ${ENV_FILE})\n` +
        `  built    : locales ${builtLocales.join(", ")}\n\n` +
        `Both markets share one database, so the Supabase check above cannot see\n` +
        `this. Deploying anyway would put one country's listings, currency and\n` +
        `place names on the other country's domain.\n\n` +
        `Fix: build through the deploy script, which injects the right env file.\n` +
        `    npm run deploy:my     (Malaysia)\n` +
        `    npm run deploy        (Indonesia)`
    );
  }
} else {
  console.warn(
    `  ! No prerender manifest at ${manifestPath.slice(APP.length + 1)} — the market\n` +
      `    could not be verified. The database check above still applies.`
  );
}

console.log(`✓ Build target verified: ${expectedRef}  (${ENV_FILE})`);
