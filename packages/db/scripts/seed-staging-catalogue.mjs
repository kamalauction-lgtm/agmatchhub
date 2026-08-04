/**
 * Seed a minimal, realistic catalogue into a NON-PRODUCTION database so the
 * public read path can be tested end to end: one verified agent, one location,
 * two properties, and two listings — one published, one still in moderation.
 *
 * The unpublished listing is the point. It is what proves the public views
 * filter rather than merely exist.
 *
 * Refuses to run against production. Idempotent: re-running replaces the
 * seeded rows rather than duplicating them.
 *
 * Usage: node scripts/seed-staging-catalogue.mjs --env=staging
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const { url, envName } = loadEnv();

if (envName === "local/production") {
  console.error("Refusing to seed the production database. Pass --env=staging.");
  process.exit(1);
}

const AGENT_ID = "00000000-0000-4000-8000-000000000101";
const AGENT_EMAIL = "seed.agent@staging.propertiguru.invalid";

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");

  // --- agent -----------------------------------------------------------------
  // handle_new_user() provisions profiles + users_private from this insert.
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             $2, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
     on conflict (id) do nothing`,
    [AGENT_ID, AGENT_EMAIL]
  );

  await client.query(
    `insert into public.profiles (id, display_name, country_code, preferred_language,
                                  preferred_currency, agent_status)
     values ($1, 'Dewi Lestari', 'ID', 'id', 'IDR', 'verified')
     on conflict (id) do update set display_name = excluded.display_name,
                                    agent_status = 'verified'`,
    [AGENT_ID]
  );

  await client.query(
    `insert into public.agent_profiles (user_id, full_legal_name, agency_name, country_code,
                                        city, state_region, biography, licence_number)
     values ($1, 'Dewi Lestari Wijaya', 'IQI Indonesia', 'ID', 'Jakarta Selatan', 'DKI Jakarta',
             'Spesialis apartemen dan rumah di Jakarta Selatan.', 'SEED-LICENCE-0001')
     on conflict (user_id) do update set agency_name = excluded.agency_name`,
    [AGENT_ID]
  );

  // --- location --------------------------------------------------------------
  const prov = await client.query(
    `insert into public.locations (country_code, level, code, name, name_normalised, slug,
                                   path_names, centroid)
     values ('ID','province','31','DKI Jakarta','dki jakarta','dki-jakarta',
             array['DKI Jakarta'],
             extensions.st_setsrid(extensions.st_makepoint(106.8272, -6.1751), 4326)::extensions.geography)
     on conflict (country_code, level, slug) do update set name = excluded.name
     returning id`
  );
  const provId = prov.rows[0].id;

  const reg = await client.query(
    `insert into public.locations (country_code, level, parent_id, code, name, name_normalised,
                                   slug, path_names, ancestor_ids, centroid)
     values ('ID','regency',$1,'3174','Jakarta Selatan','jakarta selatan','jakarta-selatan',
             array['DKI Jakarta','Jakarta Selatan'], array[$1::uuid],
             extensions.st_setsrid(extensions.st_makepoint(106.8106, -6.2615), 4326)::extensions.geography)
     on conflict (country_code, level, slug) do update set name = excluded.name
     returning id`,
    [provId]
  );
  const regId = reg.rows[0].id;

  await client.query(
    `insert into public.location_aliases (location_id, alias, alias_normalised, source)
     values ($1, 'Jaksel', 'jaksel', 'manual')
     on conflict (location_id, alias_normalised) do nothing`,
    [regId]
  );

  await client.query(
    `insert into public.landmarks (country_code, location_id, kind, name, name_normalised, slug, geom)
     values ('ID', $1, 'mrt_station', 'MRT Blok M BCA', 'mrt blok m bca', 'mrt-blok-m-bca',
             extensions.st_setsrid(extensions.st_makepoint(106.7983, -6.2444), 4326)::extensions.geography)
     on conflict (country_code, kind, slug) do nothing`,
    [regId]
  );

  // --- properties + listings -------------------------------------------------
  // Published listing, and a second one deliberately left in moderation.
  const cases = [
    {
      prp: "PRP-2026-900001",
      lst: "LST-2026-900001",
      slug: "apartemen-2br-jakarta-selatan-dekat-mrt",
      title: "Apartemen 2BR Jakarta Selatan, 5 menit ke MRT",
      status: "published",
      moderation: "approved",
      price: "2150000000",
    },
    {
      prp: "PRP-2026-900002",
      lst: "LST-2026-900002",
      slug: "rumah-3br-belum-dimoderasi",
      title: "Rumah 3BR — masih menunggu moderasi",
      status: "pending_review",
      moderation: "pending",
      price: "3400000000",
    },
  ];

  for (const c of cases) {
    const prop = await client.query(
      `insert into public.properties
         (human_readable_id, agent_id, country_code, property_category, property_type,
          ownership_type, location_id, ancestor_location_ids, province_name, regency_name,
          postal_code, geom, general_address, building_name, land_size, building_size,
          bedrooms, bathrooms, parking_spaces, year_built, furnishing, property_condition,
          facilities, created_by)
       values ($1,$2,'ID','residential','apartemen','shm',$3,array[$4::uuid,$3::uuid],
               'DKI Jakarta','Jakarta Selatan','12160',
               extensions.st_setsrid(extensions.st_makepoint(106.7995, -6.2440), 4326)::extensions.geography,
               'Kawasan Blok M, Jakarta Selatan','Menara Seed Residence',
               0, 72, 2, 2, 1, 2019, 'fully', 'excellent',
               array['kolam renang','gym','keamanan 24 jam'], $2)
       on conflict (human_readable_id) do update set updated_at = now()
       returning id`,
      [c.prp, AGENT_ID, regId, provId]
    );
    const propId = prop.rows[0].id;

    await client.query(
      `insert into public.property_private (property_id, exact_address, unit_number, owner_name,
                                            owner_phone, minimum_price, internal_notes)
       values ($1, 'Jl. Melawai Raya No. 12, Blok M', 'Unit 21-05', 'Bapak Hartono',
               '+6281200000000', 1980000000,
               'CONFIDENTIAL-CANARY owner will accept 1.98M, motivated seller')
       on conflict (property_id) do update set internal_notes = excluded.internal_notes`,
      [propId]
    );

    await client.query(
      `insert into public.listings
         (human_readable_id, property_id, agent_id, listing_type, status, moderation_state,
          currency, price, price_negotiable, language, title, description, slug,
          published_at, is_verified, quality_score, ranking_score, created_by)
       values ($1,$2,$3,'sale',$4,$5,'IDR',$6,true,'id',$7,
               'Apartemen siap huni, 2 kamar tidur, fully furnished, 5 menit jalan kaki ke stasiun MRT.',
               $8, case when $4 = 'published' then now() else null end,
               true, 78, 0.8210, $3)
       on conflict (human_readable_id) do update set status = excluded.status,
                                                     moderation_state = excluded.moderation_state`,
      [c.lst, propId, AGENT_ID, c.status, c.moderation, c.price, c.title, c.slug]
    );
  }

  await client.query("commit");
  console.log("Seeded: 1 agent, 2 locations, 1 alias, 1 landmark, 2 properties, 2 listings");
  console.log("  LST-2026-900001  published   (should be publicly visible)");
  console.log("  LST-2026-900002  in moderation (must NOT be publicly visible)");
} catch (e) {
  await client.query("rollback");
  console.error("Seed failed, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
