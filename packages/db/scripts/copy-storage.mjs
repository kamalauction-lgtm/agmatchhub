/**
 * Copy Supabase Storage objects from the old MatchHub project to propertiguru.
 *
 * The row migration (368ab7b) moved every path but no bytes — Storage objects
 * live in S3 behind the Storage API, not in Postgres. Licence documents,
 * identity documents and submission photos are still only in the old project,
 * so those links 404 until this runs. This is the last thing standing between
 * you and deleting that project.
 *
 *   node scripts/copy-storage.mjs          # list what would be copied
 *   node scripts/copy-storage.mjs --commit
 *
 * REQUIRES the service_role key for BOTH projects. Downloading from a private
 * bucket and writing to any bucket is a privileged operation; the anon key
 * cannot do either. Set them in:
 *
 *   packages/db/.env.local     SUPABASE_SERVICE_ROLE_KEY  (source — already set)
 *   packages/db/.env.staging   SUPABASE_SERVICE_ROLE_KEY  (target — get it from
 *     Supabase -> propertiguru -> Settings -> API -> service_role)
 *
 * Idempotent: existing objects are skipped, so a partial run can be repeated
 * safely.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMIT = process.argv.includes("--commit");

function env(file) {
  const out = {};
  for (const line of readFileSync(join(ROOT, file), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const SRC = env(".env.local");
const TGT = env(".env.staging");

for (const [label, e, file] of [["SOURCE", SRC, ".env.local"], ["TARGET", TGT, ".env.staging"]]) {
  if (!e.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      `\n${label} service_role key is missing from ${file}.\n\n` +
        `Supabase dashboard -> the project -> Settings -> API -> service_role.\n` +
        `Paste it on the SUPABASE_SERVICE_ROLE_KEY= line. Do not put it in chat.\n`
    );
    process.exit(1);
  }
}

const api = (base, key) => ({
  list: async (bucket, prefix = "") => {
    const r = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) throw new Error(`list ${bucket}: ${r.status} ${await r.text()}`);
    return r.json();
  },
  download: async (bucket, path) => {
    const r = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`download ${bucket}/${path}: ${r.status}`);
    return { body: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") };
  },
  upload: async (bucket, path, body, type) => {
    const r = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": type || "application/octet-stream",
        "x-upsert": "false", // never clobber something already there
      },
      body,
    });
    // 409 means it already exists — that is a skip, not a failure.
    if (!r.ok && r.status !== 409) throw new Error(`upload ${bucket}/${path}: ${r.status} ${await r.text()}`);
    return r.status === 409 ? "exists" : "copied";
  },
});

const from = api(SRC.NEXT_PUBLIC_SUPABASE_URL, SRC.SUPABASE_SERVICE_ROLE_KEY);
const to = api(TGT.NEXT_PUBLIC_SUPABASE_URL, TGT.SUPABASE_SERVICE_ROLE_KEY);

console.log(`SOURCE  ${new URL(SRC.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}`);
console.log(`TARGET  ${new URL(TGT.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}`);
console.log(COMMIT ? "\nMODE: COMMIT\n" : "\nMODE: listing only\n");

const BUCKETS = [
  "agent-profile-public",
  "agent-verification-private",
  "listing-media-public",
  "property-original-private",
];

/** Storage list is not recursive — walk folders depth-first. */
async function walk(bucket, prefix = "") {
  const entries = await from.list(bucket, prefix);
  const files = [];
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) files.push(...(await walk(bucket, path))); // folder
    else files.push({ path, size: e.metadata?.size ?? 0 });
  }
  return files;
}

const report = [];
let copied = 0, skipped = 0, failed = 0;

for (const bucket of BUCKETS) {
  let files = [];
  try {
    files = await walk(bucket);
  } catch (e) {
    console.error(`  ! ${bucket}: ${e.message}`);
    continue;
  }
  for (const f of files) {
    if (!COMMIT) {
      report.push({ bucket, path: f.path, bytes: f.size, action: "would copy" });
      continue;
    }
    try {
      const { body, type } = await from.download(bucket, f.path);
      const result = await to.upload(bucket, f.path, body, type);
      result === "copied" ? copied++ : skipped++;
      report.push({ bucket, path: f.path, bytes: body.length, action: result });
    } catch (e) {
      failed++;
      report.push({ bucket, path: f.path, bytes: f.size, action: `FAILED: ${e.message.slice(0, 40)}` });
    }
  }
}

console.table(report);
console.log(
  COMMIT
    ? `\ncopied ${copied}, already present ${skipped}, failed ${failed}`
    : `\n${report.length} object(s) would be copied. Re-run with --commit.`
);
if (failed) process.exitCode = 1;
