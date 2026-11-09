-- =============================================================================
-- 00102 — Browsers no longer read comarketing_offers directly
--
-- 00040 gave every verified agent a select on every live open-pool offer row,
-- including created_by, total_commission_amount, commission_basis,
-- allow_price_display and terms_version. Browsers only need the card columns,
-- and pool_offer_cards (00099/00101) already serves those.
--
-- This drops that policy. Engaged agents keep their read via
-- "comarketing offers engaged read" (00041), and listing agents via
-- "comarketing offers owner" (00040).
--
-- The pickup guard reads the offer as the PICKER, before any engagement
-- exists, so it would lose the row. It now reads through
-- pool_offer_for_pickup(), a SECURITY DEFINER function that returns the offer
-- only to a verified agent. The rest of the guard is unchanged.
--
-- Staging first.
-- =============================================================================

drop policy if exists "comarketing offers pool read" on public.comarketing_offers;

create or replace function public.pool_offer_for_pickup(p_offer_id uuid)
returns setof public.comarketing_offers
language sql stable security definer set search_path = public as $$
  select o.* from public.comarketing_offers o
  where o.id = p_offer_id
    and public.is_verified_agent();
$$;

revoke all on function public.pool_offer_for_pickup(uuid) from public, anon;
grant execute on function public.pool_offer_for_pickup(uuid) to authenticated;

create or replace function public.guard_comarketing_pickup()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_offer public.comarketing_offers%rowtype;
  v_live  int;
begin
  select * into v_offer from public.pool_offer_for_pickup(new.offer_id);
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
