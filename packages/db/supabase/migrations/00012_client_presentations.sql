-- =============================================================================
-- 00012 — Client presentations · spec §21–23
-- The client (buyer/tenant) is NOT a platform user: no session, no RLS path.
-- All client interaction flows through server-only code using the service
-- client after token + password-cookie validation, and every payload passes
-- the client-safe projection (never SA identity / commission / min price).
-- =============================================================================

create table public.client_presentations (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,          -- PRE-2026-000001
  request_id uuid not null references public.property_requests(id) on delete cascade,
  requesting_agent_id uuid not null references public.profiles(id),
  title text not null,
  client_display_name text,
  intro_message text,
  token text not null unique,                      -- 192-bit base64url
  password text not null,                          -- shared access code
  active boolean not null default true,
  expires_at timestamptz not null,
  allow_feedback boolean not null default true,
  allow_comparison boolean not null default true,
  allow_offer boolean not null default true,
  allow_viewing_request boolean not null default true,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_client_presentations_updated before update on public.client_presentations
  for each row execute function public.set_updated_at();
create index idx_presentations_request on public.client_presentations (request_id);

alter table public.client_presentations enable row level security;
create policy "presentations owner" on public.client_presentations
  for select to authenticated
  using (requesting_agent_id = auth.uid() or public.is_platform_admin());
create policy "presentations owner insert" on public.client_presentations
  for insert to authenticated
  with check (requesting_agent_id = auth.uid() and public.owns_request(request_id));
create policy "presentations owner update" on public.client_presentations
  for update to authenticated
  using (requesting_agent_id = auth.uid() or public.is_platform_admin());

create table public.client_presentation_properties (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.client_presentations(id) on delete cascade,
  submission_id uuid not null references public.property_submissions(id),
  position int not null default 0,
  custom_note text,                                -- RA's client-safe note (§21)
  created_at timestamptz not null default now(),
  unique (presentation_id, submission_id)
);
create index idx_presentation_props on public.client_presentation_properties (presentation_id, position);

alter table public.client_presentation_properties enable row level security;
create policy "presentation props owner" on public.client_presentation_properties
  for select to authenticated
  using (exists (select 1 from public.client_presentations p
         where p.id = presentation_id
           and (p.requesting_agent_id = auth.uid() or public.is_platform_admin())));
create policy "presentation props owner insert" on public.client_presentation_properties
  for insert to authenticated
  with check (exists (select 1 from public.client_presentations p
              where p.id = presentation_id and p.requesting_agent_id = auth.uid()));
create policy "presentation props owner delete" on public.client_presentation_properties
  for delete to authenticated
  using (exists (select 1 from public.client_presentations p
         where p.id = presentation_id and p.requesting_agent_id = auth.uid()));

create table public.client_access_logs (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.client_presentations(id) on delete cascade,
  event text not null check (event in ('view','password_ok','password_fail','locked_out')),
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_client_access_logs on public.client_access_logs (presentation_id, created_at desc);

alter table public.client_access_logs enable row level security;
create policy "client logs owner read" on public.client_access_logs
  for select to authenticated
  using (exists (select 1 from public.client_presentations p
         where p.id = presentation_id
           and (p.requesting_agent_id = auth.uid() or public.is_platform_admin())));
-- inserts via service client only

create table public.client_feedback (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.client_presentations(id) on delete cascade,
  presentation_property_id uuid references public.client_presentation_properties(id) on delete cascade,
  kind text not null check (kind in
    ('shortlist','not_interested','rank','question','offer_suggestion',
     'viewing_request','comment')),
  rank_value text check (rank_value in ('first','second','third','maybe')),
  message text,
  offer_amount numeric(14,2),
  preferred_date date,
  created_at timestamptz not null default now()
);
create index idx_client_feedback on public.client_feedback (presentation_id, created_at desc);

alter table public.client_feedback enable row level security;
create policy "client feedback owner read" on public.client_feedback
  for select to authenticated
  using (exists (select 1 from public.client_presentations p
         where p.id = presentation_id
           and (p.requesting_agent_id = auth.uid() or public.is_platform_admin())));
-- inserts via service client only (client has no DB identity)
