-- =============================================================================
-- 00032 — Lock the public views to SELECT
--
-- Found by verifying 00031 on staging rather than by reading it: `grant select
-- on ... to anon` in 00031 was redundant, because Supabase's default privileges
-- had ALREADY granted anon INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and
-- TRIGGER on those views the moment they were created. Granting SELECT does not
-- remove the rest.
--
-- Today this is latent rather than exploitable: all three views join several
-- tables, so PostgreSQL reports is_updatable = NO and any write fails. But the
-- views are SECURITY DEFINER — they see through RLS by design — so the safety
-- currently rests on an accident of view shape. The day someone simplifies one
-- of them to a single table to make a query faster, it becomes auto-updatable
-- and anonymous writes start flowing straight past every policy in the
-- database, silently and with no error to notice.
--
-- So: revoke everything, then grant back only SELECT. Any future public view
-- must do the same. Never rely on a view being too complicated to write to.
-- =============================================================================

revoke all on public.public_listings from anon, authenticated;
revoke all on public.public_listing_media from anon, authenticated;
revoke all on public.public_agent_profiles from anon, authenticated;

grant select on public.public_listings to anon, authenticated;
grant select on public.public_listing_media to anon, authenticated;
grant select on public.public_agent_profiles to anon, authenticated;
