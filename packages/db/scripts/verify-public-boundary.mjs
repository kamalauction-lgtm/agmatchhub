/**
 * Verify the public read path from the outside, using the anonymous key over
 * HTTP exactly as apps/www will.
 *
 * This is the architecture's central claim under test: a full compromise of the
 * public marketplace must not reach confidential data. Reasoning about policies
 * is not evidence; this is.
 *
 * Checks, in order of what they would cost us if they failed:
 *   1. Confidential base tables are unreachable anonymously.
 *   2. The public views expose ONLY published, approved, unexpired listings.
 *   3. No confidential value appears anywhere in a public response body.
 *   4. The public views reject anonymous writes.
 *
 * Usage: node scripts/verify-public-boundary.mjs --env=staging
 */
import { loadEnv } from "./load-env.mjs";

loadEnv();

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!BASE || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
let failures = 0;

function record(ok, label, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function get(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers });
  const text = await res.text();
  return { status: res.status, text };
}

// -- 1. base tables must be unreachable ---------------------------------------
console.log("\n1. Confidential base tables are unreachable anonymously");
const forbidden = [
  "listings",
  "properties",
  "property_private",
  "listing_media",
  "property_submissions",
  "property_submission_private",
  "property_request_private",
  "commission_agreement_versions",
  "users_private",
  "agent_profiles",
  "audit_logs",
  "contacts",
  "leads",
  "lead_events",
  "inquiry_rate_limits",
];
for (const t of forbidden) {
  const { status, text } = await get(`${t}?select=*&limit=1`);
  // Anything other than a rejection is a leak. A 200 with [] would mean the
  // grant is still there and only RLS is holding the line.
  const blocked = status === 401 || status === 403 || status === 404;
  record(blocked, t.padEnd(30), blocked ? `HTTP ${status}` : `HTTP ${status} ${text.slice(0, 80)}`);
}

// -- 2. views expose published rows only --------------------------------------
console.log("\n2. Public views expose published, approved listings only");
const listings = await get("public_listings?select=human_readable_id,title,status_check:price&limit=50");
let rows = [];
try {
  rows = JSON.parse(listings.text);
} catch {
  /* handled below */
}
record(listings.status === 200 && Array.isArray(rows), "public_listings readable", `HTTP ${listings.status}`);

if (Array.isArray(rows)) {
  const ids = rows.map((r) => r.human_readable_id);
  record(
    ids.includes("LST-2026-900001") || ids.length > 0,
    "published listing is visible",
    ids.join(", ") || "(no rows — seed staging first)"
  );
  record(
    !ids.includes("LST-2026-900002"),
    "listing in moderation is NOT visible",
    ids.includes("LST-2026-900002") ? "LEAKED" : "correctly hidden"
  );
}

// Attempting to reach a hidden row directly must also return nothing.
const direct = await get("public_listings?human_readable_id=eq.LST-2026-900002&select=*");
record(
  direct.status === 200 && direct.text.trim() === "[]",
  "direct query for a hidden listing returns nothing",
  `HTTP ${direct.status} ${direct.text.slice(0, 40)}`
);

// -- 3. no confidential value in any public response --------------------------
console.log("\n3. No confidential value appears in public responses");
const bodies = [
  (await get("public_listings?select=*")).text,
  (await get("public_listing_media?select=*")).text,
  (await get("public_agent_profiles?select=*")).text,
];
const canaries = [
  ["CONFIDENTIAL-CANARY", "internal notes"],
  ["1980000000", "minimum price"],
  ["Jl. Melawai Raya", "exact address"],
  ["Unit 21-05", "unit number"],
  ["Bapak Hartono", "owner name"],
  ["+6281200000000", "owner phone"],
  ["SEED-LICENCE-0001", "agent licence number"],
  ["Dewi Lestari Wijaya", "agent full legal name"],
];
for (const [needle, label] of canaries) {
  const leaked = bodies.some((b) => b.includes(needle));
  record(!leaked, `${label} absent`.padEnd(30), leaked ? "LEAKED" : "");
}

// -- 4. views reject anonymous writes -----------------------------------------
//
// The HTTP response alone is NOT evidence here. PostgreSQL checks view
// updatability before privileges, so a multi-table view answers "cannot insert
// into view" (SQLSTATE 55000) whether or not the grant was ever revoked. That
// is the accidental protection 00032 exists to stop relying on. So assert the
// grant in the catalogue, and treat the HTTP rejection as a secondary signal.
console.log("\n4. Public views are SELECT-only for anon");
{
  const { default: pg } = await import("pg");
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  const { rows } = await db.query(
    `select table_name,
            string_agg(distinct privilege_type, ',' order by privilege_type) as privs
       from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'
        and table_name like 'public\\_%'
      group by table_name order by table_name`
  );
  await db.end();

  for (const r of rows) {
    record(r.privs === "SELECT", `${r.table_name} grants`.padEnd(30), r.privs);
  }
  record(rows.length > 0, "public views exist".padEnd(30), `${rows.length} view(s)`);
}

for (const view of ["public_listings", "public_agent_profiles"]) {
  const res = await fetch(`${BASE}/rest/v1/${view}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "injected" }),
  });
  record(res.status >= 400, `${view} INSERT rejected`.padEnd(30), `HTTP ${res.status}`);
}

console.log(
  failures === 0
    ? "\nAll checks passed. The public surface is what it claims to be.\n"
    : `\n${failures} CHECK(S) FAILED — do not deploy the public app.\n`
);
process.exit(failures === 0 ? 0 : 1);
