-- =============================================================================
-- 00076 — Expose country on the public views
--
-- THE BUG THIS CLOSES
--   `public_listings` and the two facet views select from `properties`, which
--   carries `country_code`, but never project it. The marketplace therefore has
--   no way to filter by country at all: a Malaysian deployment pointed at this
--   database would serve Indonesian listings, in rupiah, with Indonesian
--   place names, and nothing in the code could prevent it.
--
--   It was invisible while one country existed. It stops being invisible the
--   moment a second one does.
--
-- WHY A COLUMN AND NOT A SEPARATE VIEW PER COUNTRY
--   A view per market multiplies with every market and drifts the first time
--   one is changed and the other is forgotten. One column, filtered by the
--   caller, keeps a single definition — and the filter is visible in the query
--   rather than hidden in the object name.
--
-- CREATE OR REPLACE VIEW can only ADD columns at the end, so the full
-- definition is restated with `country_code` appended. The body below is
-- otherwise byte-for-byte what 00042 and 00046 created.
-- =============================================================================

create or replace view public.public_listings with (security_invoker = false) as
select
  l.id, l.human_readable_id, l.slug, l.listing_type, l.currency, l.price,
  l.rent_period, l.price_negotiable, l.deposit, l.service_charge, l.language,
  l.title, l.description, l.title_en, l.description_en, l.key_selling_points,
  l.available_from, l.published_at, l.is_verified, l.is_featured,
  l.quality_score, l.ranking_score, l.view_count, l.save_count,

  p.id as property_id, p.property_category, p.property_type, p.ownership_type,
  p.general_address, p.building_name, p.developer_name, p.postal_code,
  p.province_name, p.regency_name, p.district_name, p.village_name,
  p.location_id, p.ancestor_location_ids,
  extensions.st_y(p.geom::extensions.geometry) as latitude,
  extensions.st_x(p.geom::extensions.geometry) as longitude,
  p.land_size, p.building_size, p.measurement_unit, p.bedrooms, p.bathrooms,
  p.floors, p.floor_level, p.parking_spaces, p.year_built, p.furnishing,
  p.property_condition, p.facing, p.electricity_va, p.facilities,

  l.agent_id, ap.display_name as agent_display_name,
  ap.avatar_url as agent_avatar_url, agp.agency_name as agent_agency_name,
  (ap.agent_status = 'verified') as agent_is_verified,

  cover.processed_path as cover_image_path,
  cover.thumbnail_path as cover_thumbnail_path,
  cover.alt_text as cover_alt_text,
  (select count(*) from public.listing_media m
     where m.listing_id = l.id and m.processing_state = 'ready') as media_count,

  -- Promotion, always labelled in the UI (§14 transparency).
  public.listing_boost_weight(l.id) as boost_weight,
  (public.listing_boost_weight(l.id) > 0) as is_boosted,

  -- NEW: which market this listing belongs to.
  p.country_code
from public.listings l
join public.properties p on p.id = l.property_id
join public.profiles ap on ap.id = l.agent_id
left join public.agent_profiles agp on agp.user_id = l.agent_id
left join lateral (
  select m.processed_path, m.thumbnail_path, m.alt_text
  from public.listing_media m
  where m.listing_id = l.id and m.processing_state = 'ready'
  order by m.is_cover desc, m.position
  limit 1
) cover on true
where l.status = 'published'
  and l.moderation_state = 'approved'
  and l.archived_at is null;

-- The facets roll up from the view above, so they inherit the column and only
-- need it added to the grouping.
create or replace view public.public_facet_locations with (security_invoker = false) as
select
  province_name,
  regency_name,
  listing_type,
  count(*) as listing_count,
  min(price) filter (where price is not null) as min_price,
  country_code
from public.public_listings
where regency_name is not null
group by province_name, regency_name, listing_type, country_code;

create or replace view public.public_facet_property_types with (security_invoker = false) as
select
  property_type,
  property_category,
  listing_type,
  count(*) as listing_count,
  min(price) filter (where price is not null) as min_price,
  country_code
from public.public_listings
group by property_type, property_category, listing_type, country_code;

-- Grants are not inherited by CREATE OR REPLACE on an existing view, but
-- restating them costs nothing and makes this migration safe to replay.
revoke all on public.public_listings from anon, authenticated;
revoke all on public.public_facet_locations from anon, authenticated;
revoke all on public.public_facet_property_types from anon, authenticated;
grant select on public.public_listings to anon, authenticated;
grant select on public.public_facet_locations to anon, authenticated;
grant select on public.public_facet_property_types to anon, authenticated;
