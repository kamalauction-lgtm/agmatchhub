-- =============================================================================
-- 00109 — Photo processing, slice P0-e-2a: private original → clean derivative
--
-- Owner decision (10 Nov 2026): Cloudflare Images binding called from the hub
-- Worker's cron, on the Images FREE plan (no purchase), pilot cap $0 — the
-- processor pauses at 4,500 transformations a month, below the free plan's
-- hard stop at 5,000. Staging first; production separately.
--
-- THE FLOW
--   pending     an original in the private listing-media-intake bucket (00108)
--   processing  claimed by the cron with a lease (claim_intake_media)
--   processed   two WebP derivatives (1600 px, 400 px) written PRIVATELY to
--               <agent>/<listing>/derived-<media>-{1600,400}.webp — inside the
--               owner's folder, so the 00108 read policy already lets the owner
--               and in-country moderators preview them
--   ready       copied to listing-media-public when the listing is approved
--   failed      after 3 attempts with backoff; the listing is never touched
--   quarantined a moderator kept it out
--
-- All of these transitions run on the operator path (service role, no JWT).
-- The 00108 guard already refuses any client session changing an intake
-- photo's state or paths.
--
-- WebP output from Cloudflare Images discards all metadata (documented); the
-- processor also checks each derivative's bytes for EXIF/XMP before storing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. States and bookkeeping on listing_media
-- -----------------------------------------------------------------------------

alter table public.listing_media drop constraint listing_media_processing_state_check;
alter table public.listing_media add constraint listing_media_processing_state_check
  check (processing_state in ('pending', 'processing', 'processed', 'ready', 'failed', 'quarantined'));

alter table public.listing_media
  add column if not exists derived_path text,
  add column if not exists derived_thumb_path text,
  add column if not exists processing_attempts int not null default 0,
  add column if not exists processing_error text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_next_at timestamptz;

create index if not exists idx_listing_media_intake_queue
  on public.listing_media (processing_next_at nulls first, created_at)
  where processing_state in ('pending', 'processing') and storage_path like 'listing-media-intake/%';

-- -----------------------------------------------------------------------------
-- 2. Monthly usage, for the spending cap
-- -----------------------------------------------------------------------------

create table public.media_processing_usage (
  month date primary key,                 -- first day of the month, UTC
  transformations int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.media_processing_usage enable row level security;
-- No policies: written and read only by the processor (service role).
revoke all on public.media_processing_usage from anon, authenticated;

create or replace function public.media_processing_usage_add(p_count int)
returns int language sql security definer set search_path = public as $$
  insert into public.media_processing_usage as u (month, transformations)
  values (date_trunc('month', now() at time zone 'utc')::date, p_count)
  on conflict (month) do update
    set transformations = u.transformations + excluded.transformations, updated_at = now()
  returning transformations;
$$;

create or replace function public.media_processing_usage_now()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select transformations from public.media_processing_usage
                    where month = date_trunc('month', now() at time zone 'utc')::date), 0);
$$;

-- -----------------------------------------------------------------------------
-- 3. Claiming work: a lease, so overlapping runs never process a photo twice
-- -----------------------------------------------------------------------------

create or replace function public.claim_intake_media(p_limit int default 20)
returns setof public.listing_media
language sql security definer set search_path = public as $$
  update public.listing_media m
     set processing_state = 'processing', processing_started_at = now()
   where m.id in (
     select id from public.listing_media
      where storage_path like 'listing-media-intake/%'
        and processing_attempts < 3
        and (
          (processing_state = 'pending' and (processing_next_at is null or processing_next_at <= now()))
          -- a lease older than 10 minutes belongs to a run that died
          or (processing_state = 'processing' and processing_started_at < now() - interval '10 minutes')
        )
      order by processing_next_at nulls first, created_at
      limit greatest(1, least(p_limit, 50))
      for update skip locked
   )
  returning m.*;
$$;

-- The processor and nothing else.
revoke all on function public.media_processing_usage_add(int) from public, anon, authenticated;
revoke all on function public.media_processing_usage_now() from public, anon, authenticated;
revoke all on function public.claim_intake_media(int) from public, anon, authenticated;
grant execute on function public.media_processing_usage_add(int) to service_role;
grant execute on function public.media_processing_usage_now() to service_role;
grant execute on function public.claim_intake_media(int) to service_role;
