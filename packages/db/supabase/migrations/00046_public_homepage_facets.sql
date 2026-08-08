-- =============================================================================
-- 00046 — Facet counts for the public homepage
--
-- The homepage needs "browse by city" and "browse by property type" grids with
-- real counts next to each entry — the pattern every portal in this market
-- uses, and one of the few genuinely load-bearing SEO surfaces a property site
-- has (Rumah123's footer province grid is the clearest example).
--
-- PostgREST cannot GROUP BY, so the alternatives were: one head-count request
-- per facet value (fifteen round trips for property types alone), or counting
-- in JavaScript over a fetched page (which would report the page, not the
-- catalogue, and quietly lie as soon as the catalogue outgrew one page).
-- Aggregating in Postgres is both correct and one request.
--
-- These are aggregates of `public_listings` ONLY. They inherit its visibility
-- rule exactly — published, approved, unarchived, unexpired — because they are
-- built on the view rather than on the base tables. If the public rule changes
-- in one place, it changes here too. That is the whole reason they are not
-- written against `listings` directly.
--
-- Nothing here exposes a new column: a count of already-public rows, grouped by
-- an already-public column. No agent, price, or address data leaves through
-- these.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Property type × listing type, for the "browse by type" grid.
-- -----------------------------------------------------------------------------
create view public.public_facet_property_types with (security_invoker = false) as
select
  property_type,
  property_category,
  listing_type,
  count(*)::bigint as listing_count,
  min(price) filter (where price is not null) as min_price
from public.public_listings
group by property_type, property_category, listing_type;

comment on view public.public_facet_property_types is
  'Homepage/browse facet: how many published listings exist per property type and sale/rent. Aggregate of public_listings, so it inherits that view''s visibility rule.';

-- -----------------------------------------------------------------------------
-- Regency (kota/kabupaten) × listing type, for the "browse by city" grid.
--
-- Regency rather than district: a homepage grid wants twenty recognisable
-- places, not seven thousand. Province comes along so the grid can group and
-- so the footer can build its by-province links from the same view.
-- -----------------------------------------------------------------------------
create view public.public_facet_locations with (security_invoker = false) as
select
  province_name,
  regency_name,
  listing_type,
  count(*)::bigint as listing_count,
  min(price) filter (where price is not null) as min_price
from public.public_listings
where regency_name is not null
group by province_name, regency_name, listing_type;

comment on view public.public_facet_locations is
  'Homepage/browse facet: published listing counts per kota/kabupaten and sale/rent. Aggregate of public_listings.';

-- -----------------------------------------------------------------------------
-- Grants.
--
-- SELECT only, and stated explicitly. Supabase's default privileges grant anon
-- ALL on new views — including UPDATE and DELETE, which on a grouped view fail
-- for unrelated reasons and so look "safe" while the grant is still there.
-- That mistake has been made three times in this schema (00032, 00043, 00044);
-- it is not repeated by accident here.
-- -----------------------------------------------------------------------------
revoke all on public.public_facet_property_types from anon, authenticated;
revoke all on public.public_facet_locations from anon, authenticated;

grant select on public.public_facet_property_types to anon, authenticated;
grant select on public.public_facet_locations to anon, authenticated;
