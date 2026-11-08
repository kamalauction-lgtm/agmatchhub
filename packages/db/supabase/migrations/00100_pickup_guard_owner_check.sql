-- =============================================================================
-- 00100 — Pickup guard reads listing ownership through a definer helper
--
-- Applied after 00099. Kept as its own migration because 00099 is already on
-- staging; a new file is the only safe way to change the guard there.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pickup guard fix. guard_comarketing_pickup() (00044) is SECURITY INVOKER and
-- checks "the listing still belongs to the listing agent" by reading
-- public.listings as the picker. Removing the pool-browse policy made that read
-- return nothing for a browser, so every pickup would wrongly fail with
-- "this listing has changed hands". The check is moved into a SECURITY DEFINER
-- helper that reads only the one ownership fact. The rest of the guard is
-- unchanged.
-- -----------------------------------------------------------------------------

create or replace function public.listing_owned_by(p_listing_id uuid, p_agent_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.listings l
    where l.id = p_listing_id and l.agent_id = p_agent_id
  );
$$;

revoke all on function public.listing_owned_by(uuid, uuid) from public, anon;
grant execute on function public.listing_owned_by(uuid, uuid) to authenticated;

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

  -- No chain borrowing (§4.7), re-checked at pickup. Read through
  -- listing_owned_by() (SECURITY DEFINER) because the picker no longer has
  -- read access to the listing row (00099).
  if not public.listing_owned_by(v_offer.listing_id, v_offer.listing_agent_id) then
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
