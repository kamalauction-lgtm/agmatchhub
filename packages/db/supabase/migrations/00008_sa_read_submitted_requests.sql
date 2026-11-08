-- =============================================================================
-- 00008 — A Supply Agent who has submitted to a request may read that request
-- (§10: view the requirement after authorisation). Internal notes stay
-- excluded by the SA-facing projections; this governs row access only.
-- =============================================================================

create policy "requests sa with submission read" on public.property_requests
  for select to authenticated
  using (
    exists (select 1 from public.property_submissions s
            where s.request_id = id and s.supply_agent_id = auth.uid())
  );
