-- =============================================================================
-- 00049 — The identity flag leaked around itself
--
-- 00048 hides the group's branding in both apps and exposes the flag through a
-- deliberately narrow view, `public_platform_identity`, so that anon reads one
-- boolean and nothing else.
--
-- It was one boolean and everything else. 00001 created `brand public read`,
-- a SELECT policy on brand_settings granted to {anon, authenticated}, back when
-- the public app was expected to read brand values straight from the table. So
-- with the affiliation switched OFF, anyone could still call the REST endpoint
-- and read:
--
--     company_name  = 'IQI AG'
--     app_name      = 'IQI AG MatchHub'
--
-- along with support_email, support_phone, social_links and updated_by (a user
-- id). Found by testing the anon boundary after building the flag, not by
-- reading the migration — the UI was correctly neutral the whole time, which is
-- exactly why this class of leak survives review.
--
-- The public app reads only `public_*` views (repo hard rule 1), so no anon
-- caller needs this table. Authenticated keeps its read: the hub renders brand
-- values on every page.
-- =============================================================================

drop policy if exists "brand public read" on public.brand_settings;

create policy "brand settings authenticated read" on public.brand_settings
  for select to authenticated
  using (true);

-- The policy alone is not enough: PostgreSQL checks the table GRANT first, and
-- Supabase's defaults hand anon SELECT. Both have to go.
revoke all on public.brand_settings from anon;

-- The one thing the public genuinely needs stays available, through the view
-- that exposes a single column.
grant select on public.public_platform_identity to anon;
