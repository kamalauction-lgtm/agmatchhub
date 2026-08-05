-- =============================================================================
-- 00041 — A marketing agent must be able to READ what they are marketing
--
-- Found by rendering the borrowed-listings view: the cards appeared but every
-- field was empty. 00040 created engagements without granting the marketing
-- agent read access to the listing, the property, its photos, or the listing
-- agent's name — so an agent could borrow a property and see nothing about
-- it. Correct by default (nothing leaked), useless in practice.
--
-- The grant is deliberately narrow. An active engagement lets the marketing
-- agent read the FACTS they need to market the property, and nothing else:
--   - the listing and its public property fields
--   - the media
--   - the listing agent's display name
-- It does NOT reach property_private (exact address, owner identity, minimum
-- price) or comarketing_offer_private (the floor price, internal notes).
-- Those stay with the listing agent, exactly as MatchHub keeps supply-agent
-- confidences from the requesting agent.
--
-- Every helper is SECURITY DEFINER and none of them reads the table whose
-- policy calls it — the rule four 42P17 incidents taught us.
-- =============================================================================

/** Does the current user market this listing under an active engagement? */
create or replace function public.is_comarketing_agent_for_listing(p_listing_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.comarketing_engagements e
    join public.comarketing_offers o on o.id = e.offer_id
    where e.marketing_agent_id = auth.uid()
      and e.status = 'active'
      and o.listing_id = p_listing_id
  );
$$;

/** Same, resolved through the property rather than the listing. */
create or replace function public.is_comarketing_agent_for_property(p_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.comarketing_engagements e
    join public.comarketing_offers o on o.id = e.offer_id
    join public.listings l on l.id = o.listing_id
    where e.marketing_agent_id = auth.uid()
      and e.status = 'active'
      and l.property_id = p_property_id
  );
$$;

/**
 * Is there a live co-marketing relationship between the current user and
 * p_user_id, in either direction? Mirrors is_collaborating_with() from 00022,
 * and like it, must never read `profiles` — it is called from a profiles
 * policy.
 */
create or replace function public.has_comarketing_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.comarketing_engagements e
    join public.comarketing_offers o on o.id = e.offer_id
    where e.status = 'active'
      and (
        (e.marketing_agent_id = auth.uid() and o.listing_agent_id = p_user_id)
        or (o.listing_agent_id = auth.uid() and e.marketing_agent_id = p_user_id)
      )
  );
$$;

/** The marketing agent keeps sight of the offer even if it is later paused. */
create or replace function public.is_engaged_marketing_agent(p_offer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.comarketing_engagements e
    where e.offer_id = p_offer_id
      and e.marketing_agent_id = auth.uid()
      and e.status in ('active', 'pending', 'paused')
  );
$$;

-- -----------------------------------------------------------------------------
-- Read grants
-- -----------------------------------------------------------------------------
create policy "listings comarketing read" on public.listings
  for select to authenticated
  using (public.is_comarketing_agent_for_listing(id));

create policy "properties comarketing read" on public.properties
  for select to authenticated
  using (public.is_comarketing_agent_for_property(id));

create policy "listing media comarketing read" on public.listing_media
  for select to authenticated
  using (public.is_comarketing_agent_for_listing(listing_id));

create policy "profiles comarketing read" on public.profiles
  for select to authenticated
  using (public.has_comarketing_with(id));

create policy "comarketing offers engaged read" on public.comarketing_offers
  for select to authenticated
  using (public.is_engaged_marketing_agent(id));

-- Note what is absent, on purpose: no policy is added to property_private or
-- comarketing_offer_private. A marketing agent markets the property; they do
-- not inherit the listing agent's confidences.
