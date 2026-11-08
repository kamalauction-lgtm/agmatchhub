/**
 * Seed a co-marketing scenario into a NON-PRODUCTION database so the agent
 * listing views can be seen with both kinds of inventory: listings the agent
 * owns, and listings borrowed from another agent.
 *
 * Creates a second agent (Rizal Pratama), five listings — two owned by the
 * test agent, three owned by Rizal and offered for co-marketing — and two
 * engagements so the test agent has borrowed inventory.
 *
 * Note on photos: rows reuse an image already uploaded to the staging bucket
 * rather than uploading new ones, because that needs the service-role key.
 * Dummy data on staging only; every other field is realistic.
 *
 * Refuses to run against production. Idempotent.
 *
 * Usage: node scripts/seed-staging-comarketing.mjs --env=legacy
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const { url, isProduction } = loadEnv();
/* By project ref, not env-file name — see seed-staging-catalogue.mjs. */
if (isProduction) {
  console.error("Refusing to seed the production database.");
  process.exit(1);
}

const DEWI = "00000000-0000-4000-8000-000000000101";
const RIZAL = "00000000-0000-4000-8000-000000000301";
const RIZAL_EMAIL = "seed.rizal@staging.propertiguru.invalid";
const PHOTO =
  "listing-media-public/00000000-0000-4000-8000-000000000101/9771d98d-17b5-4318-9879-f53d142f63bb/0-8833d4d8.jpg";

/** owner = Dewi keeps these; rizal = offered into the pool. */
const LISTINGS = [
  {
    ref: "910001", owner: "dewi", type: "sale", price: "1850000000",
    propertyType: "apartemen", category: "residential", tenure: "strata",
    title: "Apartemen 2BR furnished di Tebet, dekat stasiun",
    desc: "Unit tower B lantai 12, hadap kota. Full furnished, siap huni. 7 menit jalan kaki ke Stasiun Tebet.",
    area: "Kawasan Tebet Barat", building: "Tebet Green Residence",
    land: 0, built: 68, bed: 2, bath: 1, park: 1, year: 2020,
    furnishing: "fully", condition: "excellent",
    facilities: ["kolam renang", "gym", "keamanan 24 jam"],
  },
  {
    ref: "910002", owner: "dewi", type: "rent", rentPeriod: "monthly", price: "18000000",
    propertyType: "rumah", category: "residential", tenure: "shm",
    title: "Rumah 4KT di Cilandak, cocok keluarga ekspatriat",
    desc: "Rumah dua lantai dengan taman belakang, carport 2 mobil. Dekat sekolah internasional dan Cilandak Town Square.",
    area: "Kawasan Cilandak", building: null,
    land: 300, built: 240, bed: 4, bath: 3, park: 2, year: 2015,
    furnishing: "partially", condition: "good",
    facilities: ["taman", "carport", "keamanan cluster"],
  },
  {
    ref: "910003", owner: "rizal", type: "sale", price: "3250000000",
    propertyType: "rumah", category: "residential", tenure: "shm",
    title: "Rumah baru 3KT di Bintaro, siap huni",
    desc: "Rumah baru di cluster Bintaro sektor 9. Desain modern, bebas banjir, akses tol Bintaro 5 menit.",
    area: "Bintaro Sektor 9", building: "Cluster Casa Verde",
    land: 180, built: 165, bed: 3, bath: 3, park: 2, year: 2025,
    furnishing: "unfurnished", condition: "new",
    facilities: ["one gate system", "taman bermain", "keamanan 24 jam"],
    offer: { sharePct: "50.0000", totalPct: "2.5000", minPrice: "3100000000" },
    borrowed: true,
  },
  {
    ref: "910004", owner: "rizal", type: "sale", price: "875000000",
    propertyType: "ruko", category: "commercial", tenure: "hgb",
    title: "Ruko 3 lantai pinggir jalan raya Depok",
    desc: "Ruko hook posisi strategis, ramai kendaraan. Cocok untuk klinik, kantor, atau minimarket. Listrik 5500 VA.",
    area: "Jalan Margonda Raya", building: null,
    land: 84, built: 210, bed: 0, bath: 3, park: 2, year: 2018,
    furnishing: "unfurnished", condition: "good",
    facilities: ["hook", "pinggir jalan raya"],
    offer: { sharePct: "60.0000", totalPct: "3.0000", minPrice: "830000000" },
    borrowed: true,
  },
  {
    ref: "910005", owner: "rizal", type: "rent", rentPeriod: "yearly", price: "95000000",
    propertyType: "kantor", category: "commercial", tenure: "strata",
    title: "Ruang kantor 120 m2 di SCBD, fully fitted",
    desc: "Unit kantor siap pakai di kawasan SCBD. Sudah termasuk partisi, pantry dan meeting room. Parkir 2 mobil.",
    area: "Kawasan SCBD", building: "Menara Sudirman",
    land: 0, built: 120, bed: 0, bath: 2, park: 2, year: 2012,
    furnishing: "fully", condition: "good",
    facilities: ["lift", "keamanan 24 jam", "genset"],
    offer: { sharePct: "50.0000", totalPct: "5.0000", minPrice: "90000000" },
    borrowed: false, // offered to the pool but not picked up — shows an untaken offer
  },
];

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();

