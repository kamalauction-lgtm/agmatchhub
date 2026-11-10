#!/usr/bin/env node
/**
 * Give the standing staging test accounts the scenario the RLS suite assumes.
 *
 *   node scripts/seed-staging-scenario.mjs --env=staging
 *
 * On production the test accounts had accumulated this by real use — RA posted
 * a requirement, SA submitted a property to it, a commission agreement was
 * accepted both ways, a disclosure was declared, consents were recorded. Sixteen
 * tests read those rows (never create them) and then prove the WRONG party
 * cannot change them. A fresh staging project has none of it, so those tests
 * failed on an empty table rather than on a policy. This script lays down the
 * same scenario once, idempotently, under fixed human-readable ids in the
 * 9000xx range so it can never collide with ids the application mints.
 *
 *   MatchHub      RA request REQ-2026-900001 (receiving submissions) + share link
 *                 SA submission SUB-2026-900001 + private row + status history
 *                 commission agreement COM-2026-900001 ACCEPTED by both sides
 *                 one legal disclosure, consents for RA and SA
 *   Co-marketing  LA property + published listing + ACTIVE open-pool offer
 *                 (what MA browses in comarketing-pool.test.ts)
 *   Trust profile SA carries an agency name and licence number
 *
 * Runs through the direct Postgres connection (RLS bypassed, triggers still
 * fire — the same path seed-staging-comarketing.mjs uses). Refuses production.
 * None of these rows match the fixture markers, so the suite's sweep leaves
 * them alone. The two published listings carry the [DEMO] title prefix so the
 * public marketplace badges them like the demo catalogue.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const { url, isProduction, fileName, ref } = loadEnv();
if (isProduction) {
  console.error("Refusing: the scenario seed never runs against production.");
  process.exit(1);
}

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`${k} missing in ${fileName}`); process.exit(1); }
  return v;
};
const EMAILS = {
  RA: need("TEST_RA_EMAIL"), SA: need("TEST_SA_EMAIL"), LA: need("TEST_LA_EMAIL"),
  MA: need("TEST_MA_EMAIL"), ADMIN: need("TEST_ADMIN_EMAIL"),
};

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();

try {
  await db.query("begin");

  // --- who is who -----------------------------------------------------------
  const ids = {};
  for (const [k, email] of Object.entries(EMAILS)) {
    const { rows } = await db.query("select id from auth.users where lower(email)=lower($1)", [email]);
    if (!rows[0]) throw new Error(`${k} (${email}) does not exist — run seed-test-users.mjs first`);
    ids[k] = rows[0].id;
  }

  // --- trust profile: SA has a professional identity a collaborator may read --
  await db.query(
    `update public.agent_profiles
        set agency_name = 'Seed Realty Indonesia', licence_number = 'SEED-LIC-000002',
            city = 'Jakarta Selatan', state_region = 'DKI Jakarta',
            biography = 'Spesialis rumah tapak Jakarta Selatan. Akun uji staging.'
      where user_id = $1`,
    [ids.SA]
  );

  // --- MatchHub: RA requirement, approved and receiving submissions ----------
  const { rows: req } = await db.query(
    `insert into public.property_requests
       (human_readable_id, requesting_agent_id, title, description, transaction_type,
        property_category, client_type, priority, country_code, state_region, city,
        currency, budget_min, budget_max, measurement_unit, bedrooms_min, status,
        approved_by, approved_at)
     values ('REQ-2026-900001', $1, 'Rumah 3 kamar di Jakarta Selatan (skenario uji staging)',
             'Klien keluarga muda, cari rumah tapak dekat sekolah internasional.', 'buy',
             'residential', 'individual', 'normal', 'ID', 'DKI Jakarta', 'Jakarta Selatan',
             'IDR', 2000000000, 3000000000, 'sqm', 3, 'receiving_submissions', $2, now())
     on conflict (human_readable_id) do update
        set status = 'receiving_submissions', requesting_agent_id = excluded.requesting_agent_id
     returning id`,
    [ids.RA, ids.ADMIN]
  );
  const requestId = req[0].id;

  await db.query(
    `insert into public.property_request_private (request_id, internal_notes)
     values ($1, 'Klien sudah pre-approved KPR. Jangan sebut ke supply agent.')
     on conflict (request_id) do update set internal_notes = excluded.internal_notes`,
    [requestId]
  );

  // Share link — one per request is what the application creates; keep ours.
  const { rows: links } = await db.query("select id from public.request_links where request_id=$1", [requestId]);
  if (!links.length) {
    await db.query(
      `insert into public.request_links (request_id, token, password, active, expires_at, created_by)
       values ($1, $2, $3, true, now() + interval '1 year', $4)`,
      [requestId, randomBytes(24).toString("base64url"), randomBytes(4).toString("hex").toUpperCase(), ids.RA]
    );
  }

  // --- SA submission to that requirement ------------------------------------
  const { rows: sub } = await db.query(
    `insert into public.property_submissions
       (human_readable_id, request_id, supply_agent_id, status, title, property_category,
        property_type, country_code, state_region, city, district, currency, asking_price,
        negotiable, measurement_unit, built_up, land_area, bedrooms, bathrooms, car_parks,
        furnishing, tenure, source_type, risk_indicator, client_safe_remarks,
        availability_status, owner_confirmation_status, appointment_status,
        commission_type, commission_percentage, commission_currency)
     values ('SUB-2026-900001', $1, $2, 'shortlisted',
             'Rumah 2 lantai Cilandak, 3+1 kamar, siap huni', 'residential', 'rumah',
             'ID', 'DKI Jakarta', 'Jakarta Selatan', 'Cilandak', 'IDR', 2750000000,
             'yes', 'sqm', 165, 180, 3, 2, 2, 'partially', 'shm',
             'direct_written_appointment', 'verified_direct',
             'Siap huni, bebas banjir, 5 menit ke Citos.',
             'available', 'confirmed', 'written_appointment',
             'percentage', 2.5, 'IDR')
     on conflict (human_readable_id) do update
        set status = 'shortlisted', supply_agent_id = excluded.supply_agent_id, request_id = excluded.request_id
     returning id`,
    [requestId, ids.SA]
  );
  const submissionId = sub[0].id;

  await db.query(
    `insert into public.property_submission_private (submission_id, min_acceptable_price, internal_remarks)
     values ($1, 2600000000, 'Pemilik bisa turun sampai 2,6 M kalau cash.')
     on conflict (submission_id) do update set min_acceptable_price = excluded.min_acceptable_price`,
    [submissionId]
  );

  await db.query("delete from public.submission_status_history where submission_id=$1", [submissionId]);
  await db.query(
    `insert into public.submission_status_history (submission_id, previous_status, new_status, changed_by, actor_role)
     values ($1, null, 'submitted', $2, 'supply_agent'),
            ($1, 'submitted', 'shortlisted', $3, 'requesting_agent')`,
    [submissionId, ids.SA, ids.RA]
  );

  // --- commission agreement, accepted by both sides -------------------------
  const { rows: agr } = await db.query(
    `insert into public.commission_agreements
       (human_readable_id, submission_id, total_commission_type, total_percentage, currency,
        calculation_basis, payer_type, status, created_by)
     values ('COM-2026-900001', $1, 'percentage', 2.5, 'IDR', 'final_sale_price', 'owner', 'accepted', $2)
     on conflict (submission_id) do update set status = 'accepted'
     returning id`,
    [submissionId, ids.SA]
  );
  const agreementId = agr[0].id;

  await db.query("delete from public.commission_acceptances where agreement_id=$1", [agreementId]);
  await db.query("delete from public.commission_agreement_versions where agreement_id=$1", [agreementId]);
  const { rows: ver } = await db.query(
    `insert into public.commission_agreement_versions
       (agreement_id, version_number, sharing_method, listing_side_percentage, buyer_side_percentage, currency, proposed_by)
     values ($1, 1, 'fifty_fifty', 50, 50, 'IDR', $2)
     returning id`,
    [agreementId, ids.SA]
  );
  const versionId = ver[0].id;
  await db.query("update public.commission_agreements set current_version_id=$2 where id=$1", [agreementId, versionId]);
  const terms = { method: "fifty_fifty", version: 1, currency: "IDR", listing_pct: 50, buyer_pct: 50, listing_amt: null, buyer_amt: null, terms: null };
  await db.query(
    `insert into public.commission_acceptances (agreement_id, version_id, user_id, side, accepted_terms)
     values ($1, $2, $3, 'listing_side', $5), ($1, $2, $4, 'buyer_side', $5)`,
    [agreementId, versionId, ids.SA, ids.RA, JSON.stringify(terms)]
  );

  // --- one declared disclosure on the submission ----------------------------
  const { rows: disc } = await db.query("select id from public.legal_disclosures where submission_id=$1", [submissionId]);
  if (!disc.length) {
    await db.query(
      `insert into public.legal_disclosures
         (submission_id, category, description, information_source, mandatory_disclosure,
          client_shareable, requires_legal_verification, status, created_by)
       values ($1, 'vacant_possession', 'Rumah kosong, kunci di pemilik. Serah terima bisa 14 hari setelah akad.',
               'Pemilik, konfirmasi lisan + foto', true, true, false, 'declared', $2)`,
      [submissionId, ids.SA]
    );
  }

  // --- consents: each agent has at least one record of their own -------------
  const { rows: dv } = await db.query(
    `select id, declaration_id, body, locale from public.declaration_versions where active order by created_at limit 1`
  );
  if (!dv[0]) throw new Error("no active declaration version — migrations incomplete?");
  for (const who of [ids.RA, ids.SA]) {
    const { rows: have } = await db.query(
      "select 1 from public.consent_records where user_id=$1 and declaration_version_id=$2", [who, dv[0].id]
    );
    if (!have.length) {
      await db.query(
        `insert into public.consent_records
           (user_id, declaration_id, declaration_version_id, accepted_text, language, request_ref, country_code, status)
         values ($1, $2, $3, $4, $5, $6, 'ID', 'accepted')`,
        [who, dv[0].declaration_id, dv[0].id, dv[0].body, dv[0].locale, requestId]
      );
    }
  }

  // --- co-marketing: LA publishes a listing and offers it to the open pool --
  const { rows: loc } = await db.query(
    `select id, ancestor_ids, path_names from public.locations
      where country_code='ID' and level='regency' and slug='jakarta-selatan'`
  );
  if (!loc[0]) throw new Error("Jakarta Selatan not found — run seed-locations-id.mjs first");
  const regency = loc[0];
  const ancestors = [...(regency.ancestor_ids ?? []), regency.id];
  const path = regency.path_names ?? [];

  const { rows: prop } = await db.query(
    `insert into public.properties
       (human_readable_id, agent_id, country_code, property_category, property_type, ownership_type,
        location_id, ancestor_location_ids, province_name, regency_name, postal_code, geom,
        general_address, land_size, building_size, bedrooms, bathrooms, parking_spaces,
        year_built, furnishing, property_condition, facilities, created_by)
     values ('PRP-2026-900001', $1, 'ID', 'residential', 'rumah', 'shm', $2, $3, $4, $5, '12430',
             extensions.st_setsrid(extensions.st_makepoint(106.7995, -6.2906), 4326)::extensions.geography,
             'Cilandak Barat', 200, 180, 4, 3, 2, 2019, 'partially', 'good',
             array['taman','carport 2 mobil','keamanan 24 jam'], $1)
     on conflict (human_readable_id) do update set agent_id = excluded.agent_id
     returning id`,
    [ids.LA, regency.id, ancestors, path[0] ?? null, path[1] ?? null]
  );
  const propertyId = prop[0].id;

  await db.query(
    `insert into public.property_private (property_id, exact_address, owner_name, owner_phone,
       owner_authorisation_status, minimum_price)
     values ($1, 'Jl. Cilandak Tengah III (privat)', 'Pemilik Uji', '+6281200009001', 'obtained', 3300000000)
     on conflict (property_id) do update set owner_authorisation_status = 'obtained'`,
    [propertyId]
  );

  const { rows: lst } = await db.query(
    `insert into public.listings
       (human_readable_id, property_id, agent_id, listing_type, status, moderation_state, currency,
        price, price_negotiable, language, title, description, slug, published_at, expires_at,
        is_verified, quality_score, ranking_score, created_by)
     values ('LST-2026-900001', $1, $2, 'sale', 'published', 'approved', 'IDR', 3500000000, true, 'id',
             '[DEMO] Rumah 4 kamar Cilandak Barat, carport 2 mobil',
             'Rumah dua lantai di lingkungan tenang, 10 menit ke Fatmawati MRT. Akun uji staging.',
             'rumah-4-kamar-cilandak-barat-900001', now(), now() + interval '90 days', true, 82, 0.78, $2)
     on conflict (human_readable_id) do update set status = 'published', agent_id = excluded.agent_id, title = excluded.title
     returning id`,
    [propertyId, ids.LA]
  );
  const listingId = lst[0].id;

  const { rows: offer } = await db.query(
    `insert into public.comarketing_offers
       (human_readable_id, listing_id, listing_agent_id, status, scope, commission_basis,
        total_commission_pct, marketing_agent_share_pct, payer, allow_price_display,
        max_marketing_agents, requires_la_approval, notes, created_by)
     values ('CMO-2026-900001', $1, $2, 'active', 'open_pool', 'total_pct', 2.5, 50, 'owner', true,
             5, false, 'Skenario uji staging — boleh dipasarkan agen lain.', $2)
     on conflict (human_readable_id) do update set status = 'active', listing_id = excluded.listing_id
     returning id`,
    [listingId, ids.LA]
  );
  await db.query(
    `insert into public.comarketing_offer_private (offer_id, min_marketing_price, internal_notes)
     values ($1, 3300000000, 'Jangan turun di bawah 3,3 M.')
     on conflict (offer_id) do update set min_marketing_price = excluded.min_marketing_price`,
    [offer[0].id]
  );

  // --- RA has one unfinished draft, so the dashboard brief has an action --
  // (the AI Manager is only asked to write when something is waiting).
  const { rows: raProp } = await db.query(
    `insert into public.properties
       (human_readable_id, agent_id, country_code, property_category, property_type, ownership_type,
        location_id, ancestor_location_ids, province_name, regency_name, general_address,
        land_size, building_size, bedrooms, bathrooms, created_by)
     values ('PRP-2026-900002', $1, 'ID', 'residential', 'apartemen', 'strata', $2, $3, $4, $5,
             'Kebayoran Baru', null, 78, 2, 1, $1)
     on conflict (human_readable_id) do update set agent_id = excluded.agent_id
     returning id`,
    [ids.RA, regency.id, ancestors, path[0] ?? null, path[1] ?? null]
  );
  await db.query(
    `insert into public.listings
       (human_readable_id, property_id, agent_id, listing_type, status, moderation_state, currency,
        price, language, title, description, slug, created_by)
     values ('LST-2026-900002', $1, $2, 'sale', 'draft', 'pending', 'IDR', 1850000000, 'id',
             'Apartemen 2BR Kebayoran Baru (draf uji staging)', 'Draf belum selesai.',
             'apartemen-2br-kebayoran-baru-900002', $2)
     on conflict (human_readable_id) do update set status = 'draft', agent_id = excluded.agent_id`,
    [raProp[0].id, ids.RA]
  );

  // --- a marketplace enquiry on LA's published listing (Secretary, E5) ----
  // Reserved `.test` address: nothing here can ever be delivered.
  const { rows: contact } = await db.query(
    `insert into public.contacts (human_readable_id, full_name, phone, email, preferred_language, source, marketing_consent)
     values ('CON-2026-900001', 'Siti Rahma', '+6281200009901', 'siti.rahma@seed.propertiguru.test', 'id', 'marketplace', false)
     on conflict (phone) do update set full_name = excluded.full_name, email = excluded.email
     returning id`
  );
  await db.query(
    `insert into public.leads (human_readable_id, contact_id, listing_id, agent_id, status, message, inquiry_type, source, locale, first_response_due)
     values ('LEAD-2026-900001', $1, $2, $3, 'new',
             'Halo, saya tertarik dengan rumah ini. Bisa survey akhir pekan ini? Harga masih bisa nego?',
             'viewing_request', 'marketplace', 'id', now() + interval '2 hours')
     on conflict (human_readable_id) do update
        set status = 'new', first_responded_at = null, first_response_due = now() + interval '2 hours', agent_id = excluded.agent_id`,
    [contact[0].id, listingId, ids.LA]
  );

  // --- MA publishes a comparable house into the open pool (matcher, E6) ---
  const { rows: maProp } = await db.query(
    `insert into public.properties
       (human_readable_id, agent_id, country_code, property_category, property_type, ownership_type,
        location_id, ancestor_location_ids, province_name, regency_name, general_address,
        land_size, building_size, bedrooms, bathrooms, parking_spaces, year_built, furnishing, property_condition, created_by)
     values ('PRP-2026-900003', $1, 'ID', 'residential', 'rumah', 'shm', $2, $3, $4, $5, 'Pondok Indah',
             220, 190, 4, 3, 2, 2017, 'partially', 'good', $1)
     on conflict (human_readable_id) do update set agent_id = excluded.agent_id
     returning id`,
    [ids.MA, regency.id, ancestors, path[0] ?? null, path[1] ?? null]
  );
  await db.query(
    `insert into public.property_private (property_id, exact_address, owner_name, owner_phone, owner_authorisation_status, minimum_price)
     values ($1, 'Jl. Metro Pondok Indah (privat)', 'Pemilik Uji 3', '+6281200009003', 'obtained', 3600000000)
     on conflict (property_id) do update set owner_authorisation_status = 'obtained'`,
    [maProp[0].id]
  );
  const { rows: maLst } = await db.query(
    `insert into public.listings
       (human_readable_id, property_id, agent_id, listing_type, status, moderation_state, currency, price, price_negotiable,
        language, title, description, slug, published_at, expires_at, is_verified, created_by)
     values ('LST-2026-900003', $1, $2, 'sale', 'published', 'approved', 'IDR', 3800000000, true, 'id',
             '[DEMO] Rumah 4 kamar Pondok Indah, taman luas',
             'Rumah keluarga dua lantai di Pondok Indah, dekat PIM dan sekolah internasional. Akun uji staging.',
             'rumah-4-kamar-pondok-indah-900003', now(), now() + interval '90 days', true, $2)
     on conflict (human_readable_id) do update set status = 'published', agent_id = excluded.agent_id, title = excluded.title
     returning id`,
    [maProp[0].id, ids.MA]
  );
  await db.query(
    `insert into public.comarketing_offers
       (human_readable_id, listing_id, listing_agent_id, status, scope, commission_basis, total_commission_pct,
        marketing_agent_share_pct, payer, allow_price_display, max_marketing_agents, requires_la_approval, notes, created_by)
     values ('CMO-2026-900002', $1, $2, 'active', 'open_pool', 'total_pct', 2.5, 50, 'owner', true, 5, false,
             'Skenario uji staging — pembanding untuk matcher.', $2)
     on conflict (human_readable_id) do update set status = 'active', listing_id = excluded.listing_id`,
    [maLst[0].id, ids.MA]
  );

  await db.query("commit");
  console.log(
    `Scenario ready on ${ref}:\n` +
      `  LST-2026-900003 (MA, published, open-pool CMO-2026-900002) as a match candidate\n` +
      `  LEAD-2026-900001 (Siti Rahma → LA's listing, new, viewing request)\n` +
      `  LST-2026-900002 (RA, draft) so the brief has an action\n` +
      `  REQ-2026-900001 (RA) ← SUB-2026-900001 (SA, shortlisted) · COM-2026-900001 accepted · 1 disclosure · consents RA+SA\n` +
      `  LST-2026-900001 (LA, published) → CMO-2026-900001 open-pool offer\n`
  );
} catch (err) {
  await db.query("rollback").catch(() => {});
  console.error("Seed failed, rolled back:", err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
