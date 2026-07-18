-- =============================================================================
-- 00016 — Violation reports & governance · spec §32–33
-- Reporter + admin see the report; the REPORTED user does not. Admin-only
-- working notes live in a companion table (column-privacy pattern).
-- =============================================================================

create table public.violation_reports (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,          -- RPT-2026-000001
  submission_id uuid references public.property_submissions(id) on delete set null,
  request_id uuid references public.property_requests(id) on delete set null,
  reporter_id uuid not null references public.profiles(id),
  reported_user_id uuid references public.profiles(id),
  category text not null check (category in
    ('client_bypass','agent_bypass','false_information','unauthorised_listing',
     'incorrect_price','property_unavailable','misleading_images','fraud_suspicion',
     'confidentiality_breach','harassment','commission_dispute','appointment_dispute',
     'duplicate_listing','inappropriate_content','other')),
  description text not null,
  priority text not null default 'normal' check (priority in ('normal','high')),
  status text not null default 'submitted' check (status in
    ('submitted','under_review','additional_evidence_required','user_contacted',
     'account_restricted','resolved','rejected','escalated','archived')),
  resolution text,                                  -- shared with the reporter when set
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_violation_reports_updated before update on public.violation_reports
  for each row execute function public.set_updated_at();
create index idx_violation_reports_status on public.violation_reports (status, created_at desc);

create table public.violation_report_admin (
  report_id uuid primary key references public.violation_reports(id) on delete cascade,
  assigned_admin uuid references public.profiles(id),
  internal_notes text,
  updated_at timestamptz not null default now()
);
create trigger trg_violation_report_admin_updated before update on public.violation_report_admin
  for each row execute function public.set_updated_at();

alter table public.violation_reports enable row level security;
alter table public.violation_report_admin enable row level security;

create policy "reports reporter read" on public.violation_reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_platform_admin());

create policy "reports participant insert" on public.violation_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and (submission_id is null or public.is_submission_participant(submission_id))
  );

create policy "reports admin update" on public.violation_reports
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "report admin notes" on public.violation_report_admin
  for select to authenticated using (public.is_platform_admin());
create policy "report admin notes write" on public.violation_report_admin
  for insert to authenticated with check (public.is_platform_admin());
create policy "report admin notes update" on public.violation_report_admin
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
