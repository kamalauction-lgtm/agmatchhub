/**
 * Seed the Indonesian administrative hierarchy into `locations`:
 * 34 provinces, ~514 regencies/cities, ~7,200 districts (kecamatan).
 *
 * Source: BPS-coded CSVs committed in data/wilayah/ (from
 * github.com/emsifa/api-wilayah-indonesia, MIT). Committed so the seed is
 * reproducible offline and immune to upstream changes. Known limits, by
 * choice: the set predates the 2022 Papua pemekaran (4 new provinces) and
 * kelurahan/desa (~83k rows) are deferred until search actually needs them.
 * No coordinates in this source — geosearch runs off property geom, not
 * location centroids.
 *
 * Idempotent: upserts on (country_code, level, slug), so the hand-seeded
 * Jakarta rows (which carry property FKs) are updated in place, never
 * duplicated. Safe to re-run; safe on production later.
 *
 * Usage: node scripts/seed-locations-id.mjs --env=staging
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { url } = loadEnv();

// --- name shaping ------------------------------------------------------------

const ACRONYMS = new Set(["DKI", "DI"]);

/** "SUMATERA UTARA" -> "Sumatera Utara", "DKI JAKARTA" -> "DKI Jakarta" */
function displayCase(upper) {
  return upper
    .toLowerCase()
    .split(/\s+/)
    .map((w) => {
      const u = w.toUpperCase();
      if (ACRONYMS.has(u)) return u;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/**
 * Regency display names follow portal convention: cities drop the "KOTA"
 * prefix ("KOTA BANDA ACEH" -> "Banda Aceh"), kabupaten keep a short marker
 * ("KABUPATEN BEKASI" -> "Kab. Bekasi") because Kota Bekasi and Kab. Bekasi
 * are different places and both must stay searchable and distinct.
 */
function regencyDisplay(upper) {
  if (upper.startsWith("KOTA ADM")) {
    // Jakarta's "KOTA ADMINISTRASI JAKARTA SELATAN"
    return displayCase(upper.replace(/^KOTA ADM(INISTRASI)?\.? /, ""));
  }
  if (upper.startsWith("KABUPATEN ADM")) {
    return "Kab. " + displayCase(upper.replace(/^KABUPATEN ADM(INISTRASI)?\.? /, ""));
  }
  if (upper.startsWith("KOTA ")) return displayCase(upper.slice(5));
  if (upper.startsWith("KABUPATEN ")) return "Kab. " + displayCase(upper.slice(10));
  return displayCase(upper);
}

function normalise(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(name) {
  return normalise(name).replace(/\s+/g, "-");
}

function csv(file) {
  return readFileSync(join(root, "data", "wilayah", file), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split(","));
}

// --- load + shape -------------------------------------------------------------

const provinces = csv("provinces.csv").map(([code, name]) => ({
  code,
  name: displayCase(name),
}));

const regencies = csv("regencies.csv").map(([code, provCode, name]) => ({
  code,
  provCode,
  name: regencyDisplay(name),
}));

const districts = csv("districts.csv").map(([code, regCode, name]) => ({
  code,
  regCode,
  name: displayCase(name),
}));

console.log(
  `Parsed: ${provinces.length} provinces, ${regencies.length} regencies, ${districts.length} districts`
);

// Slug collisions within a level are real (e.g. district "Sukamaju" exists in
// many regencies). Disambiguate district slugs with the regency slug.
const provBySlug = new Map();
const dupDistrictSlugs = new Map();
for (const d of districts) {
  const s = slugify(d.name);
  dupDistrictSlugs.set(s, (dupDistrictSlugs.get(s) ?? 0) + 1);
}

// --- write --------------------------------------------------------------------

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();

const UPSERT = `
  insert into public.locations
    (country_code, level, parent_id, code, name, name_normalised, slug,
     path_names, ancestor_ids, is_active)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
  on conflict (country_code, level, slug) do update set
    code = excluded.code,
    name = excluded.name,
    name_normalised = excluded.name_normalised,
    parent_id = excluded.parent_id,
    path_names = excluded.path_names,
    ancestor_ids = excluded.ancestor_ids,
    is_active = true
  returning id`;

await db.query("begin");
try {
  // Provinces
  const provIds = new Map();
  for (const p of provinces) {
    const slug = slugify(p.name);
    const { rows } = await db.query(UPSERT, [
      "ID", "province", null, p.code, p.name, normalise(p.name), slug,
      [p.name], [],
    ]);
    provIds.set(p.provCode ?? p.code, rows[0].id);
    provBySlug.set(slug, { id: rows[0].id, name: p.name });
  }

  // Regencies
  const regIds = new Map();
  for (const r of regencies) {
    const provId = provIds.get(r.provCode);
    const prov = provinces.find((p) => p.code === r.provCode);
    if (!provId || !prov) continue;
    const { rows } = await db.query(UPSERT, [
      "ID", "regency", provId, r.code, r.name, normalise(r.name), slugify(r.name),
      [prov.name, r.name], [provId],
    ]);
    regIds.set(r.code, { id: rows[0].id, provId, provName: prov.name, name: r.name });
  }

  // Districts — batched multi-row inserts for the ~7.2k rows.
  const BATCH = 400;
  for (let i = 0; i < districts.length; i += BATCH) {
    const chunk = districts.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let p = 1;
    for (const d of chunk) {
      const reg = regIds.get(d.regCode);
      if (!reg) continue;
      const baseSlug = slugify(d.name);
      const slug =
        (dupDistrictSlugs.get(baseSlug) ?? 0) > 1
          ? `${baseSlug}-${slugify(reg.name)}`
          : baseSlug;
      values.push(
        `('ID','district',$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},true)`
      );
      params.push(
        reg.id, d.code, d.name, normalise(d.name), slug,
        [reg.provName, reg.name, d.name], [reg.provId, reg.id]
      );
    }
    if (!values.length) continue;
    await db.query(
      `insert into public.locations
         (country_code, level, parent_id, code, name, name_normalised, slug,
          path_names, ancestor_ids, is_active)
       values ${values.join(",")}
       on conflict (country_code, level, slug) do update set
         code = excluded.code, name = excluded.name,
         name_normalised = excluded.name_normalised,
         parent_id = excluded.parent_id, path_names = excluded.path_names,
         ancestor_ids = excluded.ancestor_ids, is_active = true`,
      params
    );
    process.stdout.write(`\r  districts ${Math.min(i + BATCH, districts.length)}/${districts.length}`);
  }
  console.log();

  // Colloquial aliases — what people actually type.
  const ALIASES = [
    ["regency", "jakarta-selatan", "jaksel"],
    ["regency", "jakarta-pusat", "jakpus"],
    ["regency", "jakarta-barat", "jakbar"],
    ["regency", "jakarta-timur", "jaktim"],
    ["regency", "jakarta-utara", "jakut"],
    ["regency", "tangerang-selatan", "tangsel"],
    ["regency", "yogyakarta", "jogja"],
    ["regency", "yogyakarta", "yogya"],
    ["regency", "bandung", "kota kembang"],
    ["regency", "surabaya", "sby"],
    ["province", "di-yogyakarta", "diy"],
    ["province", "kepulauan-riau", "kepri"],
    ["province", "sumatera-utara", "sumut"],
    ["province", "sumatera-barat", "sumbar"],
    ["province", "sumatera-selatan", "sumsel"],
    ["province", "kalimantan-timur", "kaltim"],
    ["province", "kalimantan-barat", "kalbar"],
    ["province", "kalimantan-selatan", "kalsel"],
    ["province", "sulawesi-selatan", "sulsel"],
    ["province", "jawa-barat", "jabar"],
    ["province", "jawa-tengah", "jateng"],
    ["province", "jawa-timur", "jatim"],
  ];
  let aliasCount = 0;
  for (const [level, slug, alias] of ALIASES) {
    const { rowCount } = await db.query(
      `insert into public.location_aliases (location_id, alias, alias_normalised, source)
       select id, $3, $4, 'import' from public.locations
        where country_code = 'ID' and level = $1 and slug = $2
       on conflict (location_id, alias_normalised) do nothing`,
      [level, slug, alias, normalise(alias)]
    );
    aliasCount += rowCount ?? 0;
  }

  await db.query("commit");

  const { rows: counts } = await db.query(
    `select level, count(*)::int n from public.locations where country_code='ID' group by 1 order by 1`
  );
  console.log("Seeded:", counts.map((c) => `${c.n} ${c.level}`).join(", "), `· ${aliasCount} aliases`);
} catch (e) {
  await db.query("rollback");
  console.error("Seed failed, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
