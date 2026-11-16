/**
 * One-off: set the location of six PRODUCTION properties imported without one.
 * Owner-approved 11 Nov 2026 ("Approve the six"), on the evidence in
 * docs/design/location-data-proposal.md.
 *
 * Evidence: each listing's description names its project and unit number,
 * which matches exactly one record in the import source
 * (scripts/import/ifca-normalized.json), whose `address_raw` gives the place.
 *
 *   PRP-2026-000137  LST-2026-000107  Green Park View G1854      source no. 7
 *     "… Duri Kosambi, Cengkareng, West Jakarta City …" -> district Cengkareng
 *   PRP-2026-000138  LST-2026-000108  Vasanta Innopark A#C38-19  source no. 8
 *   PRP-2026-000139  LST-2026-000109  Vasanta Innopark A#C38-18  source no. 9
 *   PRP-2026-000142  LST-2026-000112  Vasanta Innopark A#C38-01  source no. 12
 *   PRP-2026-000150  LST-2026-000119  Vasanta Innopark A#A38-17  source no. 20
 *   PRP-2026-000151  LST-2026-000120  Vasanta Innopark A#A38-16  source no. 21
 *     "… Kota Industri MM2100, Cikarang, Jawa Barat …" -> regency Kab. Bekasi
 *     (every Cikarang district is under Kab. Bekasi; WHICH one is not in the
 *     evidence, so the district is deliberately left unset)
 *
 * Columns written, from the location row: location_id, ancestor_location_ids
 * (the location's ancestors plus itself, as the listing form stores them),
 * province_name, regency_name, and district_name for the district case.
 * general_address is not touched (the source address is the developer's
 * estate or office, not the unit).
 *
 * Usage (target is mandatory, see load-env.mjs):
 *   node scripts/set-listing-locations.mjs --env=production             # dry run: prints the plan, writes nothing
 *   node scripts/set-listing-locations.mjs --env=production --apply     # apply
 *   node scripts/set-listing-locations.mjs --env=production --revert    # roll back
 *
 * Safety:
 *   · PRODUCTION ONLY: these rows exist nowhere else. Refused by project ref.
 *   · ONE TRANSACTION. Apply touches a row only while its location_id is still
 *     null; revert only while it still holds exactly what apply wrote. If any
 *     of the six does not match, nothing is applied. Reruns are refused.
 *   · AUDITED: one `property.location_set` (or `property.location_reverted`)
 *     row per property through public.log_audit, with the evidence.
 */
import pg from "pg";
import { loadEnv, PRODUCTION_REF } from "./load-env.mjs";

