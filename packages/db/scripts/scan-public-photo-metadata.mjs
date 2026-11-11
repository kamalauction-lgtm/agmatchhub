/**
 * Read-only scan: do any files in a public bucket still carry location or
 * camera metadata (EXIF, GPS, XMP)?
 *
 * Why: before P1-b-3 the listing wizard wrote agents' original photos straight
 * to the public bucket, with whatever GPS and camera data the file carried.
 * Since then every agent photo is cleaned by the $0 processor before it is
 * published. This scan is the gate around that change: run it just before and
 * just after the production deploy of the 2.0 photo path. If it ever finds a
 * file with metadata, build the backfill designed in
 * docs/design/p1b3-legacy-photo-backfill-plan.md.
 *
 * What it does:
 *   · lists the bucket's objects from storage.objects in a READ-ONLY session;
 *   · downloads each one from its public URL (what any visitor can fetch);
 *   · looks for an EXIF block (JPEG APP1, PNG eXIf, WebP EXIF chunk), a GPS
 *     IFD tag inside it, and XMP;
 *   · notes whether a listing_media row refers to the file (or it is orphaned).
 * It prints COUNTS ONLY — never object names, agent or listing ids — so the
 * output is safe to paste into a PR or a release note.
 *
 * Exit code: 0 when no file carries metadata, 1 when any does, 2 on error.
 *
 * Usage:
 *   node scripts/scan-public-photo-metadata.mjs --env=staging
 *   node scripts/scan-public-photo-metadata.mjs --env=production
 *   node scripts/scan-public-photo-metadata.mjs --env=production --bucket=agent-profile-public
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const BUCKETS = new Set(["listing-media-public", "agent-profile-public"]);
const bucket = (process.argv.find((a) => a.startsWith("--bucket=")) ?? "--bucket=listing-media-public").slice(9);
if (!BUCKETS.has(bucket)) {
  console.error(`--bucket must be one of: ${[...BUCKETS].join(", ")} (public buckets only)`);
  process.exit(2);
}
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!BASE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL is required");
  process.exit(2);
}

const has = (b, bytes) => b.includes(Buffer.from(bytes));
/** Which metadata a file carries, judged by its bytes. */
function metadataIn(b) {
  const found = [];
  const jpegExif = b[0] === 0xff && b[1] === 0xd8 && has(b, "Exif\0\0");
  const pngExif = b.slice(1, 4).toString() === "PNG" && has(b, "eXIf");
  const webp = b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP";
  let webpExif = false, webpXmp = false;
  if (webp) {
    for (let i = 12; i + 8 <= b.length;) {
      const cc = b.slice(i, i + 4).toString();
      const size = b.readUInt32LE(i + 4);
      if (cc === "EXIF") webpExif = true;
      if (cc === "XMP ") webpXmp = true;
      i += 8 + size + (size % 2);
    }
  }
  const exif = jpegExif || pngExif || webpExif;
  if (exif) found.push("exif");
  // GPS IFD pointer tag 0x8825, little- or big-endian, within an EXIF block.
  if (exif && (has(b, [0x25, 0x88, 0x04, 0x00]) || has(b, [0x88, 0x25, 0x00, 0x04]))) found.push("gps");
  if (webpXmp || has(b, "http://ns.adobe.com/xap/1.0/")) found.push("xmp");
  return found;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
let exitCode = 0;
try {
  await client.connect();
  await client.query("set session characteristics as transaction read only");
  await client.query("set default_transaction_read_only = on");
  const ref = BASE.match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? "?";
  const { rows } = await client.query(
    `select o.name,
            exists (select 1 from public.listing_media m
                     where $1 || o.name in (m.storage_path, m.processed_path, m.thumbnail_path)) as referenced
       from storage.objects o
      where o.bucket_id = $2`,
    [`${bucket}/`, bucket],
  );
  console.log(`Project ${ref} · bucket ${bucket} · ${rows.length} object(s) · read-only`);

  const tally = new Map();
  let withMeta = 0, unreadable = 0;
  for (const r of rows) {
    const url = `${BASE}/storage/v1/object/public/${bucket}/${r.name.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url);
    if (!res.ok) { unreadable++; continue; }
    const found = metadataIn(Buffer.from(await res.arrayBuffer()));
    if (found.length) withMeta++;
    const ext = (r.name.split(".").pop() ?? "").toLowerCase();
    const key = `${bucket === "listing-media-public" ? (r.referenced ? "referenced" : "orphaned") : "file"} · ${ext} · ${found.length ? found.join("+") : "clean"}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  for (const [k, n] of [...tally].sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);
  if (unreadable) console.log(`  ${String(unreadable).padStart(5)}  not readable from the public URL`);
  console.log(withMeta ? `RESULT: ${withMeta} file(s) carry metadata — see the backfill plan.` : "RESULT: no file carries EXIF, GPS or XMP.");
  exitCode = withMeta ? 1 : 0;
} catch (e) {
  console.error(`scan failed: ${e instanceof Error ? e.message : e}`);
  exitCode = 2;
} finally {
  await client.end().catch(() => {});
}
process.exit(exitCode);
