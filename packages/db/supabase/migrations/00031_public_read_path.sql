-- =============================================================================
-- 00031 — The public read path
--
-- This migration is the single most important security control in the
-- platform. It is what stops a compromise of the anonymous marketplace from
-- reaching MatchHub minimum prices, commission terms, source-agent chains,
-- owner identities and client contact details, all of which live in the same
-- database.
--
-- Three layers, in order of strength:
--
--   1. apps/www holds no service-role key. It connects with the anon key only.
--   2. anon's table-level grants are REVOKED on every catalogue table below.
--      Supabase grants ALL on new public tables to anon by default and relies
--      on RLS alone; here the grant itself is removed, so an RLS mistake is no
--      longer sufficient to leak data.
--   3. Reads go through the views below, which whitelist columns explicitly.
--      A column that is not named here cannot be selected, ever.
--
-- The views are intentionally SECURITY DEFINER (security_invoker = false, the
-- PostgreSQL default). They are owned by postgres and therefore see through
-- RLS on the base tables — that is precisely why the WHERE clauses below are
-- the entire public visibility rule and must be read as security-critical
-- code. Supabase's linter flags definer views generically; this is the
-- deliberate, documented exception, and it is safer than the alternative of
-- granting anon row access to base tables, which would expose every column of
-- a visible row rather than the seven or eight that are public.
--
-- Deviation from the Stage A plan, recorded honestly: that plan named a
-- dedicated `pg_public_read` database role. Supabase derives the database role
-- from the API key, so a custom role would require issuing and rotating custom
-- JWTs. Using `anon` with its grants revoked achieves an identical privilege
-- boundary with materially less moving machinery.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Remove anon's default table grants on everything in the catalogue.
-- -----------------------------------------------------------------------------
revoke all on public.properties from anon;
revoke all on public.property_private from anon;
revoke all on public.listings from anon;
revoke all on public.listing_media from anon;
revoke all on public.listing_price_history from anon;
revoke all on public.listing_status_history from anon;
revoke all on public.listing_quality_scores from anon;
revoke all on public.listing_statistics from anon;
revoke all on public.listing_embeddings from anon;

-- The same reasoning applies to everything MatchHub owns. These tables were
-- never reachable anonymously in practice, because they carry no anon policy,
-- but the marketplace makes anon a first-class caller for the first time, so
-- the grants come off rather than resting on policy alone.
revoke all on public.property_requests from anon;
revoke all on public.property_request_private from anon;
revoke all on public.property_submissions from anon;
revoke all on public.property_submission_private from anon;
revoke all on public.property_submission_sources from anon;
revoke all on public.property_submission_media from anon;
revoke all on public.commission_agreements from anon;
revoke all on public.commission_agreement_versions from anon;
revoke all on public.commission_acceptances from anon;
revoke all on public.users_private from anon;
revoke all on public.agent_profiles from anon;
revoke all on public.agent_verifications from anon;
revoke all on public.audit_logs from anon;
revoke all on public.messages from anon;
revoke all on public.conversations from anon;
revoke all on public.offers from anon;
revoke all on public.violation_reports from anon;
revoke all on public.violation_report_admin from anon;

