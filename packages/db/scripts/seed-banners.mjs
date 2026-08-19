/**
 * Sample advertising banners for the marketplace homepage.
 *
 * The two campaigns are FICTIONAL — "Green Valley Residence" and "Harbour
 * Suites" are invented names, and the artwork carries "Contoh materi iklan —
 * bukan proyek nyata" in the image itself. Seeding a real developer's campaign
 * would put an advertisement for a company that never agreed to it on a public
 * site, which is not something a demo should do.
 *
 * Idempotent: re-running replaces the samples rather than stacking duplicates,
 * matched on the fictional advertiser label.
 *
 *   node scripts/seed-banners.mjs --env=staging
 */
import pg from "pg";
import { loadEnv, restArgs } from "./load-env.mjs";

const { url, envName } = loadEnv();

// --remove takes the samples down without putting them back. The seed path
// already deletes-then-inserts, so without this flag "remove" silently
// re-seeded — which is exactly what happened the first time it was asked for.
const REMOVE = restArgs().includes("--remove");

const SAMPLE_ADVERTISER = "Contoh Pengiklan (sample)";

const BANNERS = [
  {
    slot: "home_top",
    title: "Green Valley Residence",
    subtitle: "Cluster baru dengan taman tengah, 15 menit ke stasiun.",
    location_label: "Bogor Selatan, Jawa Barat",
    price_label: "Mulai 800 juta-an",
    image_path: "/banners/sample-green-valley.svg",
    link_url: "/cari?propertyType=rumah",
    cta_label: "Lihat unit tersedia",
    position: 0,
  },
  {
    slot: "home_middle",
    title: "Harbour Suites",
    subtitle: "Apartemen tepi laut, serah terima 2027.",
    location_label: "Surabaya, Jawa Timur",
    price_label: "Mulai 1,2 M",
    image_path: "/banners/sample-harbour-suites.svg",
    link_url: "/cari?propertyType=apartemen",
    cta_label: "Jadwalkan kunjungan",
    position: 0,
  },
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");

  const { rowCount: removed } = await client.query(
    "delete from public.site_banners where advertiser_label = $1",
    [SAMPLE_ADVERTISER]
  );

  if (REMOVE) {
    await client.query("commit");
    console.log(`${envName}: removed ${removed} sample banner(s)`);
    process.exit(0);
  }

  for (const b of BANNERS) {
    await client.query(
      `insert into public.site_banners
         (slot, title, subtitle, advertiser_label, location_label, price_label,
          image_path, link_url, cta_label, position, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
      [
        b.slot,
        b.title,
        b.subtitle,
        SAMPLE_ADVERTISER,
        b.location_label,
        b.price_label,
        b.image_path,
        b.link_url,
        b.cta_label,
        b.position,
      ]
    );
  }

  await client.query("commit");
  console.log(
    `${envName}: replaced ${removed} sample banner(s) with ${BANNERS.length} (${BANNERS
      .map((b) => b.slot)
      .join(", ")})`
  );
} catch (e) {
  await client.query("rollback");
  console.error("seed failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
