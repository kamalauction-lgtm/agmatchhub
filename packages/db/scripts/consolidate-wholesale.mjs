/**
 * Move the old MatchHub project wholesale into the propertiguru project.
 *
 * Kamal, 10 Aug 2026: consolidate onto one Supabase project, keep every user's
 * password so nobody notices anything changed, then delete the old project.
 *
 *   SOURCE  .env.legacy     jtruwmwinymflkrvuuwd — old MatchHub, real data
 *   TARGET  .env.production   jokyyhvtahiypuzmfydp — the propertiguru project
 *
 *   node scripts/consolidate-wholesale.mjs            # dry run, rolls back
 *   node scripts/consolidate-wholesale.mjs --commit
 *
 * WHY WHOLESALE RATHER THAN MERGE
 *   The merge attempt (consolidate-projects.mjs) foundered on natural keys:
 *   both projects seeded `roles`, `declarations`, `legal_disclosures` and
 *   friends independently, so identical keys carry different uuids. Merging
 *   means translating every one of those FKs, and `on conflict do nothing`
 *   silently skips the parent and orphans its children — a failure that reports
 *   success. Taking the source as truth removes the entire class of problem:
 *   nothing is reconciled, so nothing can be reconciled wrongly.
 *
 * WHAT THIS DESTROYS, and why that is acceptable
 *   Everything currently in the target: 3 seeded users, the demo catalogue, the
 *   sample banners. All of it is reproducible from scripts in this directory.
 *   The target's identity flag returns to its default (hidden), which is where
 *   it already sits.
 *
 * WHAT SURVIVES
 *   Passwords. auth.users comes across with encrypted_password and
 *   auth.identities intact, so all 9 agents sign in exactly as before — no
 *   reset emails, no announcement needed.
 *
 * WHAT THIS STILL DOES NOT MOVE
 *   Supabase Storage objects. Licence documents, identity documents and
 *   submission photos are files, not rows. Their paths come across so the data
 *   is correct, but the files need a bucket copy or those links 404. Reported
 *   at the end.
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

const source = new pg.Client({ connectionString: urlFrom(".env.legacy"), ssl: { rejectUnauthorized: false } });
const target = new pg.Client({ connectionString: urlFrom(".env.production"), ssl: { rejectUnauthorized: false } });
await source.connect();
await target.connect();

const ref = (u) => new URL(u).username.split(".")[1];
console.log(`SOURCE  ${ref(urlFrom(".env.legacy"))}  (taken as truth)`);
console.log(`TARGET  ${ref(urlFrom(".env.production"))}  (cleared, then filled)`);
console.log(COMMIT ? "\nMODE: COMMIT\n" : "\nMODE: dry run — everything rolls back\n");

/** Public base tables, parents before children. */
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

  const out = [], seen = new Set();
  const visit = (t, stack = new Set()) => {
    if (seen.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const p of deps.get(t) ?? []) visit(p, stack);
    stack.delete(t);
    seen.add(t);
    out.push(t);
  };
  tables.forEach((t) => visit(t));
  return out;
}

/** `generated always` columns reject any supplied value. */
async function writableColumns(schema, table, fields) {
  const r = await source.query(
    `select column_name from information_schema.columns
     where table_schema = $1 and table_name = $2 and is_generated = 'ALWAYS'`,
    [schema, table]
  );
  const generated = new Set(r.rows.map((x) => x.column_name));
  return fields.filter((c) => !generated.has(c));
}

async function copy(table, schema = "public") {
  const src = await source.query(`select * from ${schema}."${table}"`);
  if (!src.rows.length) return 0;

  const cols = await writableColumns(schema, table, src.fields.map((f) => f.name));
  const quoted = cols.map((c) => `"${c}"`).join(", ");
  const params = cols.map((_, i) => `$${i + 1}`).join(", ");

  // Batched, not row-by-row. `locations` alone is 7,763 rows, and one
  // round-trip each kept the transaction open long enough for the Supavisor
  // pooler to drop the connection mid-copy.
  const BATCH = 500;
  let n = 0;
  for (let i = 0; i < src.rows.length; i += BATCH) {
    const chunk = src.rows.slice(i, i + BATCH);
    const values = [];
    const tuples = chunk.map((row, r) => {
      const ph = cols.map((_, c) => `$${r * cols.length + c + 1}`);
      cols.forEach((c) => values.push(row[c]));
      return `(${ph.join(", ")})`;
    });
    const res = await target.query(
      `insert into ${schema}."${table}" (${quoted}) values ${tuples.join(", ")} on conflict do nothing`,
      values
    );
    n += res.rowCount;
  }
  return n;
}

