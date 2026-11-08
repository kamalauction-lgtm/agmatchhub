-- =============================================================================
-- 00011 — Move RA/admin confidential request fields out of property_requests.
-- An SA with a submission can read the request ROW (00010), and RLS cannot
-- hide columns — so internal_notes / admin_notes move to a companion table
-- visible only to the owning RA + admins (§13 Internal Information).
-- =============================================================================

create table public.property_request_private (
  request_id uuid primary key references public.property_requests(id) on delete cascade,
  internal_notes text,
  admin_notes text,
  updated_at timestamptz not null default now()
);
create trigger trg_request_private_updated before update on public.property_request_private
  for each row execute function public.set_updated_at();

alter table public.property_request_private enable row level security;

create policy "request private owner read" on public.property_request_private
  for select to authenticated
  using (public.owns_request(request_id) or public.is_platform_admin());
create policy "request private owner insert" on public.property_request_private
  for insert to authenticated
  with check (public.owns_request(request_id) or public.is_platform_admin());
create policy "request private owner update" on public.property_request_private
  for update to authenticated
  using (public.owns_request(request_id) or public.is_platform_admin())
  with check (public.owns_request(request_id) or public.is_platform_admin());

-- Migrate existing data
insert into public.property_request_private (request_id, internal_notes, admin_notes)
select id, internal_notes, admin_notes
from public.property_requests
where internal_notes is not null or admin_notes is not null;

-- The own-update policy guards admin_notes (column is being dropped) — recreate
drop policy "requests own update" on public.property_requests;

alter table public.property_requests drop column internal_notes;
alter table public.property_requests drop column admin_notes;

create policy "requests own update" on public.property_requests
  for update to authenticated
  using (
    requesting_agent_id = auth.uid()
    and status in ('draft','amendment_required')
  )
  with check (
    requesting_agent_id = auth.uid()
    and status in ('draft','pending_admin_approval','resubmitted','cancelled')
    and approved_by is null and approved_at is null
  );
