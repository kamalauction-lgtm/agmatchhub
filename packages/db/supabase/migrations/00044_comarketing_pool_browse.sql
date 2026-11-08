-- =============================================================================
-- 00044 — Make the pool browsable, and make a pickup trustworthy
--
-- Two gaps, found while building the pool screen against the existing schema.
--
-- GAP 1 — the same bug 00041 fixed, one audience earlier.
--   00040 lets any verified agent SELECT an open-pool offer row. 00041 then
--   granted read access to the listing, property, media and listing-agent name
--   — but only to agents with an ACTIVE ENGAGEMENT. A browsing agent has no
--   engagement yet, by definition. So the pool screen would render offer rows
--   with no title, no price, no photo and no agent name: precisely the empty
--   cards 00041 was written to fix, for the audience that comes first.
--
-- GAP 2 — the pickup insert is unguarded.
--   "comarketing engagements agent insert" checks only that the row is the
--   agent's own and that they are verified. It does not check that the offer
--   is in the open pool, and it cannot check `accepted_terms`, because a
--   policy compares against values the CLIENT supplies. As written, a verified
--   agent could pick up an `invite_only` offer, pick up a `withdrawn` one, pick
--   up their own listing, exceed the listing agent's cap on marketing agents,
--   bypass `requires_la_approval` by inserting status 'active' directly, or
--   simply write `{"marketing_agent_share_pct": 90}` into their own accepted
--   terms snapshot. That last one defeats invariant §4.2, which is the whole
--   reason this module exists rather than being a copy of PropMall.
--
--   Fixed with a BEFORE INSERT trigger that overwrites every term-bearing
--   column from the server's copy of the offer, plus a tightened policy.
--
-- What stays invisible to a browser, deliberately: property_private (exact
-- address, owner identity, minimum sale price) and comarketing_offer_private
-- (advertised-price floor, internal notes). A marketing agent markets the
-- property; they do not inherit the listing agent's confidences.
--
-- Every helper is SECURITY DEFINER and none reads the table whose policy calls
-- it — the rule four 42P17 incidents taught us. The guard trigger is SECURITY
-- INVOKER — the rule 00039 taught us.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

/**
 * Is the current user a verified agent?
 *
 * Reads `profiles`, so it is safe to call from policies on listings,
 * properties, listing_media and comarketing_offers — but NOT from a policy on
 * profiles itself. 00040 inlines this same subquery; naming it stops the next
 * policy from inlining it a third time.
 */
create or replace function public.is_verified_agent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.agent_status = 'verified'
  );
$$;

/** Is this offer live in the open pool right now? */
create or replace function public.is_open_pool_offer(p_offer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.comarketing_offers o
    where o.id = p_offer_id
      and o.status = 'active'
      and o.scope = 'open_pool'
      and (o.expires_at is null or o.expires_at > now())
  );
$$;

/** Does a live open-pool offer exist for this listing? */
create or replace function public.listing_in_open_pool(p_listing_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.comarketing_offers o
    where o.listing_id = p_listing_id
      and o.status = 'active'
      and o.scope = 'open_pool'
      and (o.expires_at is null or o.expires_at > now())
  );
$$;

/** Same, resolved through the property. */
create or replace function public.property_in_open_pool(p_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.comarketing_offers o
    join public.listings l on l.id = o.listing_id
    where l.property_id = p_property_id
      and o.status = 'active'
      and o.scope = 'open_pool'
      and (o.expires_at is null or o.expires_at > now())
  );
$$;

/**
 * Does p_user_id have anything live in the open pool?
 *
 * Called from a policy on `profiles`, so unlike is_verified_agent() it must not
 * read `profiles`. It does not — comarketing_offers.listing_agent_id suffices.
 * The browsing agent's own verification is therefore not checked here; the
 * worst case is that an unverified account learns the display name of an agent
 * who has published an offer, which is a name the public marketplace shows
 * anyway.
 */
create or replace function public.is_open_pool_lister(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.comarketing_offers o
    where o.listing_agent_id = p_user_id
      and o.status = 'active'
      and o.scope = 'open_pool'
      and (o.expires_at is null or o.expires_at > now())
  );
$$;

-- -----------------------------------------------------------------------------
-- GAP 1 — browse grants on the facts a pool card must show
-- -----------------------------------------------------------------------------

create policy "listings pool browse" on public.listings
  for select to authenticated
  using (public.is_verified_agent() and public.listing_in_open_pool(id));

create policy "properties pool browse" on public.properties
  for select to authenticated
  using (public.is_verified_agent() and public.property_in_open_pool(id));

create policy "listing media pool browse" on public.listing_media
  for select to authenticated
  using (public.is_verified_agent() and public.listing_in_open_pool(listing_id));