-- -----------------------------------------------------------------------------
-- 2. public_listings — the marketplace's only window onto inventory.
--
-- Everything a search result or listing page needs, and nothing else.
-- Deliberately absent: exact address, unit number, owner identity, minimum
-- price, internal notes, moderation reasons, agent email or phone.
-- -----------------------------------------------------------------------------
create view public.public_listings with (security_invoker = false) as
select
  l.id,
  l.human_readable_id,
  l.slug,
  l.listing_type,
  l.currency,
  l.price,
  l.rent_period,
  l.price_negotiable,
  l.deposit,
  l.service_charge,
  l.language,
  l.title,
  l.description,
  l.title_en,
  l.description_en,
  l.key_selling_points,
  l.available_from,
  l.published_at,
  l.is_verified,
  l.is_featured,
  l.quality_score,
  l.ranking_score,
  l.view_count,
  l.save_count,

  p.id                      as property_id,
  p.property_category,
  p.property_type,
  p.ownership_type,
  p.general_address,
  p.building_name,
  p.developer_name,
  p.postal_code,
  p.province_name,
  p.regency_name,
  p.district_name,
  p.village_name,
  p.location_id,
  p.ancestor_location_ids,
  -- Coordinates are exposed as plain numbers so the marketplace never needs
  -- PostGIS types on the client. Precision is deliberately the property's
  -- public approximate point, not its exact address.
  extensions.st_y(p.geom::extensions.geometry) as latitude,
  extensions.st_x(p.geom::extensions.geometry) as longitude,
  p.land_size,
  p.building_size,
  p.measurement_unit,
  p.bedrooms,
  p.bathrooms,
  p.floors,
  p.floor_level,
  p.parking_spaces,
  p.year_built,
  p.furnishing,
  p.property_condition,
  p.facing,
  p.electricity_va,
  p.facilities,

  l.agent_id,
  ap.display_name           as agent_display_name,
  ap.avatar_url             as agent_avatar_url,
  agp.agency_name           as agent_agency_name,
  (ap.agent_status = 'verified') as agent_is_verified,

  cover.processed_path      as cover_image_path,
  cover.thumbnail_path      as cover_thumbnail_path,
  cover.alt_text            as cover_alt_text,
  (select count(*) from public.listing_media m
     where m.listing_id = l.id and m.processing_state = 'ready') as media_count
from public.listings l
join public.properties p on p.id = l.property_id
join public.profiles ap on ap.id = l.agent_id
left join public.agent_profiles agp on agp.user_id = l.agent_id
left join lateral (
  select m.processed_path, m.thumbnail_path, m.alt_text
  from public.listing_media m
  where m.listing_id = l.id
    and m.processing_state = 'ready'
  order by m.is_cover desc, m.position
  limit 1
) cover on true
where l.status = 'published'
  and l.moderation_state = 'approved'
  and l.archived_at is null
  and p.archived_at is null
  and (l.expires_at is null or l.expires_at > now());

-- -----------------------------------------------------------------------------
-- 3. public_listing_media — the gallery, for published listings only.
-- -----------------------------------------------------------------------------
create view public.public_listing_media with (security_invoker = false) as
select
  m.id,
  m.listing_id,
  m.kind,
  m.processed_path,
  m.thumbnail_path,
  m.position,
  m.is_cover,
  m.alt_text,
  m.width,
  m.height
from public.listing_media m
join public.listings l on l.id = m.listing_id
where m.processing_state = 'ready'
  and l.status = 'published'
  and l.moderation_state = 'approved'
  and l.archived_at is null
  and (l.expires_at is null or l.expires_at > now())
order by m.is_cover desc, m.position;

-- -----------------------------------------------------------------------------
-- 4. public_agent_profiles — the agent's public face.
--
-- Deliberately absent: full legal name, licence number, licence expiry,
-- identity and licence document paths, email, phone, review notes.
-- -----------------------------------------------------------------------------
create view public.public_agent_profiles with (security_invoker = false) as
select
  pr.id,
  pr.display_name,
  pr.avatar_url,
  pr.country_code,
  pr.preferred_language,
  (pr.agent_status = 'verified') as is_verified,
  agp.agency_name,
  agp.city,
  agp.state_region,
  agp.biography,
  agp.profile_photo_path,
  agp.markets_served,
  agp.property_categories,
  (select count(*) from public.listings l
     where l.agent_id = pr.id
       and l.status = 'published'
       and l.moderation_state = 'approved'
       and l.archived_at is null) as published_listing_count
from public.profiles pr
left join public.agent_profiles agp on agp.user_id = pr.id
where pr.agent_status = 'verified';

-- -----------------------------------------------------------------------------
-- 5. Grants: the views are the entire public surface.
-- -----------------------------------------------------------------------------
grant select on public.public_listings to anon, authenticated;
grant select on public.public_listing_media to anon, authenticated;
grant select on public.public_agent_profiles to anon, authenticated;

comment on view public.public_listings is
  'Public marketplace read surface. SECURITY DEFINER by design — the WHERE clause is the visibility rule. Adding a column here publishes it to the anonymous internet; review as security-critical code.';
comment on view public.public_agent_profiles is
  'Public agent profile. Never add licence numbers, document paths, legal names or contact details.';
