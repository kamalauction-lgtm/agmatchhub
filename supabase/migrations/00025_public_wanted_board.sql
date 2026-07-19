-- =============================================================================
-- 00025 — Public "Wanted Properties" board (§13 requirement visibility).
-- Requirements marked public appear on /wanted as teaser cards and their
-- request links open without the access code (login + verification is still
-- required to view sensitive detail and submit). RA controls the flag.
-- =============================================================================

alter table public.property_requests
  add column public_listing boolean not null default true;