create policy "profiles pool lister read" on public.profiles
  for select to authenticated
  using (public.is_open_pool_lister(id));

-- -----------------------------------------------------------------------------
-- GAP 2 — a pickup states nothing the server does not verify
-- -----------------------------------------------------------------------------

/**
 * Everything about a pickup the client must not be trusted to state.
 *
 * Named guard_comarketing_PICKUP, not ..._engagement: 00040 already owns that
 * name for the BEFORE UPDATE guard, and `create or replace function` would
 * have silently swapped its body for this one — leaving an insert guard on an
 * update trigger, free to rewrite accepted_terms on every update. Caught only
 * because the trigger name collided too.
 *
 * SECURITY INVOKER, deliberately. In a SECURITY DEFINER function `current_user`
 * is the function owner, which is how 00039's admin-only door came to admit
 * everyone. A guard must run as its caller.
 */
create or replace function public.guard_comarketing_pickup()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_offer public.comarketing_offers%rowtype;
  v_live  int;
begin
  select * into v_offer from public.comarketing_offers where id = new.offer_id;
  if not found then
    raise exception 'offer not found';
  end if;

  if v_offer.status <> 'active'
     or v_offer.scope <> 'open_pool'
     or (v_offer.expires_at is not null and v_offer.expires_at <= now()) then
    raise exception 'this listing is no longer available for co-marketing';
  end if;

  -- Marketing your own listing to yourself is not co-marketing.
  if v_offer.listing_agent_id = new.marketing_agent_id then
    raise exception 'the listing agent cannot pick up their own offer';
  end if;

  -- No chain borrowing (§4.7). guard_comarketing_offer() checks this when the
  -- offer is published; re-checking closes the window where the listing
  -- changed hands between publication and this pickup.
  if not exists (
    select 1 from public.listings l
    where l.id = v_offer.listing_id and l.agent_id = v_offer.listing_agent_id
  ) then
    raise exception 'this listing has changed hands; the offer is no longer valid';
  end if;

  -- One live engagement per agent per offer.
  if exists (
    select 1 from public.comarketing_engagements e
    where e.offer_id = new.offer_id
      and e.marketing_agent_id = new.marketing_agent_id
      and e.status in ('pending', 'active', 'paused')
  ) then
    raise exception 'you have already picked up this listing';
  end if;

  -- The listing agent's cap on how many agents may market this property.
  if v_offer.max_marketing_agents is not null then
    select count(*) into v_live
    from public.comarketing_engagements e
    where e.offer_id = new.offer_id and e.status in ('pending', 'active');
    if v_live >= v_offer.max_marketing_agents then
      raise exception 'this listing has reached its limit of marketing agents';
    end if;
  end if;

  -- Invariant §4.2. The snapshot is taken from the server's copy of the offer,
  -- never from the client, so an agent accepts exactly the terms in force at
  -- pickup and cannot author their own share.
  new.accepted_terms_version := v_offer.terms_version;
  new.accepted_terms := jsonb_build_object(
    'terms_version',             v_offer.terms_version,
    'commission_basis',          v_offer.commission_basis,
    'total_commission_pct',      v_offer.total_commission_pct,
    'total_commission_amount',   v_offer.total_commission_amount,
    'marketing_agent_share_pct', v_offer.marketing_agent_share_pct,
    'payer',                     v_offer.payer,
    'allow_price_display',       v_offer.allow_price_display,
    'notes',                     v_offer.notes
  );
  new.accepted_at := now();

  -- Approval mode is the listing agent's to set, not the picker's to declare.
  new.status := case when v_offer.requires_la_approval then 'pending' else 'active' end;
  new.end_reason := null;

  return new;
end;
$$;

create trigger trg_guard_comarketing_pickup
  before insert on public.comarketing_engagements
  for each row execute function public.guard_comarketing_pickup();

-- The policy still cannot see `accepted_terms`, but it can refuse a pickup on
-- an offer that is not in the pool before the trigger ever runs.
drop policy if exists "comarketing engagements agent insert" on public.comarketing_engagements;
create policy "comarketing engagements agent insert" on public.comarketing_engagements
  for insert to authenticated
  with check (
    marketing_agent_id = auth.uid()
    and public.is_verified_agent()
    and public.is_open_pool_offer(offer_id)
  );

-- -----------------------------------------------------------------------------
-- Grants. Supabase's defaults hand `anon` more than intended; this is the
-- fourth time that has needed undoing, so it is done explicitly every time.
-- -----------------------------------------------------------------------------

revoke all on public.comarketing_offers from anon;
revoke all on public.comarketing_offer_private from anon;
revoke all on public.comarketing_engagements from anon;
