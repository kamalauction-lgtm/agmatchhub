/**
 * Simple migration runner. Applies supabase/migrations/*.sql in filename order,
 * tracking applied versions in supabase_migrations.schema_migrations
 * (same table the Supabase CLI uses, so we can switch to `supabase db push` later).
 *
 * Usage: DATABASE_URL must be set (reads .env.local automatically).
 *   node scripts/db-migrate.mjs           # apply pending
 *   node scripts/db-migrate.mjs --status  # list applied/pending
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader (no dotenv dependency)
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set (add it to .env.local)");
  process.exit(1);
}

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
const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

let ran = 0;
for (const file of files) {
  const version = file.replace(/\.sql$/, "").split("_")[0];
  const isApplied = applied.has(version);
  if (process.argv.includes("--status")) {
    console.log(`${isApplied ? "applied" : "PENDING"}  ${file}`);
    continue;
  }
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

if (!process.argv.includes("--status")) console.log(`${ran} migration(s) applied.`);
await client.end();
