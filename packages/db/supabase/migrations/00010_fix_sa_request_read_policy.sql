-- =============================================================================
-- 00010 — Fix 00008: unqualified `id` in the subquery bound to the
-- property_submissions alias (s.request_id = s.id → never true).
-- Qualify with the outer table so the SA can actually read requests they
-- submitted to.
-- =============================================================================

drop policy "requests sa with submission read" on public.property_requests;

create policy "requests sa with submission read" on public.property_requests
  for select to authenticated
  using (
    exists (select 1 from public.property_submissions s
            where s.request_id = property_requests.id
              and s.supply_agent_id = auth.uid())
  );