try {
  await db.query("begin");

  // --- second agent ----------------------------------------------------------
  await db.query(
    `insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       encrypted_password, confirmation_token, recovery_token, email_change,
       email_change_token_new, email_change_token_current)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       $2, now(), '{"provider":"email","providers":["email"]}','{}', now(), now(),
       extensions.crypt('StagingAgent#2026', extensions.gen_salt('bf')), '', '', '', '', '')
     on conflict (id) do nothing`,
    [RIZAL, RIZAL_EMAIL]
  );
  await db.query(
    `insert into public.profiles (id, display_name, country_code, preferred_language,
       preferred_currency, agent_status)
     values ($1,'Rizal Pratama','ID','id','IDR','verified')
     on conflict (id) do update set display_name = excluded.display_name,
                                    agent_status = 'verified'`,
    [RIZAL]
  );
  await db.query(
    `insert into public.agent_profiles (user_id, full_legal_name, agency_name,
       country_code, city, state_region, biography)
     values ($1,'Rizal Pratama Nugroho','IQI Indonesia','ID','Jakarta Selatan','DKI Jakarta',
       'Spesialis rumah cluster dan properti komersial Jabodetabek.')
     on conflict (user_id) do update set agency_name = excluded.agency_name`,
    [RIZAL]
  );

  const { rows: loc } = await db.query(
    `select id, ancestor_ids, path_names from public.locations
      where country_code='ID' and level='regency' and slug='jakarta-selatan'`
  );
  const regency = loc[0];
  const ancestors = [...(regency.ancestor_ids ?? []), regency.id];
  const path = regency.path_names ?? [];

  let borrowedCount = 0;
  let offerCount = 0;

  for (const l of LISTINGS) {
    const agent = l.owner === "dewi" ? DEWI : RIZAL;

    const { rows: prop } = await db.query(
      `insert into public.properties
         (human_readable_id, agent_id, country_code, property_category, property_type,
          ownership_type, location_id, ancestor_location_ids, province_name, regency_name,
          postal_code, geom, general_address, building_name, land_size, building_size,
          bedrooms, bathrooms, parking_spaces, year_built, furnishing, property_condition,
          facilities, created_by)
       values ($1,$2,'ID',$3,$4,$5,$6,$7,$8,$9,'12000',
               extensions.st_setsrid(extensions.st_makepoint(106.8106, -6.2615), 4326)::extensions.geography,
               $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$2)
       on conflict (human_readable_id) do update set updated_at = now()
       returning id`,
      [
        `PRP-2026-${l.ref}`, agent, l.category, l.propertyType, l.tenure,
        regency.id, ancestors, path[0] ?? null, path[1] ?? null,
        l.area, l.building, l.land, l.built, l.bed, l.bath, l.park, l.year,
        l.furnishing, l.condition, l.facilities,
      ]
    );
    const propertyId = prop[0].id;

    // Owner authorisation on record — the gate co-marketing checks.
    await db.query(
      `insert into public.property_private (property_id, exact_address, owner_name,
         owner_phone, owner_authorisation_status, minimum_price)
       values ($1,$2,$3,'+628120000' || substr($4,1,4),'obtained',$5)
       on conflict (property_id) do update set owner_authorisation_status = 'obtained'`,
      [propertyId, `${l.area} (alamat lengkap disimpan privat)`, "Pemilik Terverifikasi", l.ref,
       l.offer ? l.offer.minPrice : null]
    );

    const { rows: lst } = await db.query(
      `insert into public.listings
         (human_readable_id, property_id, agent_id, listing_type, status, moderation_state,
          currency, price, rent_period, price_negotiable, language, title, description, slug,
          published_at, expires_at, is_verified, quality_score, ranking_score, created_by)
       values ($1,$2,$3,$4,'published','approved','IDR',$5,$6,true,'id',$7,$8,$9,
               now(), now() + interval '90 days', true, $10, $11, $3)
       on conflict (human_readable_id) do update set title = excluded.title,
                                                     status = 'published'
       returning id`,
      [
        `LST-2026-${l.ref}`, propertyId, agent, l.type, l.price,
        l.rentPeriod ?? null, l.title, l.desc,
        l.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) + "-" + l.ref,
        70 + (Number(l.ref) % 25), (0.6 + (Number(l.ref) % 30) / 100).toFixed(4),
      ]
    );
    const listingId = lst[0].id;

    await db.query(
      `insert into public.listing_media (listing_id, kind, storage_path, processed_path,
         thumbnail_path, position, is_cover, processing_state)
       values ($1,'image',$2,$2,$2,0,true,'ready')
       on conflict do nothing`,
      [listingId, PHOTO]
    );

    // --- co-marketing offer + engagement ------------------------------------
    if (l.offer) {
      const { rows: off } = await db.query(
        `insert into public.comarketing_offers
           (human_readable_id, listing_id, listing_agent_id, status, scope,
            commission_basis, total_commission_pct, marketing_agent_share_pct,
            payer, allow_price_display, requires_la_approval, notes,
            expires_at, created_by)
         values ($1,$2,$3,'active','open_pool','total_pct',$4,$5,'owner',true,false,
                 'Terbuka untuk agen terverifikasi. Harap hubungi sebelum viewing.',
                 now() + interval '60 days', $3)
         on conflict (human_readable_id) do update set status = 'active'
         returning id`,
        [`CMO-2026-${l.ref}`, listingId, agent, l.offer.totalPct, l.offer.sharePct]
      );
      const offerId = off[0].id;
      offerCount++;

      await db.query(
        `insert into public.comarketing_offer_private (offer_id, min_marketing_price, internal_notes)
         values ($1,$2,'Pemilik tidak mau harga di bawah ini diiklankan.')
         on conflict (offer_id) do update set min_marketing_price = excluded.min_marketing_price`,
        [offerId, l.offer.minPrice]
      );

      if (l.borrowed) {
        await db.query(
          `insert into public.comarketing_engagements
             (human_readable_id, offer_id, marketing_agent_id, accepted_terms_version,
              accepted_terms, status)
           values ($1,$2,$3,1,$4,'active')
           on conflict (offer_id, marketing_agent_id) do nothing`,
          [
            `CME-2026-${l.ref}`, offerId, DEWI,
            JSON.stringify({
              commission_basis: "total_pct",
              total_commission_pct: l.offer.totalPct,
              marketing_agent_share_pct: l.offer.sharePct,
              payer: "owner",
              accepted_from_terms_version: 1,
            }),
          ]
        );
        borrowedCount++;
      }
    }
  }

  await db.query("commit");
  console.log(
    `Seeded 5 listings — 2 owned by the test agent, 3 by Rizal Pratama.\n` +
      `  ${offerCount} co-marketing offers, ${borrowedCount} borrowed by the test agent, ` +
      `${offerCount - borrowedCount} still open in the pool.`
  );
} catch (e) {
  await db.query("rollback");
  console.error("Seed failed, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
