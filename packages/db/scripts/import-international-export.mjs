#!/usr/bin/env node
/**
 * Load an exported project catalogue into the International section.
 *
 *   node scripts/import-international-export.mjs --env=staging \
 *     --file=<export.json> --source=<name> --image-host=<host> [--limit=N] [--no-photos]
 *
 * The export is what a person signed in to the source catalogue sees on its
 * own screens, saved as JSON: `{ items: { <id>: { id, title, card, overview,
 * details, cover, images[] } } }`, where `card`, `overview` and `details` are
 * the screen text, one field per line. Nothing here signs in anywhere.
 *
 * What it does, per project:
 *   - reads the labelled fields out of the screen text;
 *   - applies the same rules the weekly sync will use
 *     (apps/hub/src/lib/international/ingest-plan.ts): placeholders become
 *     null, and a row with a doubtful price, no photo, or an unknown country or
 *     currency is kept as a DRAFT with the reasons recorded privately;
 *   - copies each photo into our own public bucket, re-encoded to WebP (which
 *     drops camera and location metadata). Photos are never hot-linked, and
 *     only from the one host named on the command line;
 *   - keeps the source's page address in the private companion table.
 *
 * Idempotent: rows are keyed on (source, external id); a photo already copied
 * is not fetched again. A listing an admin has WITHDRAWN stays withdrawn.
 * Refuses production: that needs the owner's go-ahead and its own run.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./load-env.mjs";
import { cleanPosition, cleanText, parseRooms, reviewListing } from "../../../apps/hub/src/lib/international/ingest-plan.ts";

const BUCKET = "international-media-public";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const { url, isProduction, ref, fileName } = loadEnv();
if (isProduction) {
  console.error("Refusing: importing a catalogue into production needs the owner's go-ahead and its own run.");
  process.exit(1);
}
const file = arg("file");
const source = arg("source");
const imageHost = arg("image-host");
const limit = Number(arg("limit") ?? Infinity);
const withPhotos = !process.argv.includes("--no-photos");
if (!file || !/^[a-z][a-z0-9_]{1,30}$/.test(source ?? "") || (withPhotos && !imageHost)) {
  console.error("Usage: --env=staging --file=<export.json> --source=<name> --image-host=<host> [--limit=N] [--no-photos]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(join(root, fileName), "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const storage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from(BUCKET);

/* ---------- reading the screen text ---------- */

const DETAIL_LABELS = [
  "Project Title", "Project Type", "Building Type", "Tenure Type", "Currency", "Minimum Price", "Maximum Price",
  "Country", "State", "Area/City", "Specification", "Built Up", "Land Area", "Bathroom", "Bedroom", "Max Unit",
  "Latitude", "Longitude", "Developer", "Phase", "Expected Completion", "Key Features", "Project Features",
];
const OVERVIEW_LABELS = ["DESCRIPTION", "OVERVIEW", "PROJECT FEATURES", "ROUTE MAP", "LOCATION MAP", "LANDING PAGE"];

/** `{ label: "value lines joined" }`; a label seen twice keeps the later, fuller value. */
function sections(text, labels) {
  const out = {};
  let current = null;
  for (const line of String(text ?? "").split("\n")) {
    if (labels.includes(line)) { current = line; out[current] = []; continue; }
    if (current) out[current].push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("\n")]));
}

const number = (v) => {
  const m = /-?[\d,]+(?:\.\d+)?/.exec(String(v ?? ""));
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const positive = (n) => (n !== null && n > 0 ? n : null);

/** Country names as the source writes them -> ISO 3166-1 alpha-2. */
const COUNTRY_CODES = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const map = new Map();
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    // First code wins: reserved aliases ("UK", "EL") share a name with the real code that sorts before them.
    try { const n = names.of(code)?.toLowerCase(); if (n && n !== code.toLowerCase() && !map.has(n)) map.set(n, code); } catch { /* not a region */ }
  }
  // Spellings the source uses that the standard names do not.
  for (const [n, c] of [["united states of america", "US"], ["usa", "US"], ["uk", "GB"], ["united kingdom", "GB"], ["greece", "GR"], ["turkey", "TR"], ["bahrian", "BH"],
    ["hong kong", "HK"], ["palestine", "PS"], ["russia", "RU"], ["south korea", "KR"], ["syria", "SY"], ["vietnam", "VN"],
    ["myanmar", "MM"], ["taiwan", "TW"], ["uae", "AE"]]) map.set(n, c);
  return map;
})();

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110);
const CATEGORIES = ["residential", "commercial", "industrial", "land"];

