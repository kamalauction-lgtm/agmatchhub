-- =============================================================================
-- 00125 — admins create and edit agencies (P1-g-1, Commercial and Growth, screen 11)
--
-- Approved remainder of screen 11: "create and edit agencies". Agencies were
-- readable by every signed-in user and writable by nobody (seeded or created
-- by the service role), so an admin could not add the organisation an agent
-- belongs to.
--
--   · insert / update: commercial.manage IN the agency's country — a
--     country-scoped admin manages their own country's organisations only,
--     and an agency must have a country (D8: no assumed market);
--   · no delete: agencies carry commercial policies and memberships; retiring
--     one is a policy change, not a row removal;
--   · reads are unchanged.
-- No policy subqueries agencies itself (hard rule 4).
--
-- Rollback: drop the two policies.
-- =============================================================================

drop policy if exists "agencies admin insert" on public.agencies;
create policy "agencies admin insert" on public.agencies
  for insert to authenticated
  with check (country_code is not null and public.has_capability_in('commercial.manage', country_code));

drop policy if exists "agencies admin update" on public.agencies;
create policy "agencies admin update" on public.agencies
  for update to authenticated
  using (public.has_capability_in('commercial.manage', country_code))
  with check (country_code is not null and public.has_capability_in('commercial.manage', country_code));
