-- =============================================================================
-- 00099 — Pool cards through a projection, not table-wide browse grants
--
-- Migration 00044 (gap 1) let every verified agent with a live open-pool offer
-- read the WHOLE listings, properties and listing_media rows for that offer.
-- RLS filters rows, not columns, so a browser could read every column on those
-- rows — including moderation_reason, created_by, agency_id and moderated_by —
-- which breaks hard rules 1 and 2 (confidentiality by projection).
--
-- This migration:
--   1. drops those three table-wide pool-browse policies;
--   2. serves the pool through pool_offer_cards, a view that returns only the
--      columns a pool card shows, and only for verified agents on live
--      open-pool offers.
--
-- Agents who have picked up an offer keep full access to that listing through
-- the engagement-based policies in 00041 (listings / properties / listing_media
-- comarketing read). Nothing about the pickup path changes.
--
-- The view runs with the owner's privileges, like public_listings (00031), so
-- it can read the base tables without the dropped policies. The WHERE clause
-- is the only gate: a non-verified caller gets zero rows.
--
-- Staging first (rule 10). Do not apply to production until the RLS suite
-- passes on staging.
-- =============================================================================

drop policy if exists "listings pool browse" on public.listings;
drop policy if exists "properties pool browse" on public.properties;
drop policy if exists "listing media pool browse" on public.listing_media;

create or replace view public.pool_offer_cards with (security_invoker = false) as
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
join public.listings l      on l.id = o.listing_id
join public.properties p    on p.id = l.property_id
left join public.profiles pr on pr.id = o.listing_agent_id
where o.status = 'active'
  and o.scope = 'open_pool'
  and (o.expires_at is null or o.expires_at > now())
  and public.is_verified_agent();

revoke all on public.pool_offer_cards from anon;
grant select on public.pool_offer_cards to authenticated;

comment on view public.pool_offer_cards is
  'Pool card projection (00099). Columns a browsing verified agent may see for a live open-pool offer. Never add listings.moderation_*, created_by, agency_id, or any *_private data here.';

