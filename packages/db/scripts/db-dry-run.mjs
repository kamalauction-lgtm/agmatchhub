/**
 * Validate pending migrations WITHOUT applying them.
 *
 * Opens a transaction, applies the named migration files, reports what they
 * created, then ROLLS BACK. PostgreSQL DDL is transactional, so the database
 * is byte-identical afterwards. lock_timeout and statement_timeout are set so
 * this can never block a live application.
 *
 * Usage: node scripts/db-dry-run.mjs 00029_x.sql 00030_y.sql
 *        node scripts/db-dry-run.mjs            # all pending migrations
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv, restArgs } from "./load-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { url } = loadEnv();

const dir = join(root, "supabase", "migrations");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const applied = new Set(
  (await client.query("select version from supabase_migrations.schema_migrations")).rows.map(
    (r) => r.version
  )
);

const requested = restArgs();
const files = (requested.length ? requested : readdirSync(dir).filter((f) => f.endsWith(".sql")))
  .filter((f) => requested.length || !applied.has(f.slice(0, 5)))
  .sort();

if (!files.length) {
  console.log("Nothing pending.");
  await client.end();
  process.exit(0);
}

console.log(`Dry run (will ROLL BACK): ${files.join(", ")}\n`);

let failed = null;
await client.query("begin");
await client.query("set local lock_timeout = '3s'");
await client.query("set local statement_timeout = '120s'");

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  process.stdout.write(`  ${f} ... `);
  try {
    await client.query(sql);
    console.log("ok");
  } catch (e) {
    console.log("FAILED");
    failed = { file: f, error: e };
    break;
  }
}

if (!failed) {
  const t = await client.query(`
    select c.relname, c.relrowsecurity as rls,
           (select count(*) from pg_policies p
             where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in (
        'locations','location_aliases','landmarks','properties','property_private',
        'listings','listing_media','listing_price_history','listing_status_history',
        'listing_quality_scores','listing_statistics','listing_embeddings')
    order by c.relname`);
  console.log("\nTables created:");
  for (const r of t.rows) {
    const flag = r.rls ? "RLS" : "*** RLS OFF ***";
    console.log(`  ${r.relname.padEnd(28)} ${flag}  policies=${r.policies}`);
  }
  const missing = t.rows.filter((r) => !r.rls || Number(r.policies) === 0);
  if (missing.length) {
    console.log(`\n  WARNING: ${missing.map((r) => r.relname).join(", ")} lack RLS or policies`);
  }

  const v = await client.query(`
    select table_name from information_schema.views
    where table_schema = 'public' and table_name like 'public\\_%' order by 1`);
  console.log("\nViews created: " + (v.rows.map((r) => r.table_name).join(", ") || "(none)"));

  // The control that matters most: anon must not be able to reach base tables.
  const grants = await client.query(`
    select table_name, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
      and table_name in ('listings','properties','property_private','listing_media',
                         'property_submissions','property_submission_private','users_private')
    group by table_name order by 1`);
  console.log("\nanon grants on protected base tables:");
  if (!grants.rows.length) console.log("  (none — correct)");
  for (const r of grants.rows) console.log(`  *** ${r.table_name}: ${r.privs}`);
}

await client.query("rollback");
await client.end();

if (failed) {
  console.error(`\n${failed.file} failed:\n${failed.error.message}`);
  if (failed.error.position) console.error(`  at character ${failed.error.position}`);
  if (failed.error.hint) console.error(`  hint: ${failed.error.hint}`);
  process.exit(1);
}
console.log("\nRolled back. Database unchanged.");
