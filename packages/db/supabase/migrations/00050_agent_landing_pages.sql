-- =============================================================================
-- 00050 — Agent landing pages: /agent/<slug>
--
-- The surface co-marketing was built for. An agent's own page carries their own
-- mandates AND the listings they market for other agents, under their name and
-- their contact. Kamal's call (4 Aug 2026): path-based on the main domain, with
-- a custom domain as the Premium upgrade later.
--
-- The invariant that makes this safe (module design §7):
--
--   Marketplace surfaces — home, /cari, /properti/* — show the ORIGINAL listing
--   agent only, and never contain borrowed listings.
--   The /agent/* namespace is the agent's own space, where borrowed listings
--   are the entire point.
--
-- The namespaces never mix, which is why a property appears exactly once in
-- marketplace search with the agent who actually holds the mandate.
--
-- NO own/borrowed FLAG on the rows. §7.2 says nothing on the page should
-- indicate which is which, and a column would hand it over in one query.
--
-- Be honest about the limit of that, though: it does NOT make the co-broke
-- relationship secret. The same listing appears on the owner's page and on the
-- borrower's, so comparing two public pages — or joining this view against
-- public_listings, which names the true owner — reveals that A is marketing B's
-- property. That is inherent to letting two agents publicly market one
-- property, not a defect in this view, and no schema change fixes it.
--
-- What IS protected, and what the module actually promises: the commission
-- terms, the marketing-agent share, the seller's floor price and the internal
-- notes. Those live in comarketing_offer_private and property_private, and no
-- public view reaches them.
--
-- Contact: the page uses the platform's lead-capture flow, NOT a raw phone
-- number. The benchmark (PropMall) puts a WhatsApp button on the agent card,
-- but the number lives in `users_private` for good reason, and every lead on
-- this platform is tracked against a response SLA. A direct number would leak a
-- private column and bypass the SLA in one move.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A public, stable handle for each agent
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists public_slug text unique;

comment on column public.profiles.public_slug is
  'Handle for /agent/<slug>. Display-only, never a security token — guessable by design.';

/** `Dewi Lestari` -> `dewi-lestari`. */
create or replace function public.slugify(p_text text)
returns text language sql immutable set search_path = public as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;

/**
 * Assign a slug on insert/rename, de-duplicated with a numeric suffix.
 *
 * SECURITY INVOKER — a guard runs as its caller (00039).
 */
create or replace function public.guard_profile_slug()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_base text;
  v_try  text;
  v_n    int := 1;
begin
  -- Only assign when absent. An existing slug is a published URL: silently
  -- changing it on a rename would break every link the agent has shared.
  if new.public_slug is not null and new.public_slug <> '' then
    return new;
  end if;

  v_base := public.slugify(new.display_name);
  if v_base = '' then
    v_base := 'agent';
  end if;

  v_try := v_base;
  while exists (
    select 1 from public.profiles p
    where p.public_slug = v_try and p.id is distinct from new.id
  ) loop
    v_n := v_n + 1;
    v_try := v_base || '-' || v_n;
  end loop;

  new.public_slug := v_try;
  return new;
end;
$$;

create trigger trg_guard_profile_slug
  before insert or update of display_name, public_slug on public.profiles
  for each row execute function public.guard_profile_slug();

-- Backfill. Loop rather than a set-based update so the de-duplication in the
-- trigger sees each row that came before it.
do $$
declare r record;
begin
  for r in select id from public.profiles where public_slug is null loop
    update public.profiles set public_slug = null where id = r.id;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- The agent card
-- -----------------------------------------------------------------------------

drop view if exists public.public_agent_profiles;

create view public.public_agent_profiles with (security_invoker = false) as
select
  pr.id,
  pr.public_slug,
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
-- What appears on an agent's page: their own listings, plus what they market
-- -----------------------------------------------------------------------------

create view public.public_agent_listings with (security_invoker = false) as
  -- Their own mandates.
  select pl.*, l.agent_id as page_agent_id
  from public.public_listings pl
  join public.listings l on l.id = pl.id

  union all

  -- Listings they market for another agent under a live engagement. The page
  -- owner is the MARKETING agent, which is what swaps the contact on the page.
  select pl.*, e.marketing_agent_id as page_agent_id
  from public.public_listings pl
  join public.comarketing_offers o on o.listing_id = pl.id
  join public.comarketing_engagements e on e.offer_id = o.id
  where e.status = 'active'
    and o.status in ('active', 'paused');
    -- 'paused' included on purpose: pausing an offer closes it to NEW pickups,
    -- it does not retract the listing from agents already marketing it. Pulling
    -- their page out from under them would break §4.2.

comment on view public.public_agent_listings is
  'Listings shown on /agent/<slug>: the agent''s own plus those they market under co-marketing. Carries no own/borrowed flag. Note this does not make the relationship secret — the same listing appears on both agents'' pages — it keeps commission terms and floor prices out of reach, which is the actual promise.';

-- -----------------------------------------------------------------------------
-- Grants. Supabase''s defaults hand anon ALL on new views; this schema has had
-- to undo that five times now, so it is always explicit.
-- -----------------------------------------------------------------------------

revoke all on public.public_agent_profiles from anon, authenticated;
revoke all on public.public_agent_listings from anon, authenticated;

grant select on public.public_agent_profiles to anon, authenticated;
grant select on public.public_agent_listings to anon, authenticated;