const report = [];
try {
  const tables = await orderedTables();

  await target.query("begin");
  await target.query("set constraints all deferred");

  // 1. Clear public FIRST. Several public tables reference auth.users WITHOUT
  //    on delete cascade — listings.moderated_by among them — so deleting users
  //    ahead of this is refused by the constraint. TRUNCATE in one statement so
  //    FK order within public does not matter.
  const list = tables.map((t) => `public."${t}"`).join(", ");
  await target.query(`truncate ${list} restart identity cascade`);
  report.push({ step: "truncated public tables", rows: tables.length });

  // 2. Now auth can go. Cascades to identities, sessions and refresh tokens.
  const cleared = await target.query("delete from auth.users");
  report.push({ step: "cleared target auth.users", rows: cleared.rowCount });

  // 3. Auth first — every public actor column points at it.
  for (const t of ["users", "identities"]) {
    report.push({ step: `auth.${t}`, rows: await copy(t, "auth") });
  }

  // 4. Supabase's handle_new_user trigger fires on those inserts and writes
  //    profiles rows of its own. They would collide with the real ones, so
  //    clear public once more now that auth is populated.
  await target.query(`truncate ${list} restart identity cascade`);

  // 5. Everything else, source ids intact.
  let total = 0;
  for (const t of tables) {
    const n = await copy(t);
    if (n > 0) { report.push({ step: t, rows: n }); total += n; }
  }

  // Verify before deciding: every table must match the source exactly.
  const mismatches = [];
  for (const t of tables) {
    const [a, b] = await Promise.all([
      source.query(`select count(*)::int n from public."${t}"`),
      target.query(`select count(*)::int n from public."${t}"`),
    ]);
    if (a.rows[0].n !== b.rows[0].n) {
      mismatches.push({ table: t, source: a.rows[0].n, target: b.rows[0].n });
    }
  }
  const [au, tu] = await Promise.all([
    source.query("select count(*)::int n from auth.users"),
    target.query("select count(*)::int n from auth.users"),
  ]);
  if (au.rows[0].n !== tu.rows[0].n) {
    mismatches.push({ table: "auth.users", source: au.rows[0].n, target: tu.rows[0].n });
  }

  if (mismatches.length) {
    await target.query("rollback");
    console.error("\nROW COUNTS DO NOT MATCH — rolled back, nothing written:\n");
    console.table(mismatches);
    process.exitCode = 1;
  } else if (COMMIT) {
    await target.query("commit");
    console.log(`COMMITTED — ${total} rows, every table matches the source\n`);
  } else {
    await target.query("rollback");
    console.log(`ROLLED BACK (dry run) — would copy ${total} rows, every table matches\n`);
  }

  console.table(report.filter((r) => r.rows > 0));

  const files = await source.query(
    `select count(*)::int n from (
       select licence_document_path p from public.agent_profiles where licence_document_path is not null
       union all select identity_document_path from public.agent_profiles where identity_document_path is not null
       union all select agency_document_path from public.agent_profiles where agency_document_path is not null
       union all select profile_photo_path from public.agent_profiles where profile_photo_path is not null
       union all select storage_path from public.property_submission_media
     ) x`
  );
  if (files.rows[0].n) {
    console.log(
      `\nSTORAGE: ${files.rows[0].n} file path(s) moved, but the files themselves did not.\n` +
        `Copy the Storage buckets across, or those documents and photos will 404.`
    );
  }
} catch (e) {
  await target.query("rollback");
  console.error("\nFAILED — nothing written:", e.message);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.end();
}
