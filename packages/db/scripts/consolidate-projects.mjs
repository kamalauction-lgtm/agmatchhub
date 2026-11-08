/**
 * Copy the old MatchHub project's data into the propertiguru project.
 *
 * Kamal, 10 Aug 2026: consolidate onto one Supabase project so there is one
 * bill and one database, then retire the old one.
 *
 *   SOURCE  .env.legacy     jtruwmwinymflkrvuuwd — old MatchHub, live since Jul
 *   TARGET  .env.production   jokyyhvtahiypuzmfydp — the propertiguru project
 *
 *   node scripts/consolidate-projects.mjs            # dry run, rolls back
 *   node scripts/consolidate-projects.mjs --commit
 *
 * Both projects are on migration 51, so the schemas are identical — this copies
 * rows, it does not reshape anything.
 *
 * HOW THE ORDER IS DECIDED
 *   Foreign keys are read from the catalogue and topologically sorted, so
 *   parents land before children. Hand-listing 35 tables in dependency order is
 *   exactly the kind of thing that is wrong in one place and fails at 3am.
 *   Self-referencing tables are fine — a table is never blocked on itself.
 *
 * WHAT IS SKIPPED, AND WHY
 *   Reference data (countries, currencies, languages, roles, locations,
 *   boost_products) already exists in the target, seeded from the same sources.
 *   Copying it would either conflict or duplicate.
 *   brand_settings is a singleton the target already owns, including the
 *   partner-identity flag — overwriting it would resurrect old branding.
 *   id_sequences is merged rather than copied: the target's counter is raised to
 *   whichever side is higher, so future human IDs cannot collide with migrated
 *   ones.
 *
 * WHAT THIS DOES NOT MOVE
 *   Storage objects. Agent licence documents, submission photos and profile
 *   images live in Supabase Storage, not in Postgres. Their PATHS come across,
 *   so the rows are correct, but the FILES must be copied separately or those
 *   links will 404. Reported at the end rather than left as a surprise.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMIT = process.argv.includes("--commit");

function urlFrom(file) {
  for (const line of readFileSync(join(ROOT, file), "utf8").split(/\r?\n/)) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) return m[1].trim();
  }
  throw new Error(`DATABASE_URL missing from ${file}`);
}

/** Present in both, seeded from the same sources — copying causes conflicts. */
const SKIP = new Set([
  "countries", "currencies", "languages", "roles",
  "locations", "location_aliases", "landmarks",
  "boost_products", "credit_products",
  "brand_settings",
  "id_sequences",           // merged separately, below
  "schema_migrations",
]);

const source = new pg.Client({ connectionString: urlFrom(".env.legacy"), ssl: { rejectUnauthorized: false } });
const target = new pg.Client({ connectionString: urlFrom(".env.production"), ssl: { rejectUnauthorized: false } });
await source.connect();
await target.connect();

console.log(`SOURCE  ${new URL(urlFrom(".env.legacy")).username.split(".")[1]}`);
console.log(`TARGET  ${new URL(urlFrom(".env.production")).username.split(".")[1]}`);
console.log(COMMIT ? "\nMODE: COMMIT — changes will be kept\n" : "\nMODE: dry run — everything rolls back\n");

/** Topological sort of public tables by foreign-key dependency. */
async function orderedTables() {
  const tables = (
    await source.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`
    )
  ).rows.map((r) => r.table_name);

  const deps = new Map(tables.map((t) => [t, new Set()]));
  const fks = await source.query(
    `select tc.table_name as child, ccu.table_name as parent
     from information_schema.table_constraints tc
     join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public' and ccu.table_schema = 'public'`
  );
  for (const { child, parent } of fks.rows) {
    if (child !== parent && deps.has(child) && deps.has(parent)) deps.get(child).add(parent);
  }

  const out = [];
  const seen = new Set();
  const visit = (t, stack = new Set()) => {
    if (seen.has(t) || stack.has(t)) return; // cycles: take it as it comes
    stack.add(t);
    for (const p of deps.get(t) ?? []) visit(p, stack);
    stack.delete(t);
    seen.add(t);
    out.push(t);
  };
  tables.forEach((t) => visit(t));
  return out.filter((t) => !SKIP.has(t));
}

/**
 * Generated columns cannot be written to. Supabase defines auth.users.confirmed_at
 * as `generated always as least(email_confirmed_at, phone_confirmed_at)`, and an
 * insert naming it is rejected outright.
 */
