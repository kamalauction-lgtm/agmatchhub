/**
 * P0-d-1b: one-off correction of market vocabulary on four STAGING properties.
 *
 * The database accepts both markets' property types on any property (00075),
 * and before P0-d-1b nothing stopped them being mixed. Four staging rows held
 * the other market's key. The owner approved correcting them on
 * 11 Nov 2026 ("Approve corrections"); it was applied that day and audited.
 * This file is kept as the record of what was done and the way to undo it.
 *
 *   PRP-2026-800009  ID  cluster_home -> rumah    demo seed item 9
 *   PRP-2026-800015  ID  office_space -> kantor   demo seed item 15
 *   PRP-2026-800019  ID  townhouse    -> rumah    demo seed item 19
 *   PRP-2026-000236  MY  rumah        -> terrace  the P0-a regression fixture
 *
 * Each Indonesian target is the key Indonesian ingest already maps the
 * Malaysian one to (apps/hub/src/lib/ingest/normalise.ts). No country,
 * currency, unit, language or category changes: every category is the same
 * before and after. The demo seed itself was fixed in the same PR, so a
 * reseed does not bring the old keys back.
 *
 * NOT INCLUDED: PRP-2026-800016 (a Bali villa, `leasehold_other`). The
 * Indonesian vocabulary has no lease tenure, and that is an owner decision.
 *
 * Usage (target is mandatory, see load-env.mjs):
 *   node scripts/correct-listing-vocabulary.mjs --env=staging            # apply
 *   node scripts/correct-listing-vocabulary.mjs --env=staging --revert   # roll back
 *
 * Safety:
 *   · STAGING ONLY. It refuses any project but propertiguru-staging, by
 *     Supabase project ref rather than by file name.
 *   · ONE TRANSACTION. Each update applies only while the row still holds the
 *     expected old value (and the expected country). If any of the four does
 *     not, nothing is applied. A second run of an applied correction is
 *     therefore refused, and so is a revert of one that was never applied.
 *   · AUDITED. Every change writes `property.vocabulary_corrected` through
 *     public.log_audit, with the old and new values and the reason.
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const STAGING_REF = "aylzekkeurjsudazzxjv";

const { url, ref } = loadEnv();
if (ref !== STAGING_REF) {
  console.error(`Refusing: this correction is for staging (${STAGING_REF}) only, not ${ref}.`);
  process.exit(1);
}
const revert = process.argv.includes("--revert");

const ROWS = [
  { id: "3a86a7f8-0bd3-4eec-9dcc-ebdd8156bf7c", hid: "PRP-2026-800009", country: "ID", from: "cluster_home", to: "rumah",
    why: "Malaysian key on an Indonesian property; Indonesian ingest maps cluster house to rumah" },
  { id: "55d6ada4-5471-42fb-b07d-5cf9823aa7fd", hid: "PRP-2026-800015", country: "ID", from: "office_space", to: "kantor",
    why: "Malaysian key on an Indonesian property; Indonesian ingest maps office to kantor" },
  { id: "c8d6a00c-f753-4143-bb45-aa6782bcdcad", hid: "PRP-2026-800019", country: "ID", from: "townhouse", to: "rumah",
    why: "Malaysian key on an Indonesian property; Indonesian ingest maps townhouse to rumah" },
  { id: "3fb59cdc-8afa-4072-afcb-83d0a5dfb563", hid: "PRP-2026-000236", country: "MY", from: "rumah", to: "terrace",
    why: "Indonesian key on a Malaysian P0-a test fixture" },
];
const REASON = revert
  ? "Revert of P0-d-1b vocabulary correction (owner-approved 11 Nov 2026)"
  : "P0-d-1b vocabulary correction, owner-approved 11 Nov 2026";

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  for (const r of ROWS) {
    const [oldV, newV] = revert ? [r.to, r.from] : [r.from, r.to];
    const res = await client.query(
      "update public.properties set property_type = $1 where id = $2 and country_code = $3 and property_type = $4",
      [newV, r.id, r.country, oldV],
    );
    if (res.rowCount !== 1) {
      throw new Error(`${r.hid}: expected property_type '${oldV}' in ${r.country}, but the row has changed (already applied?)`);
    }
    await client.query("select public.log_audit($1, 'property', $2, $3::jsonb, $4::jsonb, $5)", [
      "property.vocabulary_corrected",
      r.id,
      JSON.stringify({ property_type: oldV }),
      JSON.stringify({ property_type: newV, human_readable_id: r.hid, basis: r.why }),
      REASON,
    ]);
    console.log(`  ${r.hid}: ${oldV} -> ${newV}`);
  }
  await client.query("commit");
  console.log(revert ? "Reverted." : "Applied.");
} catch (e) {
  await client.query("rollback");
  console.error(`Nothing applied: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
