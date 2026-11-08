-- =============================================================================
-- 00074 — Mark the counters nothing writes
--
-- `listings.view_count` and `listings.save_count` exist, are exposed on
-- `public_listings`, and are never incremented by anything. The only view
-- counter in this codebase is `increment_presentation_view()` from 00013,
-- which counts MatchHub client presentations — a different table entirely.
--
-- WHY THIS IS WORSE THAN A MISSING COLUMN
--   A missing column stops you. A column that is present, plumbed all the way
--   through to the public API, and permanently zero invites somebody to build
--   a "Total Views" card on it — and that card will read 0 forever while
--   looking exactly like a working one. It nearly happened while building the
--   agent dashboard.
--
-- These comments are the cheapest possible guard: anyone who inspects the
-- schema, generates types, or asks the database what a column means gets told
-- before they wire it to a screen.
--
-- The fix, when someone wants real view counts, is a write path — the public
-- site holds no service-role key (hard rule 1), so it needs a rate-limited
-- SECURITY DEFINER function granted to anon, with per-session deduplication so
-- a refresh does not inflate the number. That is a feature, not a column.
-- =============================================================================

comment on column public.listings.view_count is
  'NOT IMPLEMENTED. Nothing increments this; it is 0 on every row. Do not surface it as a metric until a write path exists (see migration 00074).';

comment on column public.listings.save_count is
  'NOT IMPLEMENTED. Nothing increments this; it is 0 on every row. Do not surface it as a metric until saving is built (see migration 00074).';
