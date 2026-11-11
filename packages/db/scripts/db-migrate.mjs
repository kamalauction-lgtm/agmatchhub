/**
 * Simple migration runner. Applies supabase/migrations/*.sql in filename order,
 * tracking applied versions in supabase_migrations.schema_migrations
 * (same table the Supabase CLI uses, so we can switch to `supabase db push` later).
 *
 * Usage (target is mandatory — see load-env.mjs):
 *   node scripts/db-migrate.mjs --env=staging              # apply pending
 *   node scripts/db-migrate.mjs --env=staging --status     # list applied/pending
 *   node scripts/db-migrate.mjs --env=production           # only after staging
 *   node scripts/db-migrate.mjs --env=production --to=00117   # stop after 00117
 *   node scripts/db-migrate.mjs --env=production --hold=00118 # all pending but 00118
 *
 * --to=NNNNN applies pending migrations up to and including that version and
 * leaves later ones pending. It exists for releases where a migration must
 * follow a code deploy (00118 after the Hub upload code; see
 * docs/release/p1b4-profile-photos-release.md). An unknown version is refused.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { url } = loadEnv();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
`);

const applied = new Set(
  (await client.query("select version from supabase_migrations.schema_migrations")).rows.map(r => r.version),
);

const dir = join(root, "supabase", "migrations");
const allFiles = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
const toArg = process.argv.find(a => a.startsWith("--to="))?.slice(5);
if (toArg !== undefined && !/^\d{5}$/.test(toArg)) { console.error("--to must be a 5-digit version, e.g. --to=00117"); process.exit(1); }
if (toArg && !allFiles.some(f => f.startsWith(toArg + "_"))) { console.error(`--to=${toArg}: no such migration`); process.exit(1); }
// --hold=NNNNN[,NNNNN] leaves exactly those versions pending (later ones still
// apply). The 2.0 release needs it: the Hub code requires 00119 before it is
// deployed, while 00118 must follow the deploy.
const holdArg = process.argv.find(a => a.startsWith("--hold="))?.slice(7);
const holds = holdArg === undefined ? [] : holdArg.split(",").map(s => s.trim());
for (const h of holds) {
  if (!/^\d{5}$/.test(h)) { console.error("--hold takes 5-digit versions, e.g. --hold=00118"); process.exit(1); }
  if (!allFiles.some(f => f.startsWith(h + "_"))) { console.error(`--hold=${h}: no such migration`); process.exit(1); }
}
const files = allFiles
  .filter(f => !toArg || f.split("_")[0] <= toArg)
  .filter(f => !holds.includes(f.split("_")[0]));
const held = allFiles.filter(f => !applied.has(f.split("_")[0])).length - files.filter(f => !applied.has(f.split("_")[0])).length;

if (process.argv.includes("--status")) {
  for (const file of allFiles) {
    const version = file.split("_")[0];
    console.log(`${applied.has(version) ? "applied" : files.includes(file) ? "PENDING" : "HELD   "}  ${file}`);
  }
}

let ran = 0;
for (const file of process.argv.includes("--status") ? [] : files) {
  const version = file.replace(/\.sql$/, "").split("_")[0];
  const isApplied = applied.has(version);
  if (isApplied) continue;
  const sql = readFileSync(join(dir, file), "utf8");
  console.log(`applying ${file} ...`);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
      [version, file],
    );
    await client.query("commit");
    ran++;
    console.log(`  ok`);
  } catch (err) {
    await client.query("rollback");
    console.error(`  FAILED: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

if (!process.argv.includes("--status")) console.log(`${ran} migration(s) applied.${held ? ` ${held} pending migration(s) held by --to/--hold.` : ""}`);
await client.end();
