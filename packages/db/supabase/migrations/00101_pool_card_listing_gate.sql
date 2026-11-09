-- =============================================================================
-- 00101 — Pool cards show only published, approved listings
--
-- Review of 00099 found that pool_offer_cards did not check the listing's
-- status or moderation. A rejected, flagged, draft or archived listing with a
-- live open-pool offer still appeared as a pool card. The public views use the
-- same gate (status = 'published' and moderation_state = 'approved'); the pool
-- now does too.
--
-- The view is also marked security_barrier, so a user-supplied function in a
-- caller's filter cannot run before the WHERE clause that enforces this gate.
--
-- Same columns and order as 00099, so the page needs no change. Staging first.
-- =============================================================================

create or replace view public.pool_offer_cards
  with (security_invoker = false, security_barrier = true) as
select
  o.id                       as offer_id,
  o.human_readable_id        as offer_human_readable_id,
  o.listing_agent_id,
  pr.display_name            as listing_agent_display_name,
  o.total_commission_pct,
  o.marketing_agent_share_pct,
  o.payer,
  o.requires_la_approval,
  o.max_marketing_agents,
  o.notes,
  o.created_at,
  o.expires_at,
  l.id                       as listing_id,
  l.human_readable_id        as listing_human_readable_id,
  l.title,
  l.listing_type,
  l.price,
  l.currency,
  l.rent_period,
  p.property_type,
  p.property_category,
  p.province_name,
  p.regency_name,
  p.bedrooms,
  p.bathrooms,
  p.building_size,
  p.land_size
from public.comarketing_offers o
join public.listings l       on l.id = o.listing_id
join public.properties p     on p.id = l.property_id
left join public.profiles pr on pr.id = o.listing_agent_id
where o.status = 'active'
  and o.scope = 'open_pool'
  and (o.expires_at is null or o.expires_at > now())
  and l.status = 'published'
  and l.moderation_state = 'approved'
  and public.is_verified_agent();

-- Grants are unchanged from 00099 (revoked from anon, granted to authenticated).
