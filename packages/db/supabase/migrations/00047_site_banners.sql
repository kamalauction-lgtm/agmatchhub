-- =============================================================================
-- 00047 — Advertising banners for new-development campaigns
--
-- Two slots on the marketplace homepage: `home_top` (above the inventory) and
-- `home_middle` (between the browse grids). Admins create, edit and retire
-- them; the public reads them through a view, like everything else public.
--
-- These are ADVERTISEMENTS — paid or promotional placements for developer
-- projects, not catalogue content. Three consequences, all deliberate:
--
--   1. The public surface must label them as advertising. That is enforced in
--      the component, but it is the reason `advertiser_label` exists here: a
--      banner cannot be published without naming who is advertising.
--   2. They are admin-only to write. An agent cannot buy their way onto the
--      homepage by inserting a row; the placement is a commercial decision made
--      off-platform and recorded here.
--   3. Every create, edit and retire is audited, because "who put that on the
--      homepage" is a question that gets asked after the fact.
--
-- Scheduling is by window (`starts_at`/`ends_at`), so a campaign can be loaded
-- ahead of time and expires on its own rather than relying on somebody
-- remembering to switch it off.
-- =============================================================================

create table public.site_banners (
  id uuid primary key default gen_random_uuid(),

  -- Where it renders. Constrained rather than free text: a typo'd slot would
  -- silently render nowhere, which looks identical to "the ad never ran".
  slot text not null check (slot in ('home_top', 'home_middle')),

  title text not null,
  subtitle text,

  -- Who is advertising. Required for publication — see the guard below.
  advertiser_label text,

  -- Campaign facts shown on the card. Text, not numeric: a developer's
  -- headline is "Mulai 800 juta-an", which is a marketing claim in their words,
  -- not a price we hold or can compute against.
  location_label text,
  price_label text,

  /**
   * Storage path (`banners/foo.jpg`) or a site-relative path (`/banners/x.svg`).
   * Absolute third-party URLs are rejected by the application: next/image only
   * permits the Supabase host, so an external URL would publish as a broken
   * image on the homepage.
   */
  image_path text,

  link_url text,
  cta_label text,

  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,

  /** Lower sorts first within a slot. */
  position int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_site_banners_slot_live on public.site_banners (slot, position)
  where is_active;

create trigger trg_site_banners_updated_at
  before update on public.site_banners
  for each row execute function public.set_updated_at();

comment on table public.site_banners is
  'Advertising placements on the public marketplace. Admin-managed, audited, and always labelled as advertising on the public surface.';

-- -----------------------------------------------------------------------------
-- An advertisement that does not say who is advertising is not publishable.
--
-- SECURITY INVOKER (00039's lesson): a guard must run as its caller.
-- -----------------------------------------------------------------------------
create or replace function public.guard_site_banner()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.is_active and coalesce(btrim(new.advertiser_label), '') = '' then
    raise exception 'an active banner must name the advertiser';
  end if;

  if new.ends_at is not null and new.starts_at is not null
     and new.ends_at <= new.starts_at then
    raise exception 'the campaign end must come after its start';
  end if;

  return new;
end;
$$;

create trigger trg_guard_site_banner
  before insert or update on public.site_banners
  for each row execute function public.guard_site_banner();

-- -----------------------------------------------------------------------------
-- RLS: admins write, nobody else. There is no agent-facing path to this table.
-- -----------------------------------------------------------------------------
alter table public.site_banners enable row level security;

create policy "site banners admin" on public.site_banners
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- The public read path. Same shape as 00031: a definer view whose WHERE clause
-- IS the visibility rule, over a base table anon cannot touch.
-- -----------------------------------------------------------------------------
create view public.public_site_banners with (security_invoker = false) as
select
  id,
  slot,
  title,
  subtitle,
  advertiser_label,
  location_label,
  price_label,
  image_path,
  link_url,
  cta_label,
  position
from public.site_banners
where is_active
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now());

comment on view public.public_site_banners is
  'Live advertising placements. Inherits the scheduling window; nothing outside it is readable by the public.';

-- -----------------------------------------------------------------------------
-- Grants. Explicit, because Supabase's defaults hand anon ALL on new tables and
-- views — the mistake this schema has now made four times (00032, 00043,
-- 00044, and the near-miss in 00046).
-- -----------------------------------------------------------------------------
revoke all on public.site_banners from anon, authenticated;
revoke all on public.public_site_banners from anon, authenticated;

grant select, insert, update, delete on public.site_banners to authenticated;
grant select on public.public_site_banners to anon, authenticated;
