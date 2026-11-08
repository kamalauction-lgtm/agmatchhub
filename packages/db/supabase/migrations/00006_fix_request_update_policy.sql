-- =============================================================================
-- 00006 — Fix "requests own update" policy: the admin_notes guard used an
-- unqualified `id` inside the subquery, which resolves to the subquery's own
-- alias (always true → multi-row subquery error). Qualify with the outer row.
-- =============================================================================

drop policy "requests own update" on public.property_requests;

create policy "requests own update" on public.property_requests
  for update to authenticated
  using (
    requesting_agent_id = auth.uid()
    and status in ('draft','amendment_required')
  )
  with check (
    requesting_agent_id = auth.uid()
    and status in ('draft','pending_admin_approval','resubmitted','cancelled')
    and admin_notes is not distinct from
      (select r.admin_notes from public.property_requests r
       where r.id = property_requests.id)
    and approved_by is null and approved_at is null
  );
