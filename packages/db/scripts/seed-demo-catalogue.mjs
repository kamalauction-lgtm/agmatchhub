/**
 * Demo catalogue: enough inventory to exercise every surface end to end.
 *
 * Covers, on purpose:
 *   · sale and rent, across rumah / apartemen / ruko / kantor / tanah
 *   · published, pending_review, rejected and draft, so moderation queues and
 *     the "not on the marketplace" filters have something to filter
 *   · cover photos and gallery media
 *   · a boosted listing and a featured one, for the promoted rail
 *   · two co-marketing offers, one picked up, so the pool, the agent landing
 *     page and the borrowed-listing path all have live data
 *
 * SAFETY — this is written to be runnable against PRODUCTION and then removed
 * without residue, because that is where the app has to be proven:
 *
 *   · Every demo row is traceable. Agents use @demo.propertiguru.invalid
 *     (.invalid is reserved by RFC 2606 and can never receive mail), and every
 *     property carries internal_notes = DEMO_MARKER.
 *   · `--remove` deletes all of it, in FK order, and nothing else.
 *   · Addresses, developments and owner names are invented. No real project or
 *     person is described, so nothing here can be mistaken for a real property
 *     or misrepresent somebody's home.
 *
 * These are still fake property adverts. On a public marketplace they must come
 * out before launch — `--remove` is the whole point, not an afterthought.
 *
 *   node scripts/seed-demo-catalogue.mjs --env=legacy
 *   node scripts/seed-demo-catalogue.mjs --env=legacy --remove
 */
import pg from "pg";
import { loadEnv, restArgs } from "./load-env.mjs";

const { url, envName, requested } = loadEnv();
const REMOVE = restArgs().includes("--remove");

const DEMO_MARKER = "DEMO_SEED — remove before public launch";
const DEMO_DOMAIN = "@demo.propertiguru.invalid";

const AGENTS = [
  {
    id: "00000000-0000-4000-8000-0000000d0001",
    email: `sari.demo${DEMO_DOMAIN}`,
    name: "Sari Wulandari (demo)",
    agency: "Demo Realty",
    city: "Jakarta Selatan",
    bio: "Contoh profil agen — data demo, bukan agen sebenarnya.",
  },
  {
    id: "00000000-0000-4000-8000-0000000d0002",
    email: `andi.demo${DEMO_DOMAIN}`,
    name: "Andi Nugroho (demo)",
    agency: "Demo Realty",
    city: "Bandung",
    bio: "Contoh profil agen — data demo, bukan agen sebenarnya.",
  },
];

/** Every listing states it is a demo in its own description. */
const DEMO_NOTE =
  "\n\n—\nCatatan: ini adalah listing contoh untuk pengujian sistem, bukan properti nyata.";