const { url, ref } = loadEnv();
if (ref !== PRODUCTION_REF) {
  console.error(`Refusing: these six properties exist only in production (${PRODUCTION_REF}), not ${ref}.`);
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const revert = process.argv.includes("--revert");
if (apply && revert) {
  console.error("Choose --apply or --revert, not both.");
  process.exit(1);
}

const CENGKARENG = "f516bd1a-54f5-4aa5-8ed2-6306ab5efcbe"; // DKI Jakarta › Jakarta Barat › Cengkareng (district)
const KAB_BEKASI = "21bb7ad9-98b1-4a21-8397-687259938cce"; // Jawa Barat › Kab. Bekasi (regency)

const ROWS = [
  { id: "74f3a9d7-3722-42cc-99ea-e9c7924574f6", hid: "PRP-2026-000137", lst: "LST-2026-000107", loc: CENGKARENG, basis: "IFCA source no. 7, unit G1854: Duri Kosambi, Cengkareng, West Jakarta" },
  { id: "f2f079f4-28b6-42df-9887-31ee2780c685", hid: "PRP-2026-000138", lst: "LST-2026-000108", loc: KAB_BEKASI, basis: "IFCA source no. 8, unit A#C38-19: Kota Industri MM2100, Cikarang, Jawa Barat (district not established)" },
  { id: "a53e78b0-4961-4a9f-9594-c8980bbbec27", hid: "PRP-2026-000139", lst: "LST-2026-000109", loc: KAB_BEKASI, basis: "IFCA source no. 9, unit A#C38-18: Kota Industri MM2100, Cikarang, Jawa Barat (district not established)" },
  { id: "dbbe0fb1-0af5-4b3a-9bce-95b8649425af", hid: "PRP-2026-000142", lst: "LST-2026-000112", loc: KAB_BEKASI, basis: "IFCA source no. 12, unit A#C38-01: Kota Industri MM2100, Cikarang, Jawa Barat (district not established)" },
  { id: "83a4ec62-4b93-4194-aac8-f98ee2127360", hid: "PRP-2026-000150", lst: "LST-2026-000119", loc: KAB_BEKASI, basis: "IFCA source no. 20, unit A#A38-17: Kota Industri MM2100, Cikarang, Jawa Barat (district not established)" },
  { id: "5da3cfad-7783-479c-8e24-3bc3590f9a1a", hid: "PRP-2026-000151", lst: "LST-2026-000120", loc: KAB_BEKASI, basis: "IFCA source no. 21, unit A#A38-16: Kota Industri MM2100, Cikarang, Jawa Barat (district not established)" },
];
const REASON = "Location set from import-source address, owner-approved 11 Nov 2026";

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  if (!apply && !revert) await client.query("set transaction read only");

  for (const r of ROWS) {
    const { rows: [loc] } = await client.query(
      "select id, level, name, path_names, ancestor_ids, country_code, is_active from public.locations where id = $1",
      [r.loc],
    );
    if (!loc || loc.country_code !== "ID" || !loc.is_active) throw new Error(`${r.hid}: target location ${r.loc} missing, inactive or not ID`);
    const target = {
      location_id: loc.id,
      ancestor_location_ids: [...(loc.ancestor_ids ?? []), loc.id],
      province_name: loc.path_names[0] ?? null,
      regency_name: loc.path_names[1] ?? null,
      district_name: loc.level === "district" ? loc.path_names[2] ?? null : null,
    };
    const empty = { location_id: null, ancestor_location_ids: [], province_name: null, regency_name: null, district_name: null };
    const [from, to] = revert ? [target, empty] : [empty, target];

    if (!apply && !revert) {
      const { rows: [cur] } = await client.query(
        "select location_id, province_name, regency_name, district_name from public.properties where id = $1 and country_code = 'ID'",
        [r.id],
      );
      const ready = cur && cur.location_id === null && cur.province_name === null && cur.regency_name === null && cur.district_name === null;
      console.log(`  ${ready ? "would set" : "SKIP (not empty)"}  ${r.hid} / ${r.lst} -> ${loc.path_names.join(" › ")} (${loc.level})`);
      continue;
    }

    const res = await client.query(
      `update public.properties
          set location_id = $2, ancestor_location_ids = $3::uuid[], province_name = $4, regency_name = $5, district_name = $6
        where id = $1 and country_code = 'ID'
          and location_id is not distinct from $7 and province_name is not distinct from $8
          and regency_name is not distinct from $9 and district_name is not distinct from $10`,
      [r.id, to.location_id, to.ancestor_location_ids, to.province_name, to.regency_name, to.district_name,
       from.location_id, from.province_name, from.regency_name, from.district_name],
    );
    if (res.rowCount !== 1) throw new Error(`${r.hid}: row is not in the expected state (already ${revert ? "reverted" : "applied"}?)`);
    await client.query("select public.log_audit($1, 'property', $2, $3::jsonb, $4::jsonb, $5)", [
      revert ? "property.location_reverted" : "property.location_set",
      r.id,
      JSON.stringify(from),
      JSON.stringify({ ...to, human_readable_id: r.hid, listing: r.lst, basis: r.basis }),
      revert ? `Revert: ${REASON}` : REASON,
    ]);
    console.log(`  ${revert ? "reverted" : "set"}  ${r.hid} / ${r.lst} -> ${revert ? "(none)" : loc.path_names.join(" › ")}`);
  }

  if (apply || revert) {
    await client.query("commit");
    console.log(revert ? "Reverted." : "Applied.");
  } else {
    await client.query("rollback");
    console.log("Dry run: nothing written. Re-run with --apply to write.");
  }
} catch (e) {
  await client.query("rollback");
  console.error(`Nothing applied: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