async function generatedColumns(schema, table) {
  const r = await source.query(
    `select column_name from information_schema.columns
     where table_schema = $1 and table_name = $2 and is_generated = 'ALWAYS'`,
    [schema, table]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

/**
 * Reference tables are skipped because both projects already have them — but
 * their PRIMARY KEYS were generated independently, so a child row's FK points
 * at an id that means nothing in the target. `roles` is the live case:
 * identical `key` values, completely different uuids, so user_roles.role_id has
 * to be translated rather than copied.
 *
 * Built once, lazily, mapping source id -> target id via the natural key.
 */
const remaps = new Map(); // "table.column" -> Map(sourceId -> targetId)

async function remapFor(refTable, naturalKey) {
  const cacheKey = `${refTable}.${naturalKey}`;
  if (remaps.has(cacheKey)) return remaps.get(cacheKey);

  const [src, tgt] = await Promise.all([
    source.query(`select id, "${naturalKey}" as k from public."${refTable}"`),
    target.query(`select id, "${naturalKey}" as k from public."${refTable}"`),
  ]);
  const byKey = new Map(tgt.rows.map((r) => [r.k, r.id]));
  const map = new Map();
  for (const r of src.rows) {
    const to = byKey.get(r.k);
    if (to) map.set(r.id, to);
    else console.warn(`  ! ${refTable} "${r.k}" has no counterpart in the target`);
  }
  remaps.set(cacheKey, map);
  return map;
}

/** column -> [reference table, natural key] */
const REMAP_COLUMNS = {
  role_id: ["roles", "key"],
};

async function copy(client, table, schema = "public") {
  const src = await source.query(`select * from ${schema}."${table}"`);
  if (!src.rows.length) return 0;

  const generated = await generatedColumns(schema, table);
  const cols = src.fields.map((f) => f.name).filter((c) => !generated.has(c));
  const quoted = cols.map((c) => `"${c}"`).join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");

  // Resolve any FK columns that point at independently-keyed reference tables.
  const translate = {};
  for (const c of cols) {
    if (schema === "public" && REMAP_COLUMNS[c]) {
      translate[c] = await remapFor(...REMAP_COLUMNS[c]);
    }
  }

  let inserted = 0;
  for (const row of src.rows) {
    const values = cols.map((c) =>
      translate[c] && row[c] != null ? translate[c].get(row[c]) ?? row[c] : row[c]
    );
    const r = await client.query(
      `insert into ${schema}."${table}" (${quoted}) values (${placeholders})
       on conflict do nothing`,
      values
    );
    inserted += r.rowCount;
  }
  return inserted;
}

const report = [];
try {
  await target.query("begin");
  // FK checks are deferred to the end of the transaction so that any ordering
  // the topological sort could not resolve (cycles) still lands cleanly.
  await target.query("set constraints all deferred");

  // auth first — everything in public references it.
  for (const t of ["users", "identities"]) {
    const n = await copy(target, t, "auth");
    report.push({ table: `auth.${t}`, copied: n });
  }

  for (const t of await orderedTables()) {
    const n = await copy(target, t);
    if (n > 0) report.push({ table: t, copied: n });
  }

  // Human-readable ID counters: raise the target to whichever side is higher,
  // so the next REQ/SUB/COM issued cannot collide with a migrated one.
  const seqs = await source.query("select * from public.id_sequences");
  let bumped = 0;
  for (const s of seqs.rows) {
    const key = s.prefix ?? s.key ?? Object.values(s)[0];
    const val = s.last_value ?? s.current_value ?? s.counter;
    if (key == null || val == null) continue;
    const r = await target.query(
      `update public.id_sequences set ${"last_value" in s ? "last_value" : "current_value"} = greatest(${"last_value" in s ? "last_value" : "current_value"}, $2)
       where ${"prefix" in s ? "prefix" : "key"} = $1`,
      [key, val]
    );
    bumped += r.rowCount;
  }
  report.push({ table: "id_sequences (bumped)", copied: bumped });

  if (COMMIT) {
    await target.query("commit");
    console.log("COMMITTED\n");
  } else {
    await target.query("rollback");
    console.log("ROLLED BACK (dry run)\n");
  }

  console.table(report);
  console.log(`total rows: ${report.reduce((n, r) => n + r.copied, 0)}`);

  // Storage is not part of this.
  const paths = await source.query(
    `select count(*)::int n from (
       select licence_document_path p from public.agent_profiles where licence_document_path is not null
       union all select identity_document_path from public.agent_profiles where identity_document_path is not null
       union all select profile_photo_path from public.agent_profiles where profile_photo_path is not null
       union all select storage_path from public.property_submission_media
     ) x`
  );
  if (paths.rows[0].n > 0) {
    console.log(
      `\nNOTE: ${paths.rows[0].n} storage path(s) came across, but the FILES did not.\n` +
        `Supabase Storage objects are not in Postgres. Copy the buckets separately,\n` +
        `or those documents and photos will 404 in the new project.`
    );
  }
} catch (e) {
  await target.query("rollback");
  console.error("\nFAILED — nothing was written:", e.message);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.end();
}