const LISTINGS = [
  {
    agent: 0, type: "rumah", category: "residential", listing: "sale",
    title: "Rumah 3KT siap huni di Jagakarsa",
    price: 1_450_000_000, beds: 3, baths: 2, building: 120, land: 150,
    province: "DKI Jakarta", regency: "Jakarta Selatan",
    status: "published", featured: true,
  },
  {
    agent: 0, type: "apartemen", category: "residential", listing: "rent",
    title: "Apartemen 2BR furnished dekat MRT Fatmawati",
    price: 8_500_000, rent: "monthly", beds: 2, baths: 1, building: 55,
    province: "DKI Jakarta", regency: "Jakarta Selatan",
    status: "published", boost: true,
  },
  {
    agent: 0, type: "ruko", category: "commercial", listing: "sale",
    title: "Ruko 3 lantai pinggir jalan utama Cilandak",
    price: 4_200_000_000, baths: 3, building: 240, land: 90,
    province: "DKI Jakarta", regency: "Jakarta Selatan",
    status: "published", offer: { share: 50, total: 3 },
  },
  {
    agent: 1, type: "rumah", category: "residential", listing: "sale",
    title: "Rumah cluster 2 lantai di Bandung Utara",
    price: 2_100_000_000, beds: 4, baths: 3, building: 180, land: 160,
    province: "Jawa Barat", regency: "Bandung",
    status: "published", offer: { share: 60, total: 2.5 }, pickedUpBy: 0,
  },
  {
    agent: 1, type: "kantor", category: "commercial", listing: "rent",
    title: "Ruang kantor 90 m² siap pakai di pusat Bandung",
    price: 72_000_000, rent: "yearly", baths: 2, building: 90,
    province: "Jawa Barat", regency: "Bandung",
    status: "published",
  },
  {
    agent: 1, type: "tanah", category: "land", listing: "sale",
    title: "Tanah kavling 300 m² dekat exit tol Buahbatu",
    price: 900_000_000, land: 300,
    province: "Jawa Barat", regency: "Bandung",
    status: "published",
  },
  {
    agent: 0, type: "rumah", category: "residential", listing: "sale",
    title: "Rumah minimalis 2KT di Depok (menunggu tinjauan)",
    price: 750_000_000, beds: 2, baths: 1, building: 70, land: 84,
    province: "Jawa Barat", regency: "Depok",
    status: "pending_review",
  },
  {
    agent: 0, type: "apartemen", category: "residential", listing: "sale",
    title: "Studio di Kalibata (contoh listing ditolak)",
    price: 320_000_000, beds: 0, baths: 1, building: 24,
    province: "DKI Jakarta", regency: "Jakarta Selatan",
    status: "rejected", reason: "Foto tidak sesuai dengan unit yang diiklankan.",
  },
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const one = async (sql, params) => (await client.query(sql, params)).rows[0];

async function remove() {
  await client.query("begin");
  const ids = (
    await client.query(
      `select p.id from public.properties p
       join public.property_private pp on pp.property_id = p.id
       where pp.internal_notes = $1`,
      [DEMO_MARKER]
    )
  ).rows.map((r) => r.id);

  // FK order. comarketing_* and listing_* cascade from listings, listings from
  // properties — but deleting explicitly makes the counts visible.
  const counts = {};
  if (ids.length) {
    const listingIds = (
      await client.query("select id from public.listings where property_id = any($1)", [ids])
    ).rows.map((r) => r.id);

    if (listingIds.length) {
      counts.engagements = (
        await client.query(
          `delete from public.comarketing_engagements
           where offer_id in (select id from public.comarketing_offers where listing_id = any($1))`,
          [listingIds]
        )
      ).rowCount;
      counts.offers = (
        await client.query("delete from public.comarketing_offers where listing_id = any($1)", [listingIds])
      ).rowCount;
      counts.boosts = (
        await client.query("delete from public.listing_boosts where listing_id = any($1)", [listingIds])
      ).rowCount;
      counts.media = (
        await client.query("delete from public.listing_media where listing_id = any($1)", [listingIds])
      ).rowCount;
      counts.listings = (
        await client.query("delete from public.listings where id = any($1)", [listingIds])
      ).rowCount;
    }
    counts.properties = (
      await client.query("delete from public.properties where id = any($1)", [ids])
    ).rowCount;
  }

  const emails = AGENTS.map((a) => a.email);
  counts.notifications = (
    await client.query("delete from public.notifications where user_id in (select id from auth.users where email = any($1))", [emails])
  ).rowCount;
  counts.agent_profiles = (
    await client.query("delete from public.agent_profiles where user_id in (select id from auth.users where email = any($1))", [emails])
  ).rowCount;
  counts.profiles = (
    await client.query("delete from public.profiles where id in (select id from auth.users where email = any($1))", [emails])
  ).rowCount;
  counts.auth_users = (
    await client.query("delete from auth.users where email = any($1)", [emails])
  ).rowCount;

  await client.query("commit");
  console.log(`${envName}: demo data removed`);
  console.table(counts);
}

async function seed() {
  await client.query("begin");

  // --- agents ---------------------------------------------------------------
  for (const a of AGENTS) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                               raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                               confirmation_token, recovery_token, email_change_token_new, email_change)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               $2, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
       on conflict (id) do nothing`,
      [a.id, a.email]
    );
    await client.query(
      `insert into public.profiles (id, display_name, country_code, preferred_language, agent_status)
       values ($1, $2, 'ID', 'id', 'verified')
       on conflict (id) do update set display_name = excluded.display_name,
                                      agent_status = 'verified'`,
      [a.id, a.name]
    );
    await client.query(
      `insert into public.agent_profiles (user_id, full_legal_name, agency_name, country_code,
                                          state_region, city, biography)
       values ($1, $2, $3, 'ID', $4, $5, $6)
       on conflict (user_id) do update set agency_name = excluded.agency_name,
                                           biography = excluded.biography`,
      [a.id, a.name, a.agency, a.city === "Bandung" ? "Jawa Barat" : "DKI Jakarta", a.city, a.bio]
    );
  }

  // --- listings -------------------------------------------------------------
  const made = [];
  for (const [i, l] of LISTINGS.entries()) {
    const agent = AGENTS[l.agent];

    const loc = await one(
      `select id from public.locations
       where level = 'regency' and lower(name) like lower($1) limit 1`,
      [`%${l.regency}%`]
    );

    const prop = await one(
      `insert into public.properties
         (human_readable_id, agent_id, country_code, property_category, property_type,
          location_id, province_name, regency_name, land_size, building_size,
          bedrooms, bathrooms, measurement_unit, created_by)
       values (public.next_human_id('PRP'), $1, 'ID', $2, $3, $4, $5, $6, $7, $8, $9, $10, 'sqm', $1)
       returning id`,
      [agent.id, l.category, l.type, loc?.id ?? null, l.province, l.regency,
       l.land ?? null, l.building ?? null, l.beds ?? null, l.baths ?? null]
    );

    // The marker every removal keys off.
    //
    // owner_authorisation_status matters beyond record-keeping: co-marketing is
    // gated on it (invariant §4.1, enforced by guard_comarketing_offer), so a
    // property offered to the pool must carry it. Only the ones that need it
    // get it, so the gate itself stays exercised by the rest.
    await client.query(
      `insert into public.property_private
         (property_id, exact_address, owner_name, internal_notes,
          owner_authorisation_status, owner_authorisation_ref)
       values ($1, $2, 'Pemilik Contoh', $3, $4, $5)`,
      [prop.id, `Jalan Contoh No. ${10 + i}, ${l.regency}`, DEMO_MARKER,
       l.offer ? "obtained" : "not_obtained",
       l.offer ? "DEMO-AUTH-" + (i + 1) : null]
    );

    const listing = await one(
      `insert into public.listings
         (human_readable_id, property_id, agent_id, listing_type, status, moderation_state,
          moderation_reason, currency, price, rent_period, language, title, description, slug,
          published_at, is_featured, created_by)
       values (public.next_human_id('LST'), $1, $2, $3, $4, $5, $6, 'IDR', $7, $8, 'id', $9, $10,
               $11, case when $4 = 'published' then now() else null end, $12, $2)
       returning id`,
      [prop.id, agent.id, l.listing, l.status,
       l.status === "published" ? "approved" : l.status === "rejected" ? "rejected" : "pending",
       l.reason ?? null, l.price, l.rent ?? null, l.title,
       `${l.title}. Lokasi strategis di ${l.regency}, ${l.province}.${DEMO_NOTE}`,
       `${l.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-demo-${i + 1}`,
       !!l.featured]
    );

    // processing_state 'ready' is required: public_listings only surfaces media
    // that has been through processing (EXIF stripped, thumbnailed), so seeded
    // rows without it leave every card showing "no photo".
    //
    // Site-relative paths, served from apps/www/public/demo/. mediaUrl() passes
    // a leading slash through untouched instead of rewriting it into a storage
    // URL, so these resolve without uploading anything to Supabase Storage —
    // which also means `--remove` leaves no orphaned objects behind.
    const art = ["rumah", "apartemen", "ruko", "tanah"].includes(l.type)
      ? l.type
      : l.category === "land"
        ? "tanah"
        : l.category === "commercial"
          ? "ruko"
          : "rumah";

    for (let m = 0; m < 3; m++) {
      await client.query(
        `insert into public.listing_media
           (listing_id, kind, storage_path, processed_path, thumbnail_path,
            processing_state, position, is_cover, alt_text)
         values ($1, 'image', $2, $2, $2, 'ready', $3, $4, $5)`,
        [listing.id, `/demo/${art}.svg`, m, m === 0, `${l.title} — foto contoh ${m + 1}`]
      );
    }

    made.push({ ...l, propertyId: prop.id, listingId: listing.id, agentId: agent.id });
  }

  // --- boost ---------------------------------------------------------------
  const boosted = made.find((m) => m.boost);
  if (boosted) {
    const product = await one("select key from public.boost_products limit 1");
    if (product) {
      await client.query(
        `insert into public.listing_boosts (listing_id, agent_id, product_key, status, starts_at, ends_at, credits_spent)
         values ($1, $2, $3, 'active', now(), now() + interval '3 days', 0)`,
        [boosted.listingId, boosted.agentId, product.key]
      );
    }
  }

  // --- co-marketing ---------------------------------------------------------
  for (const m of made.filter((x) => x.offer)) {
    const offer = await one(
      `insert into public.comarketing_offers
         (listing_id, listing_agent_id, status, scope, commission_basis,
          total_commission_pct, marketing_agent_share_pct, payer, notes, created_by)
       values ($1, $2, 'active', 'open_pool', 'total_pct', $3, $4, 'owner', $5, $2)
       returning id`,
      [m.listingId, m.agentId, m.offer.total, m.offer.share,
       "Terbuka untuk agen terverifikasi. Data contoh."]
    );

    if (m.pickedUpBy !== undefined) {
      await client.query(
        `insert into public.comarketing_engagements
           (offer_id, marketing_agent_id, accepted_terms_version, accepted_terms)
         values ($1, $2, 0, '{}'::jsonb)`,
        [offer.id, AGENTS[m.pickedUpBy].id]
      );
    }
  }

  await client.query("commit");

  console.log(`${envName}: demo catalogue seeded`);
  console.table({
    agents: AGENTS.length,
    listings: made.length,
    published: made.filter((m) => m.status === "published").length,
    media: made.length * 3,
    offers: made.filter((m) => m.offer).length,
    engagements: made.filter((m) => m.pickedUpBy !== undefined).length,
  });
  console.log(
    `\nThese are FAKE property adverts on ${envName}. Remove before any public launch:\n` +
      `  node scripts/seed-demo-catalogue.mjs --env=${requested} --remove\n`
  );
}

try {
  await (REMOVE ? remove() : seed());
} catch (e) {
  await client.query("rollback");
  console.error("failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
