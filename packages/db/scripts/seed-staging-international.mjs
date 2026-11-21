#!/usr/bin/env node
/**
 * Demo international listings for staging, so the International section can be
 * judged before the real catalogue is connected.
 *
 *   node scripts/seed-staging-international.mjs --env=staging
 *
 * Every row is invented and says so: titles carry the [DEMO] prefix, the source
 * is "demo", and the exchange rates are round illustrative figures marked
 * source "demo-seed". No real project, developer, price or person is described.
 * The person in charge is a placeholder; the real one is added in the Hub
 * (Admin, International contacts) and is never written into this repository.
 *
 * Idempotent: rows are keyed on (source, external_id) and upserted.
 * Refuses production.
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const { url, isProduction, ref } = loadEnv();
if (isProduction) {
  console.error("Refusing: demo international listings never go to production.");
  process.exit(1);
}

/** Units per one US dollar. Illustrative only. */
const RATES = {
  USD: 1, IDR: 16500, MYR: 4.4, SGD: 1.34, AUD: 1.52, GBP: 0.79, EUR: 0.92,
  AED: 3.67, THB: 35, JPY: 152, VND: 25400, PHP: 58, TRY: 34,
};

const L = (country, city, region, title, type, dev, currency, min, max, beds, size, extra = {}) => ({
  country, city, region, title, type, dev, currency, min, max, beds, size, ...extra,
});