function toListing(rec) {
  const d = sections(rec.details, DETAIL_LABELS);
  const o = sections(rec.overview, OVERVIEW_LABELS);
  const card = String(rec.card ?? "").split("\n");
  const detailLines = String(rec.details ?? "").split("\n");

  const title = cleanText(rec.title, 200) ?? cleanText(card[0], 200);
  const tagline = cleanText(card[1], 400);
  const addressLine = /^Project Name:/.test(detailLines[2] ?? "") && detailLines[3] !== "Project Title" ? cleanText(detailLines[3], 400) : null;
  const countryCode = COUNTRY_CODES.get(String(cleanText(d["Country"]) ?? "").toLowerCase()) ?? null;
  const currency = /^[A-Z]{3}$/.test(d["Currency"] ?? "") ? d["Currency"] : null;

  // The card states rooms more fully ("2 - 6+2") than the detail sheet ("2 - N/A").
  const pick = (cardLine, detail) => { const a = parseRooms(cardLine); return a.min !== null ? a : parseRooms(detail); };
  const beds = pick(card[3], d["Bedroom"]);
  const baths = pick(card[5], d["Bathroom"]);

  const built = String(d["Built Up"] ?? "");
  const sizes = (built.match(/[\d,]+(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, ""))).filter((n) => n > 0);
  const sizeUnit = /sq\s*m|m²|sqm/i.test(built) ? "sqm" : "sqft";
  const units = number(d["Max Unit"]);
  const land = number(d["Land Area"]);
  const position = cleanPosition(cleanText(d["Latitude"]), cleanText(d["Longitude"]));

  const paragraphs = [cleanText(o["DESCRIPTION"]), cleanText(o["OVERVIEW"])].filter(Boolean);
  const features = [d["Key Features"], d["Project Features"], o["PROJECT FEATURES"]]
    .flatMap((t) => String(t ?? "").split("\n")).map((l) => cleanText(l, 160)).filter(Boolean);
  const category = String(cleanText(d["Project Title"]) ?? "").toLowerCase();

  return {
    external_id: String(rec.id),
    title,
    summary: tagline && title && tagline.toLowerCase() !== title.toLowerCase() ? tagline : null,
    description: paragraphs.length ? paragraphs.join("\n\n").slice(0, 12000) : null,
    country_code: countryCode,
    region: cleanText(d["State"], 120),
    city: cleanText(d["Area/City"], 120),
    address: addressLine,
    category: CATEGORIES.includes(category) ? category : "other",
    property_type_label: cleanText(d["Building Type"], 80) ?? cleanText(d["Project Type"], 80),
    developer_name: cleanText(String(d["Developer"] ?? "").split("\n").pop(), 160),
    tenure_label: cleanText(d["Tenure Type"], 80),
    completion_label: cleanText(d["Expected Completion"], 80),
    bedrooms: beds,
    bathrooms: baths,
    size_min: sizes.length ? Math.min(...sizes) : null,
    size_max: sizes.length ? Math.max(...sizes) : null,
    size_unit: sizeUnit,
    land_size: land && land > 0 ? land : null,
    total_units: units && units > 0 && Number.isInteger(units) ? units : null,
    position,
    currency,
    // "MYR 0" is how the source writes "not stated": a project priced "from" has no maximum.
    price_min: positive(number(d["Minimum Price"])),
    price_max: positive(number(d["Maximum Price"])),
    highlights: [...new Set(features)].slice(0, 12),
    active: /^active$/i.test(detailLines[1] ?? ""),
    source_url: cleanText(o["LANDING PAGE"], 400),
    images: [...new Set([rec.cover, ...(rec.images ?? [])].filter((u) => {
      try { const p = new URL(u); return p.protocol === "https:" && p.host === imageHost; } catch { return false; }
    }))],
  };
}

/* ---------- photos ---------- */

