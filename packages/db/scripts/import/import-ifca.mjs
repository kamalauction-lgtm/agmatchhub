/**
 * Import the normalized IFCA dataset into the platform.
 *
 *   node import-ifca.mjs --agent <email> [--env=production] [--commit]
 *
 * Dry run by default: parses, validates, prints the preview report (§19) and
 * rolls back. Nothing reaches the database without --commit.
 *
 * WHAT IS NOT INFERRED, AND WHY
 *   The workbook is the source of truth, so where it cannot be read
 *   unambiguously the field stays NULL and the original wording is kept in
 *   property_private for a human to map:
 *
 *   · tenure — the sheet says "Freehold"/"Leasehold"; ownership_type is the
 *     Indonesian certificate vocabulary (shm, hgb, strata, ppjb). A "Freehold"
 *     apartment could be SHM or strata. Choosing one invents a legal fact.
 *   · condition — "Empty" is not the same claim as "unfurnished", and
 *     "semi furnished" is not necessarily "partially". Left unmapped.
 *   · price — only a figure explicitly marked "(For Sell)" becomes a listing
 *     price. Anything else is flagged and withheld.
 *
 * THE ONE DECLARED NORMALIZATION RULE
 *   For an apartment, an unlabelled "Luas 24.20 M2" is the unit's floor area
 *   and is read as building_size. A strata unit has no land component, so this
 *   is reading the sheet rather than guessing at it. Land vs building is only
 *   split when the sheet labels them ("Luas Tanah" / "Luas Bangunan").
 *   Declared here because §22 requires normalization rules to be explicit.
 *
 * EVERYTHING LANDS AS DRAFT
 *   No import publishes. The platform's own workflow requires admin
 *   moderation, and six of these properties carry insolvency remarks.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_ROOT = join(HERE, "..", "..");
const COMMIT = process.argv.includes("--commit");
const AGENT_EMAIL = process.argv[process.argv.indexOf("--agent") + 1];
const ENV_FILE = process.argv.find((a) => a.startsWith("--env="))?.slice(6) === "staging"
  ? ".env.production" : ".env.legacy";
const SOURCE_FILE = "Property Listing IFCA P365 PICI as at August 2026.xlsx";

if (!AGENT_EMAIL || AGENT_EMAIL.startsWith("--")) {
  console.error(
    "\n--agent <email> is required.\n\n" +
      "Imported properties need an owning agent — properties.agent_id is NOT NULL,\n" +
      "and inventing an account for a real company is not something this script\n" +
      "will do on its own. Pass an existing verified agent.\n"
  );
  process.exit(1);
}

function dbUrl() {
  for (const line of readFileSync(join(DB_ROOT, ENV_FILE), "utf8").split(/\r?\n/)) {
    const m = line.match(/^DATABASE_URL=(.*)$/);
    if (m) return m[1].trim();
  }
  throw new Error(`DATABASE_URL missing from ${ENV_FILE}`);
}

const props = JSON.parse(readFileSync(join(HERE, "ifca-normalized.json"), "utf8"));

/* ---------------------------------------------------------------------------
 * Mapping tables — every entry is a direct translation, not a judgement call.
 * ------------------------------------------------------------------------- */

const TYPE_MAP = {
  Apartment: { type: "apartemen", category: "residential" },
  Housing: { type: "rumah", category: "residential" },
  Ruko: { type: "ruko", category: "commercial" },
  Warehousing: { type: "gudang", category: "industrial" },
  Stall: { type: "toko", category: "commercial" },
};

/** Indonesian type names for customer-facing copy. */
const TYPE_ID = {
  apartemen: "Apartemen", rumah: "Rumah", ruko: "Ruko",
  gudang: "Gudang", toko: "Kios",
};

/** Remarks that make a property unsafe to publish without a human decision. */
const BLOCKING_REMARKS = [
  { re: /pkpu|bangkrut|bankrupt/i, code: "LEGAL_ENCUMBRANCE",
    why: "Insolvency proceedings (PKPU) or bankruptcy noted in the source" },
  { re: /still under construction/i, code: "REQUIRES_REVIEW",
    why: "Source states the property is still under construction" },
  { re: /on rent for period/i, code: "REQUIRES_REVIEW",
    why: "Source states the property is already tenanted for a fixed period" },
];

