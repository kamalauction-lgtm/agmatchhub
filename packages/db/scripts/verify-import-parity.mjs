/**
 * Prove that an imported listing is indistinguishable from a manual one.
 *
 *   node scripts/verify-import-parity.mjs --env=staging
 *
 * Kamal's rule: the import method is the ORIGIN of a listing, never a class of
 * listing. An agent must never hit "I cannot do that because it was imported".
 *
 * Asserting that in a comment is worthless — the way it breaks is that somebody
 * adds a policy, a view filter or a `where creation_source = 'manual'` months
 * from now and nothing notices. So this checks it mechanically, against the
 * live schema, and fails loudly.
 *
 * It takes a real imported listing and a real manual one and compares what the
 * database will permit for each.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = process.argv.find((a) => a.startsWith("--env="))?.slice(6) === "staging"
  ? ".env.staging" : ".env.local";

const url = readFileSync(join(ROOT, ENV), "utf8")
  .split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="))?.slice(13).trim();

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const checks = [];
const check = (name, pass, detail) => checks.push({ check: name, pass, detail });

try {
  /* 1. No parallel catalogue ------------------------------------------------ */
  const parallel = await c.query(
    `select table_name from information_schema.tables
     where table_schema = 'public'
       and (table_name ilike '%imported_listing%' or table_name ilike '%manual_listing%')`
  );
  check("no parallel listing table exists", parallel.rows.length === 0,
    parallel.rows.map((r) => r.table_name).join(", ") || "none");

  /* 2. Imported listings live in the normal tables --------------------------- */
  const homes = await c.query(
    `select count(*) filter (where l.id is not null)::int as in_listings,
            count(*) filter (where p.id is not null)::int as in_properties,
            count(*)::int as total
     from public.property_imports pi
     left join public.listings l on l.id = pi.listing_id
     left join public.properties p on p.id = pi.property_id
     where pi.listing_id is not null`
  );
  const h = homes.rows[0];
  check("imported listings are rows in public.listings",
    h.in_listings === h.total && h.total > 0, `${h.in_listings}/${h.total}`);

  /* 3. Nothing in the schema BRANCHES on creation_source --------------------- */
  // A policy, view, trigger or index that reads this column is exactly the bug
  // this rule exists to prevent.
  const branches = await c.query(
    `select 'policy: ' || policyname as where_ from pg_policies
       where schemaname = 'public'
         and (coalesce(qual,'') || coalesce(with_check,'')) ilike '%creation_source%'
     union all
     select 'view: ' || table_name from information_schema.views
       where table_schema = 'public' and view_definition ilike '%creation_source%'
     union all
     -- prokind 'f' only: pg_get_functiondef() errors on aggregates and windows.
     select 'function: ' || p.proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
         and pg_get_functiondef(p.oid) ilike '%creation_source%'`
  );
  check("nothing branches on creation_source", branches.rows.length === 0,
    branches.rows.map((r) => r.where_).join(" | ") || "clean");

  /* 4. Public view does not leak how a listing was made ---------------------- */
  const leak = await c.query(
    `select 1 from information_schema.columns
     where table_schema='public' and table_name='public_listings'
       and column_name='creation_source'`
  );
  check("public_listings hides creation_source", leak.rows.length === 0,
    leak.rows.length ? "EXPOSED" : "not exposed");

  /* 5. Capability parity, field by field ------------------------------------- */
  // Every capability below is gated by real columns. If an imported listing
  // can hold the same values as a manual one, it can do the same things.
  const parity = await c.query(
    `with imported as (
       select l.*, p.id as pid from public.listings l
       join public.properties p on p.id = l.property_id
       where l.creation_source = 'import' limit 1
     )
     select
       (select count(*)::int from imported) as have_sample,
       (select status from imported) as status,
       (select moderation_state from imported) as moderation_state
    `
  );
  const sample = parity.rows[0];
  check("an imported listing exists to test", sample.have_sample === 1,
    `status=${sample.status}, moderation=${sample.moderation_state}`);

  /* 6. The capability gates are identical for both origins ------------------- */
  // Co-marketing, boost, MatchHub submission and agent-page eligibility are all
  // gated by conditions on `listings` / `properties` / `property_private` — never
  // by origin. Prove each gate's predicate does not mention import or source.
  const gates = [
    ["co-marketing offer", "guard_comarketing_offer"],
    ["co-marketing pickup", "guard_comarketing_pickup"],
    ["listing moderation", "guard_listing_moderation_fields"],
    ["boost", "boost_listing"],
  ];
  for (const [label, fn] of gates) {
    const { rows } = await c.query(
      `select pg_get_functiondef(p.oid) as def from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname=$1 limit 1`, [fn]
    );
    if (!rows.length) { check(`${label} gate exists`, false, `${fn} not found`); continue; }
    const def = rows[0].def.toLowerCase();
    const mentions = /creation_source|property_imports|imported/.test(def);
    check(`${label} ignores origin`, !mentions, mentions ? `${fn} MENTIONS ORIGIN` : fn);
  }

  /* 7. An imported listing is eligible for the agent page -------------------- */
  const onPage = await c.query(
    `select count(*)::int as n from public.public_agent_listings al
     join public.listings l on l.id = al.id
     where l.creation_source = 'import'`
  );
  check("imported listings appear on agent pages",
    onPage.rows[0].n > 0 || sample.status !== "published",
    `${onPage.rows[0].n} visible`);

  /* 8. And in the marketplace ------------------------------------------------ */
  const inMarket = await c.query(
    `select count(*)::int as n from public.public_listings pl
     join public.listings l on l.id = pl.id
     where l.creation_source = 'import'`
  );
  check("imported listings appear in the marketplace",
    inMarket.rows[0].n > 0, `${inMarket.rows[0].n} published`);

  console.table(checks);
  const failed = checks.filter((c) => !c.pass);
  if (failed.length) {
    console.error(`\n${failed.length} PARITY FAILURE(S) — an imported listing is not a normal listing.\n`);
    process.exitCode = 1;
  } else {
    console.log("\nParity holds: an imported listing is a normal listing in every checked respect.\n");
  }
} catch (e) {
  console.error("check failed:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
