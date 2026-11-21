-- 00135: details a project catalogue states that 00134 had no place for.
--
-- Seen in the source catalogue's own screens: a street address, a map position,
-- the number of units in the project, a land area, and room counts written as
-- text ("2 - 6+2", "3+1 - 4+1") that two integers cannot hold.
--
-- Also: why a synced row was held as a draft. The weekly sync must never
-- publish a doubtful row (a price of 665 rupiah was seen in the source), so it
-- parks such rows as drafts and records the reasons where only platform
-- configurers can read them.

alter table public.international_listings
  add column address text check (address is null or length(address) <= 400),
  add column latitude numeric(9,6) check (latitude between -90 and 90),
  add column longitude numeric(9,6) check (longitude between -180 and 180),
  add column total_units int check (total_units > 0),
  -- Same unit as size_min/size_max (size_unit).
  add column land_size numeric(14,2) check (land_size > 0),
  -- The source's own wording, shown when present; bedrooms_min/max stay the
  -- sortable, filterable figures.
  add column bedrooms_label text check (bedrooms_label is null or length(bedrooms_label) <= 40),
  add column bathrooms_label text check (bathrooms_label is null or length(bathrooms_label) <= 40),
  -- A position needs both halves.
  add constraint international_listings_position_pair
    check ((latitude is null) = (longitude is null));

alter table public.international_listing_private
  add column review_flags text[] not null default '{}';

comment on column public.international_listing_private.review_flags is
  'Why the sync held this row as a draft (e.g. price_range, no_photos). Empty when nothing was doubtful. Never public.';

-- New columns are appended: CREATE OR REPLACE VIEW cannot reorder. Everything
-- added here is what the project itself advertises; review_flags is not here.
create or replace view public.public_international_listings with (security_invoker = false) as
select
  l.id, l.slug, l.country_code, l.region, l.city, l.area,
  l.title, l.summary, l.description, l.listing_type, l.category,
  l.property_type_label, l.developer_name, l.tenure_label, l.completion_label,
  l.bedrooms_min, l.bedrooms_max, l.bathrooms_min, l.bathrooms_max,
  l.size_min, l.size_max, l.size_unit,
  l.currency, l.price_min, l.price_max,
  l.highlights, l.is_featured, l.published_at,
  c.display_name as contact_name,
  c.role_label as contact_role,
  c.phone as contact_whatsapp,
  (select m.storage_bucket || '/' || m.storage_path
     from public.international_listing_media m
    where m.listing_id = l.id order by m.position, m.created_at limit 1) as cover_path,
  (select count(*) from public.international_listing_media m where m.listing_id = l.id) as photo_count,
  l.address, l.latitude, l.longitude, l.total_units, l.land_size,
  l.bedrooms_label, l.bathrooms_label
from public.international_listings l
left join lateral (
  select cc.display_name, cc.role_label, cc.phone
  from public.country_contacts cc
  where cc.active
    and (cc.all_countries or exists (
      select 1 from public.country_contact_countries x
      where x.contact_id = cc.id and x.country_code = l.country_code))
  order by (not exists (
      select 1 from public.country_contact_countries x
      where x.contact_id = cc.id and x.country_code = l.country_code)),
    cc.sort_order, cc.created_at
  limit 1
) c on true
where l.status = 'published';