const LISTINGS = [
  L("ID", "Jakarta Selatan", "DKI Jakarta", "Senopati Sky Residences", "Apartment", "Demo Land Group", "IDR", 3_200_000_000, 9_800_000_000, [1, 3], [48, 162], { featured: true, completion: "Q4 2027", tenure: "Strata title" }),
  L("ID", "Badung", "Bali", "Canggu Rice Terrace Villas", "Villa", "Demo Island Homes", "IDR", 5_400_000_000, 12_500_000_000, [2, 4], [140, 320], { featured: true, completion: "Ready", tenure: "Leasehold 30 years" }),
  L("ID", "Tangerang Selatan", "Banten", "BSD Garden Townhouses", "Townhouse", "Demo Land Group", "IDR", 2_100_000_000, 4_600_000_000, [3, 4], [96, 180], { completion: "Q2 2027", tenure: "Freehold (SHM)" }),
  L("MY", "Kuala Lumpur", "Wilayah Persekutuan", "KLCC Park View Suites", "Serviced apartment", "Demo Capital Bhd", "MYR", 980_000, 3_400_000, [1, 3], [52, 148], { completion: "Q1 2028", tenure: "Freehold" }),
  L("MY", "Johor Bahru", "Johor", "Straits Waterfront Residences", "Condominium", "Demo Capital Bhd", "MYR", 620_000, 1_850_000, [2, 4], [78, 165], { completion: "Ready", tenure: "Freehold" }),
  L("AU", "Melbourne", "Victoria", "Southbank Riverside Tower", "Apartment", "Demo Pacific Developments", "AUD", 520_000, 1_950_000, [1, 3], [50, 140], { featured: true, completion: "Q3 2027", tenure: "Freehold" }),
  L("AU", "Sydney", "New South Wales", "Parramatta Square Residences", "Apartment", "Demo Pacific Developments", "AUD", 690_000, 2_400_000, [1, 3], [52, 132], { completion: "Q4 2026", tenure: "Freehold" }),
  L("GB", "London", "England", "Canary Wharf Quay Apartments", "Apartment", "Demo Thames Estates", "GBP", 495_000, 1_650_000, [1, 3], [45, 118], { completion: "Q2 2027", tenure: "Leasehold 999 years" }),
  L("GB", "Manchester", "England", "Northern Quarter Lofts", "Apartment", "Demo Thames Estates", "GBP", 235_000, 620_000, [1, 2], [42, 88], { completion: "Ready", tenure: "Leasehold 250 years" }),
  L("AE", "Dubai", "Dubai", "Marina Crescent Residences", "Apartment", "Demo Gulf Properties", "AED", 1_350_000, 6_200_000, [1, 4], [68, 260], { featured: true, completion: "Q1 2028", tenure: "Freehold" }),
  L("TH", "Bangkok", "Bangkok", "Sukhumvit Garden Condominium", "Condominium", "Demo Siam Living", "THB", 5_900_000, 24_000_000, [1, 3], [34, 120], { completion: "Q3 2027", tenure: "Freehold (foreign quota)" }),
  L("TH", "Phuket", "Phuket", "Bang Tao Beach Villas", "Villa", "Demo Siam Living", "THB", 18_500_000, 62_000_000, [3, 5], [280, 640], { completion: "Ready", tenure: "Leasehold 30 years" }),
  L("JP", "Tokyo", "Tokyo", "Shibuya Hillside Residence", "Apartment", "Demo Nippon Estates", "JPY", 68_000_000, 240_000_000, [1, 3], [38, 110], { completion: "Q4 2027", tenure: "Freehold" }),
  L("VN", "Ho Chi Minh City", "Ho Chi Minh", "Thu Thiem Riverside", "Apartment", "Demo Mekong Homes", "VND", 6_800_000_000, 21_000_000_000, [1, 3], [50, 130], { completion: "Q2 2028", tenure: "Leasehold 50 years" }),
  L("SG", "Singapore", "Central Region", "Orchard Boulevard Suites", "Condominium", "Demo Lion City Land", "SGD", 2_250_000, 7_900_000, [1, 4], [48, 190], { completion: "Q1 2029", tenure: "Leasehold 99 years" }),
  L("TR", "Istanbul", "Istanbul", "Bosphorus Terrace Homes", "Apartment", "Demo Anatolia Yapi", "USD", 285_000, 1_100_000, [1, 4], [65, 240], { completion: "Ready", tenure: "Freehold" }),
];

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  const today = new Date().toISOString().slice(0, 10);
  for (const [currency, perUsd] of Object.entries(RATES)) {
    await client.query(
      `insert into public.fx_rates (currency, per_usd, as_of, source) values ($1, $2, $3, 'demo-seed')
       on conflict (currency) do update set per_usd = excluded.per_usd, as_of = excluded.as_of, source = excluded.source`,
      [currency, perUsd, today],
    );
  }

  const { rows: existing } = await client.query(
    "select id from public.country_contacts where display_name = '[DEMO] International Desk'",
  );
  if (!existing.length) {
    await client.query(
      `insert into public.country_contacts (display_name, phone, role_label, all_countries, sort_order)
       values ('[DEMO] International Desk', '+6281200000000', 'International sales', true, 500)`,
    );
  }

  let n = 0;
  for (const [i, l] of LISTINGS.entries()) {
    const slug = `demo-${slugify(l.title)}-${l.country.toLowerCase()}`;
    const title = `[DEMO] ${l.title}`;
    const summary = `${l.type} in ${l.city}, ${l.region}. Illustrative demo record for staging.`;
    const description =
      `DEMO / TEST DATA. ${l.title} is an invented ${l.type.toLowerCase()} project in ${l.city} used to preview the ` +
      `International section on staging. Sizes, prices and dates are illustrative and describe no real development.`;
    const { rows } = await client.query(
      `insert into public.international_listings
         (slug, source, external_id, country_code, region, city, title, summary, description, listing_type, category,
          property_type_label, developer_name, tenure_label, completion_label, bedrooms_min, bedrooms_max,
          size_min, size_max, size_unit, currency, price_min, price_max, highlights, status, is_featured,
          published_at, last_synced_at)
       values ($1, 'demo', $2, $3, $4, $5, $6, $7, $8, 'sale', 'residential', $9, $10, $11, $12, $13, $14,
               $15, $16, 'sqm', $17, $18, $19, $20, 'published', $21, now() - ($22 || ' hours')::interval, now())
       on conflict (source, external_id) do update set
         title = excluded.title, summary = excluded.summary, description = excluded.description,
         price_min = excluded.price_min, price_max = excluded.price_max, is_featured = excluded.is_featured,
         status = 'published', last_synced_at = now()
       returning id`,
      [slug, `demo-${i + 1}`, l.country, l.region, l.city, title, summary, description, l.type, l.dev,
        l.tenure ?? null, l.completion ?? null, l.beds[0], l.beds[1], l.size[0], l.size[1], l.currency,
        l.min, l.max, ["Illustrative demo record", `${l.beds[0]}–${l.beds[1]} bedrooms`, l.completion ?? "Ready"],
        !!l.featured, String(i)],
    );
    await client.query(
      `insert into public.international_listing_private (listing_id, source_url, commission_note, raw)
       values ($1, 'https://source.invalid/demo', 'DEMO: commission terms are never public', '{"demo":true}')
       on conflict (listing_id) do nothing`,
      [rows[0].id],
    );
    n++;
  }
  await client.query("commit");
  console.log(`Seeded ${n} demo international listings, ${Object.keys(RATES).length} demo rates on ${ref}.`);
} catch (e) {
  await client.query("rollback");
  throw e;
} finally {
  await client.end();
}