async function copyPhoto(listingId, src) {
  const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`photo ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  if (input.length > 25 * 1024 * 1024) throw new Error("photo too large");
  // Re-encoding drops every metadata block (EXIF, GPS) the original carried.
  const { data, info } = await sharp(input, { failOn: "none" }).rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
  const path = `${listingId}/${createHash("sha256").update(src).digest("hex").slice(0, 24)}.webp`;
  const up = await storage.upload(path, data, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
  if (up.error) throw new Error(up.error.message);
  return { path, width: info.width, height: info.height };
}

/* ---------- load ---------- */

const records = Object.values(JSON.parse(readFileSync(file, "utf8")).items ?? {}).slice(0, limit);
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 6 });
const { rows: rateRows } = await pool.query("select currency, per_usd from public.fx_rates where source <> 'demo-seed'");
const perUsd = new Map(rateRows.map((r) => [r.currency, Number(r.per_usd)]));

const tally = { published: 0, draft: 0, withdrawn: 0, failed: 0, photos: 0, photoErrors: 0 };
const flagsSeen = new Map();
const altFor = (src, title) => (/\/map_image\//.test(src) ? `${title} — location map` : title);

async function loadOne(rec) {
  const l = toListing(rec);
  if (!l.title || !l.country_code || !l.currency) {
    // The table itself requires these three; without them there is no row to hold.
    tally.failed++;
    const why = !l.title ? "title_missing" : !l.country_code ? "country_invalid" : "currency_invalid";
    flagsSeen.set(why + " (not loaded)", (flagsSeen.get(why + " (not loaded)") ?? 0) + 1);
    return;
  }
  const slug = `${slugify(l.title)}-${l.country_code.toLowerCase()}-${slugify(l.external_id)}`;
  const { rows } = await pool.query(
    `insert into public.international_listings
       (slug, source, external_id, country_code, region, city, title, summary, description, listing_type, category,
        property_type_label, developer_name, tenure_label, completion_label, bedrooms_min, bedrooms_max, bedrooms_label,
        bathrooms_min, bathrooms_max, bathrooms_label, size_min, size_max, size_unit, land_size, total_units,
        address, latitude, longitude, currency, price_min, price_max, highlights, status, last_synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sale',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
             $29,$30,$31,$32,'draft',now())
     on conflict (source, external_id) do update set
       country_code = excluded.country_code, region = excluded.region, city = excluded.city, title = excluded.title,
       summary = excluded.summary, description = excluded.description, category = excluded.category,
       property_type_label = excluded.property_type_label, developer_name = excluded.developer_name,
       tenure_label = excluded.tenure_label, completion_label = excluded.completion_label,
       bedrooms_min = excluded.bedrooms_min, bedrooms_max = excluded.bedrooms_max, bedrooms_label = excluded.bedrooms_label,
       bathrooms_min = excluded.bathrooms_min, bathrooms_max = excluded.bathrooms_max, bathrooms_label = excluded.bathrooms_label,
       size_min = excluded.size_min, size_max = excluded.size_max, size_unit = excluded.size_unit,
       land_size = excluded.land_size, total_units = excluded.total_units, address = excluded.address,
       latitude = excluded.latitude, longitude = excluded.longitude, currency = excluded.currency,
       price_min = excluded.price_min, price_max = excluded.price_max, highlights = excluded.highlights,
       last_synced_at = now()
     returning id, status`,
    [slug, source, l.external_id, l.country_code, l.region, l.city, l.title, l.summary, l.description, l.category,
      l.property_type_label, l.developer_name, l.tenure_label, l.completion_label,
      l.bedrooms.min, l.bedrooms.max, l.bedrooms.label, l.bathrooms.min, l.bathrooms.max, l.bathrooms.label,
      l.size_min, l.size_max, l.size_unit, l.land_size, l.total_units, l.address,
      l.position?.latitude ?? null, l.position?.longitude ?? null, l.currency,
      l.price_min, l.price_max, l.highlights],
  );
  const { id, status: before } = rows[0];

  if (withPhotos) {
    const { rows: have } = await pool.query("select source_ref from public.international_listing_media where listing_id = $1", [id]);
    const done = new Set(have.map((r) => r.source_ref));
    for (const [i, src] of l.images.entries()) {
      if (done.has(src)) continue;
      try {
        const p = await copyPhoto(id, src);
        await pool.query(
          `insert into public.international_listing_media (listing_id, storage_bucket, storage_path, position, alt, width, height, source_ref)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, BUCKET, p.path, i, altFor(src, l.title).slice(0, 200), p.width, p.height, src],
        );
        tally.photos++;
      } catch { tally.photoErrors++; }
    }
  }
  const { rows: [{ n }] } = await pool.query("select count(*)::int as n from public.international_listing_media where listing_id = $1", [id]);

  const review = reviewListing({
    title: l.title, countryCode: l.country_code, currency: l.currency, priceMin: l.price_min, priceMax: l.price_max,
    listingType: "sale", photoCount: n, perUsd: perUsd.get(l.currency) ?? null,
  });
  const flags = [...review.flags, ...(l.active ? [] : ["source_inactive"])];
  const status = before === "withdrawn" ? "withdrawn" : flags.length ? "draft" : "published";
  await pool.query(
    `update public.international_listings set status = $2,
       published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end where id = $1`,
    [id, status],
  );
  await pool.query(
    `insert into public.international_listing_private (listing_id, source_url, review_flags) values ($1,$2,$3)
     on conflict (listing_id) do update set source_url = excluded.source_url, review_flags = excluded.review_flags, updated_at = now()`,
    [id, l.source_url, flags],
  );
  tally[status]++;
  for (const f of flags) flagsSeen.set(f, (flagsSeen.get(f) ?? 0) + 1);
}

let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  for (;;) {
    const i = next++;
    if (i >= records.length) return;
    try { await loadOne(records[i]); } catch (e) { tally.failed++; console.error(`  ${records[i].id}: ${String(e.message).slice(0, 140)}`); }
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${records.length}`);
  }
}));
await pool.end();

console.log(`\n${records.length} read on ${ref}: ${tally.published} published, ${tally.draft} held as draft, ${tally.withdrawn} left withdrawn, ${tally.failed} not loaded.`);
console.log(`Photos copied: ${tally.photos} (${tally.photoErrors} failed).`);
if (flagsSeen.size) console.log("Held because:", [...flagsSeen.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
