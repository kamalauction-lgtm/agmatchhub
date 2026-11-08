-- =============================================================================
-- 00077 — Advertising banners belong to a market
--
-- FOUND BY RUNNING THE MALAYSIAN BUILD
--   The homepage rendered two Indonesian advertisements — "Bogor Selatan, Jawa
--   Barat", "Mulai 800 juta-an" — on a Malaysian site, in rupiah. `site_banners`
--   has no country column at all, so every banner was global.
--
--   That is worse than a cosmetic leak. These are PAID placements: an
--   advertiser buying a Malaysian slot would have been shown to Indonesians and
--   vice versa, and the label says "Iklan"/"Advertisement", so a reader takes
--   it as a real offer in their own market.
--
-- Existing rows are Indonesian — they are the two sample banners seeded for
-- propertiguru.id — so the backfill is 'ID' and the column is then NOT NULL.
-- A banner with no market would be the same bug with extra steps.
-- =============================================================================

alter table public.site_banners
  add column if not exists country_code text references public.countries(code);

update public.site_banners set country_code = 'ID' where country_code is null;

alter table public.site_banners alter column country_code set not null;

create index if not exists idx_site_banners_country
  on public.site_banners (country_code, slot, is_active);

comment on column public.site_banners.country_code is
  'Which market this placement runs in. Paid advertising must never cross markets — see migration 00077.';

-- The public view gains the column so the marketplace can filter on it.
create or replace view public.public_site_banners with (security_invoker = false) as
select
  id, slot, title, subtitle, advertiser_label, location_label, price_label,
  image_path, link_url, cta_label, "position", country_code
from public.site_banners
-- Predicate restated exactly as 00045 wrote it. `starts_at IS NULL` matters:
-- a banner with no start date runs immediately, and dropping that check would
-- have silently hidden every such placement.
where is_active
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now());

revoke all on public.public_site_banners from anon, authenticated;
grant select on public.public_site_banners to anon, authenticated;
