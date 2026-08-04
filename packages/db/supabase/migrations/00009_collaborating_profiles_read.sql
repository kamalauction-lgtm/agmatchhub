-- =============================================================================
-- 00009 — Collaborating agents may read each other's basic profile (§71):
-- the RA sees the SA who submitted to their request, and the SA sees the RA
-- of a request they submitted to. Clients still never reach profiles at all.
-- =============================================================================

create policy "profiles collaborator read" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.property_submissions s
      join public.property_requests r on r.id = s.request_id
      where (s.supply_agent_id = profiles.id and r.requesting_agent_id = auth.uid())
         or (r.requesting_agent_id = profiles.id and s.supply_agent_id = auth.uid())
    )
  );
