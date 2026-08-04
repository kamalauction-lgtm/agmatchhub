-- =============================================================================
-- 00026 — Rent period (monthly/yearly) + open RA editing with edit log (§9)
-- =============================================================================

alter table public.property_requests
  add column rent_period text not null default 'monthly'
    check (rent_period in ('monthly','yearly'));

alter table public.property_submissions
  add column rent_period text not null default 'monthly'
    check (rent_period in ('monthly','yearly'));

-- ---------------------------------------------------------------------------
-- Edit log: visible history of requirement changes (§9 "full edit history").
-- Readable by the owning RA, agents who submitted to the request, and admins.
-- ---------------------------------------------------------------------------

create table public.request_edit_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.property_requests(id) on delete cascade,
  edited_by uuid not null references public.profiles(id),
  changes jsonb not null,          -- { field: { from, to } } — form fields only
  created_at timestamptz not null default now()
);
create index idx_request_edit_log on public.request_edit_log (request_id, created_at desc);

alter table public.request_edit_log enable row level security;
create policy "edit log visibility" on public.request_edit_log
  for select to authenticated
  using (
    public.owns_request(request_id)
    or public.is_platform_admin()
    or exists (select 1 from public.property_submissions s
               where s.request_id = request_edit_log.request_id
                 and s.supply_agent_id = auth.uid())
  );
create policy "edit log ra insert" on public.request_edit_log
  for insert to authenticated
  with check (edited_by = auth.uid() and public.owns_request(request_id));
-- immutable: no update/delete policies

-- ---------------------------------------------------------------------------
-- RA may now edit at (almost) any stage; admin-owned fields are guarded by a
-- trigger (policies can't do column-level checks without self-reference).
-- ---------------------------------------------------------------------------

drop policy "requests own update" on public.property_requests;

create policy "requests own update" on public.property_requests
  for update to authenticated
  using (
    requesting_agent_id = auth.uid()
    and status not in ('cancelled','archived','frozen','successfully_closed')
  )
  with check (requesting_agent_id = auth.uid());

create or replace function public.guard_request_admin_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    if new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.amendment_reason is distinct from old.amendment_reason
       or new.human_readable_id is distinct from old.human_readable_id
       or new.requesting_agent_id is distinct from old.requesting_agent_id then
      raise exception 'admin fields are read-only';
    end if;
  end if;
  return new;
end $$;

create trigger trg_guard_request_admin_fields
  before update on public.property_requests
  for each row execute function public.guard_request_admin_fields();
