-- =============================================================================
-- 00037 — listing_status_history: let moderators write the history they make
--
-- The same failure class as 00034, caught the same way (E2E, not review):
-- 00030 gave the history tables SELECT-only policies, so the moderation
-- action's history insert was silently swallowed by RLS while the status
-- change itself succeeded. Rule 6 in packages/db/README.md exists because of
-- exactly this — and it still happened again one migration later. The
-- companion fix in the app layer is that these inserts now check their error
-- instead of firing and forgetting.
-- =============================================================================

create policy "listing status history admin insert" on public.listing_status_history
  for insert to authenticated
  with check (
    changed_by = auth.uid()
    and public.is_platform_admin()
  );

-- Price history will need an owner-insert policy when agents can edit a
-- published price; deliberately not added until that feature exists.