/* ---------------------------------------------------------------------------
 * Extraction — reading the sheet, never completing it.
 * ------------------------------------------------------------------------- */

/**
 * Sizes, read exactly as written.
 *
 * The separator is ambiguous and the sheet mixes conventions: "Luas 24.20 M2"
 * uses a dot as a DECIMAL point, while Indonesian formatting elsewhere uses it
 * for thousands. Treating every dot as a thousands separator turned 24.20 m2
 * into 2420 m2 — a hundredfold error on the single most checkable fact a buyer
 * has, and exactly what §22 forbids.
 *
 * Rule: a dot or comma followed by 1-2 digits at the end is a decimal point;
 * followed by exactly 3 digits it is a thousands separator. Property areas here
 * are two-digit and three-digit metre figures, so this resolves every case in
 * the file without guessing.
 */
function parseArea(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (/[.,]\d{3}(?:[.,]\d{3})*$/.test(s)) {
    s = s.replace(/[.,]/g, "");                    // 1.234 -> 1234
  } else {
    s = s.replace(/(\d)[.,](\d{1,2})$/, "$1.$2"); // 24.20 / 24,20 -> 24.20
    s = s.replace(/[.,](?=\d{3})/g, "");           // any remaining group marks
  }
  const v = parseFloat(s);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Sizes, only where the sheet labels them, plus the declared apartment rule. */
function extractSizes(textLines, propertyType) {
  const text = textLines.join(" ");

  // Labelled land/building. The sheet misspells it "Bngunan" in places.
  // A value followed by "/" is the combined "Bangunan/Tanah : 95/60" notation,
  // which does not say which number is which — so it is refused, not split.
  const land = text.match(/luas\s+tanah\s*:?\s*([\d.,]+)\s*(?:m2?)?(?!\s*\/)/i);
  const built = text.match(/luas\s+b[a-z]*ngunan\s*:?\s*([\d.,]+)\s*(?:m2?)?(?!\s*\/)/i);
  if (land || built) {
    return {
      land_size: land ? parseArea(land[1]) : null,
      building_size: built ? parseArea(built[1]) : null,
    };
  }

  // Unlabelled "Luas 24.20 M2" / "Wide : 7.11 m2" / "Size ... is 34.75 M".
  // A strata unit has no land component, so an unlabelled area is its floor
  // area — the one normalization rule this importer declares.
  const plain = text.match(/(?:luas|wide|size[^\d]{0,20}?)\s*:?\s*([\d.,]+)\s*m2?/i)
    || text.match(/(?:luas|wide)\s*:?\s*([\d.,]+)(?!\s*\/)/i);
  if (plain && ["apartemen", "toko", "ruko", "gudang"].includes(propertyType)) {
    return { land_size: null, building_size: parseArea(plain[1]) };
  }
  return { land_size: null, building_size: null };
}

/** Bedrooms only when the sheet says so; "Studio" is 0 by definition. */
function extractBedrooms(textLines) {
  const text = textLines.join(" ");
  if (/\bstudio\b/i.test(text)) return 0;
  const m = text.match(/(\d+)\s*(?:br|bedroom|kamar tidur|kt)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Development name — the parenthesised name the sheet already provides,
 * e.g. "PT Adhi Persada Property (Grand Dhika City Bekasi C2633)".
 * Nothing is composed; if there is no parenthesis, there is no development.
 */
function extractDevelopment(textLines) {
  for (const line of textLines) {
    const m = line.match(/\(([^)]{4,80})\)/);
    if (m) return m[1].trim();
    // PICI writes it plainly: "Urbana Apartment,Tower Princeton, ..."
    if (/apartment|residence|mall|perumahan|ruko/i.test(line)) {
      return line.split(",")[0].trim();
    }
  }
  return null;
}

/**
 * Unit designation, verbatim from the sheet.
 *
 * The character class must include # and / — the sheet writes units as
 * "A#C38-01", and stopping at the # recorded every one of them as just "A".
 * A truncated unit number is worse than none: it looks like real data.
 */
function extractUnit(textLines) {
  const text = textLines.join(" ");
  const m = text.match(/(?:no\.?\s*unit|unit\s*:?)\s*([A-Za-z0-9#/.-]+)/i);
  if (!m) return null;
  return m[1].replace(/[.,]+$/, "") || null;
}

/**
 * Province and regency — matched only where the name appears VERBATIM in the
 * address. This is lookup, not inference: "Jl. Margahayu, Bekasi Timur Bekasi
 * Jawa Barat" literally contains both. No fuzzy matching, no nearest-neighbour.
 */
async function matchLocation(client, address) {
  if (!address) return { location_id: null, province_name: null, regency_name: null };
  const { rows } = await client.query(
    `select l.id, l.name as regency, p.name as province
     from public.locations l
     join public.locations p on p.id = l.parent_id
     where l.level = 'regency' and p.level = 'province'
       -- Primary path: the stored name appears verbatim in the address.
       -- Fallback: the name minus its "Kab." prefix appears, which is how
       -- "Kab. Sidoarjo" matches an address written "Kabupaten Sidoarjo".
       -- Still an exact substring match, just of the part actually present.
       and (
         position(lower(l.name) in lower($1)) > 0
         or (l.name like 'Kab. %'
             and position(lower(substring(l.name from 6)) in lower($1)) > 0)
       )
     -- An exact name match always beats a de-prefixed one, so "Bekasi" (the
     -- city) is not displaced by "Kab. Bekasi" for a Kota Bekasi address.
     -- Then longest name, so "Jakarta Selatan" beats "Jakarta".
     order by (position(lower(l.name) in lower($1)) > 0) desc,
              length(l.name) desc
     limit 1`,
    [address]
  );
  if (!rows.length) return { location_id: null, province_name: null, regency_name: null };
  return { location_id: rows[0].id, province_name: rows[0].province, regency_name: rows[0].regency };
}

/* ---------------------------------------------------------------------------
 * Customer-facing copy — improved wording, unchanged facts (§10, §11)
 * ------------------------------------------------------------------------- */

function buildTitle(p, mapped, development, bedrooms, unitType) {
  const parts = [TYPE_ID[mapped.type] ?? mapped.type];
  if (bedrooms === 0) parts.push("Studio");
  else if (bedrooms) parts.push(`${bedrooms}BR`);
  else if (unitType) parts.push(unitType);
  const head = parts.join(" ");
  return development ? `${head} – ${development}` : head;
}

function buildDescription(p, mapped, sizes, development, unit, bedrooms, loc) {
  const s = [];
  const typeWord = (TYPE_ID[mapped.type] ?? mapped.type).toLowerCase();

  // Sentence one: only what the sheet states.
  const bits = [];
  if (bedrooms === 0) bits.push("Unit studio");
  else if (bedrooms) bits.push(`Unit ${bedrooms} kamar tidur`);
  else bits.push(`${TYPE_ID[mapped.type] ?? "Properti"}`);
  if (sizes.building_size) bits.push(`seluas ${String(sizes.building_size).replace(".", ",")} m²`);
  if (development) bits.push(`di ${development}`);
  s.push(bits.join(" ") + ".");

  if (sizes.land_size) {
    s.push(`Luas tanah ${String(sizes.land_size).replace(".", ",")} m².`);
  }
  if (unit) s.push(`Nomor unit ${unit}.`);
  if (loc.regency_name) {
    s.push(`Berlokasi di ${loc.regency_name}${loc.province_name ? `, ${loc.province_name}` : ""}.`);
  }
  if (p.condition_raw) s.push(`Kondisi unit menurut data pemilik: ${p.condition_raw}.`);

  // No "strategic location", no "great investment", no yield claims — none of
  // that is in the source, so none of it is written here (§10).
  return s.join(" ");
}

/**
 * Suspected duplicates (section 15).
 *
 * Signals: same development AND same unit designation, or same address AND the
 * same building size. Deliberately narrow - two units in one tower share a
 * development, a floor, a size and a price and are still different properties
 * (P365 #8 and #12 differ only by unit A#C38-19 vs A#C38-01).
 *
 * Never deletes and never overwrites. It flags, and a human decides.
 */
async function findDuplicate(client, { development, unit, address, buildingSize }) {
  const clauses = [];
  const params = [];
  if (development && unit) {
    params.push(`%${development}%`, unit);
    clauses.push(`(l.title ilike $${params.length - 1} and pp.unit_number = $${params.length})`);
  }
  // Address + size ALONE is not a duplicate signal. Units in one tower share an
  // address and a floor area by design: A#C38-19, A#C38-18 and A#C38-01 are the
  // same building, the same 43.28 m2, and three different properties. Flagging
  // those wastes review time and teaches people to ignore the flag.
  //
  // So this clause only applies where neither side carries a unit number —
  // houses and shophouses, where address plus size really does identify one
  // property. A differing unit number is decisive evidence of difference.
  if (address && buildingSize && !unit) {
    params.push(address, buildingSize);
    clauses.push(
      `(pp.exact_address = $${params.length - 1} and p.building_size = $${params.length}
        and pp.unit_number is null)`
    );
  }
  if (!clauses.length) return null;

  const { rows } = await client.query(
    `select p.id, p.human_readable_id
     from public.properties p
     join public.property_private pp on pp.property_id = p.id
     left join public.listings l on l.property_id = p.id
     where (${clauses.join(" or ")})
     limit 1`,
    params
  );
  return rows[0] ?? null;
}


/* ---------------------------------------------------------------------------
 * Validation (§14)
 * ------------------------------------------------------------------------- */

function validate(p, mapped, saleEntry) {
  const warnings = [];
  let status = "VALID";
  const raise = (s) => {
    const order = ["VALID", "REQUIRES_REVIEW", "MISSING_PRICE", "REQUIRES_PRICE_REVIEW",
      "NOT_FOR_SALE", "DUPLICATE_SUSPECTED", "DATA_CONFLICT", "LEGAL_ENCUMBRANCE"];
    if (order.indexOf(s) > order.indexOf(status)) status = s;
  };

  if (!mapped) { warnings.push(`Unmapped property type "${p.property_type_raw}"`); raise("DATA_CONFLICT"); }

  const allRemarks = p.remarks.join(" ");
  for (const b of BLOCKING_REMARKS) {
    if (b.re.test(allRemarks)) { warnings.push(b.why); raise(b.code); }
  }
  if (/^sold$/i.test(p.condition_raw ?? "")) {
    warnings.push("Source marks the unit as SOLD"); raise("NOT_FOR_SALE");
  }

  const unclear = p.market_entries.filter((m) => m.kind === "unclear");
  if (!saleEntry && unclear.length) {
    warnings.push(`Market value not marked "(For Sell)": "${unclear[0].raw}" — cannot be treated as an asking price`);
    raise("REQUIRES_PRICE_REVIEW");
  } else if (!saleEntry && !p.market_entries.length) {
    warnings.push("No market value in the source"); raise("MISSING_PRICE");
  } else if (!saleEntry) {
    warnings.push("Only a rental figure is given — no sale price"); raise("NOT_FOR_SALE");
  }

  if (!p.urls.length) warnings.push("No source URL, so no images are available");
  return { status, warnings };
}

/* ---------------------------------------------------------------------------
 * Import
 * ------------------------------------------------------------------------- */

const client = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();

const batchId = randomUUID();
const report = [];
const samples = [];

try {
  const { rows: agents } = await client.query(
    `select p.id, p.display_name from public.profiles p
     join auth.users u on u.id = p.id where u.email = $1`,
    [AGENT_EMAIL]
  );
  if (!agents.length) throw new Error(`No account found for ${AGENT_EMAIL}`);
  const agent = agents[0];
  console.log(`Owning agent : ${agent.display_name} <${AGENT_EMAIL}>`);
  console.log(`Batch        : ${batchId}`);
  console.log(`Target       : ${ENV_FILE}`);
  console.log(COMMIT ? "\nMODE: COMMIT\n" : "\nMODE: dry run — rolls back\n");

  await client.query("begin");

  // Re-runnable. The audit row upserts on source key, but properties and
  // listings would pile up on a second run, so a prior import OF THIS FILE is
  // cleared first. Scoped to source_file: nothing created by hand is touched.
  const { rows: prior } = await client.query(
    "select property_id, listing_id from public.property_imports where source_file = $1",
    [SOURCE_FILE]
  );
  if (prior.length) {
    const listingIds = prior.map((r) => r.listing_id).filter(Boolean);
    const propertyIds = prior.map((r) => r.property_id).filter(Boolean);
    if (listingIds.length) {
      await client.query("delete from public.listing_media where listing_id = any($1)", [listingIds]);
      await client.query("delete from public.listings where id = any($1)", [listingIds]);
    }
    if (propertyIds.length) {
      await client.query("delete from public.property_private where property_id = any($1)", [propertyIds]);
      await client.query("delete from public.properties where id = any($1)", [propertyIds]);
    }
    console.log(`cleared previous import: ${propertyIds.length} properties, ${listingIds.length} listings`);
  }

  for (const p of props) {
    const mapped = TYPE_MAP[p.property_type_raw] ?? null;
    const saleEntry = p.market_entries.find((m) => m.kind === "sale" && m.amount) ?? null;
    const rentalEntry = p.market_entries.find((m) => m.kind === "rental") ?? null;
    let { status, warnings } = validate(p, mapped, saleEntry);

    const development = extractDevelopment(p.text_lines);
    const unit = extractUnit(p.text_lines);
    const sizes = mapped ? extractSizes(p.text_lines, mapped.type) : { land_size: null, building_size: null };
    const bedrooms = extractBedrooms(p.text_lines);
    const loc = await matchLocation(client, p.address_raw);

    let propertyId = null, listingId = null;

    // A record only becomes a property if it is at least type-mappable and not
    // marked sold. Everything else is recorded in the audit table and skipped —
    // an unimportable row still needs to be explainable later.
    // Section 15 - checked BEFORE anything is created, against the catalogue
    // as it stands (including rows created earlier in this same run).
    const dup = await findDuplicate(client, {
      development, unit, address: p.address_raw, buildingSize: sizes.building_size,
    });
    if (dup) {
      warnings.push(`Possible duplicate of ${dup.human_readable_id} - same development and unit, or same address and size`);
      if (status === "VALID") status = "DUPLICATE_SUSPECTED";
    }

    const importable = mapped && status !== "NOT_FOR_SALE" && status !== "DATA_CONFLICT";

    if (importable) {
      const { rows: [prop] } = await client.query(
        `insert into public.properties
           (human_readable_id, agent_id, country_code, property_category, property_type,
            location_id, province_name, regency_name, land_size, building_size,
            bedrooms, measurement_unit, created_by)
         values (public.next_human_id('PRP'), $1, 'ID', $2, $3, $4, $5, $6, $7, $8, $9, 'sqm', $1)
         returning id`,
        [agent.id, mapped.category, mapped.type, loc.location_id, loc.province_name,
         loc.regency_name, sizes.land_size, sizes.building_size, bedrooms]
      );
      propertyId = prop.id;

      // Internal figures — never surfaced publicly.
      await client.query(
        `insert into public.property_private
           (property_id, exact_address, unit_number, owner_name, internal_notes,
            purchase_price, purchase_date, maintenance_fee_monthly, fair_value,
            source_tenure_raw, source_condition_raw)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [propertyId, p.address_raw, unit, p.source_company,
         [`Imported from ${p.source_sheet} #${p.source_property_no}`, ...p.remarks].join(" | "),
         p.purchase_price, p.sp_date && /^\d{4}-\d{2}-\d{2}$/.test(p.sp_date) ? p.sp_date : null,
         p.maintenance_fee, p.fair_value, p.tenure_raw, p.condition_raw]
      );

      // A listing only where there is an explicit sale price. Always draft.
      if (saleEntry) {
        const title = buildTitle(p, mapped, development, bedrooms, null);
        const description = buildDescription(p, mapped, sizes, development, unit, bedrooms, loc);
        const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${p.source_sheet.includes("PICI") ? "pici" : "p365"}-${p.source_property_no}`;

        const { rows: [listing] } = await client.query(
          `insert into public.listings
             (human_readable_id, property_id, agent_id, listing_type, status, moderation_state,
              currency, price, language, title, description, slug, created_by)
           values (public.next_human_id('LST'), $1, $2, 'sale', 'draft', 'pending',
                   'IDR', $3, 'id', $4, $5, $6, $2)
           returning id`,
          [propertyId, agent.id, saleEntry.amount, title, description, slug]
        );
        listingId = listing.id;
      }
    }

    await client.query(
      `insert into public.property_imports
         (batch_id, source_file, source_sheet, source_property_no, source_company,
          source_rows, property_id, listing_id, validation_status, warnings,
          normalized, urls_seen, imported_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (source_file, source_sheet, source_property_no) do update set
         batch_id = excluded.batch_id, property_id = excluded.property_id,
         listing_id = excluded.listing_id, validation_status = excluded.validation_status,
         warnings = excluded.warnings, normalized = excluded.normalized,
         imported_at = now()`,
      [batchId, SOURCE_FILE, p.source_sheet, p.source_property_no, p.source_company,
       p.source_rows, propertyId, listingId, status, warnings,
       JSON.stringify(p), p.urls.length, agent.id]
    );

    samples.push({
      ref: `${p.source_sheet.includes("PICI") ? "PICI" : "P365"} #${p.source_property_no}`,
      source_text: p.text_lines.join(" || "),
      extracted: { development, unit, bedrooms, ...sizes, ...loc },
      title: importable && saleEntry ? buildTitle(p, mapped, development, bedrooms, null) : null,
      description: importable && saleEntry
        ? buildDescription(p, mapped, sizes, development, unit, bedrooms, loc) : null,
      price: saleEntry?.amount ?? null,
    });

    report.push({
      ref: `${p.source_sheet.includes("PICI") ? "PICI" : "P365"} #${p.source_property_no}`,
      type: p.property_type_raw,
      status,
      price: saleEntry ? saleEntry.amount : null,
      rental: rentalEntry ? rentalEntry.amount : null,
      listing: listingId ? "draft" : "—",
      warnings,
    });
  }

  if (COMMIT) {
    await client.query("commit");
    console.log("COMMITTED\n");
  } else {
    await client.query("rollback");
    console.log("ROLLED BACK (dry run)\n");
  }

  /* ----- preview report (§19) ----------------------------------------- */
  const by = (s) => report.filter((r) => r.status === s).length;
  console.log("IMPORT PREVIEW");
  console.table({
    "records detected": report.length,
    "P365": report.filter((r) => r.ref.startsWith("P365")).length,
    "PICI": report.filter((r) => r.ref.startsWith("PICI")).length,
    "listings created (draft)": report.filter((r) => r.listing === "draft").length,
    "VALID": by("VALID"),
    "REQUIRES_REVIEW": by("REQUIRES_REVIEW"),
    "REQUIRES_PRICE_REVIEW": by("REQUIRES_PRICE_REVIEW"),
    "MISSING_PRICE": by("MISSING_PRICE"),
    "NOT_FOR_SALE": by("NOT_FOR_SALE"),
    "LEGAL_ENCUMBRANCE": by("LEGAL_ENCUMBRANCE"),
    "DATA_CONFLICT": by("DATA_CONFLICT"),
    "DUPLICATE_SUSPECTED": by("DUPLICATE_SUSPECTED"),
  });

  if (process.argv.includes("--samples")) {
    console.log("\nSAMPLE MAPPINGS - source text vs what was written:\n");
    for (const s of samples.filter((x) => x.title).slice(0, 6)) {
      console.log("-".repeat(76));
      console.log(s.ref);
      console.log(`  SOURCE : ${s.source_text.slice(0, 110)}`);
      console.log(`  sizes  : land=${s.extracted.land_size} building=${s.extracted.building_size} beds=${s.extracted.bedrooms}`);
      console.log(`  where  : ${s.extracted.regency_name ?? "-"}, ${s.extracted.province_name ?? "-"}`);
      console.log(`  TITLE  : ${s.title}`);
      console.log(`  DESC   : ${s.description}`);
      console.log(`  PRICE  : IDR ${s.price?.toLocaleString("id-ID")}`);
    }
    console.log("");
  }

  console.log("\nNOT PUBLISHED — every record and why:");
  console.table(
    report.filter((r) => r.status !== "VALID")
      .map((r) => ({ ref: r.ref, type: r.type, status: r.status, why: r.warnings[0] ?? "" }))
  );
} catch (e) {
  await client.query("rollback");
  console.error("\nFAILED — nothing written:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
