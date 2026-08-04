-- =============================================================================
-- 00005 — Property requirements + secure request links · spec §13–15
-- =============================================================================

create table public.property_requests (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,           -- REQ-2026-000001 (display only)
  requesting_agent_id uuid not null references public.profiles(id),

  -- General (§13)
  title text not null,
  description text,
  transaction_type text not null check (transaction_type in ('buy','rent')),
  property_category text not null check (property_category in
    ('residential','commercial','industrial','land','other')),
  client_type text not null default 'individual' check (client_type in
    ('individual','company','organisation')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  submission_deadline date,
  expiry_date date,

  -- Location
  country_code text not null references public.countries(code),
  state_region text,
  city text not null,
  district text,
  preferred_areas text[] not null default '{}',
  alternative_areas text[] not null default '{}',

  -- Financial (numeric — never floats, §36)
  currency text not null references public.currencies(code),
  budget_min numeric(14,2),
  budget_max numeric(14,2),
  max_monthly_rent numeric(14,2),
  lease_term_months int,
  financing text check (financing in ('cash','financing','pre_approved','undecided')),

  -- Property requirements
  property_type text,
  measurement_unit text not null default 'sqft' check (measurement_unit in ('sqft','sqm')),
  min_built_up numeric(12,2),
  max_built_up numeric(12,2),
  bedrooms_min int,
  bathrooms_min int,
  car_parks_min int,
  furnishing text check (furnishing in ('any','unfurnished','partially','fully')),
  tenure_preference text,
  commercial_details jsonb not null default '{}'::jsonb,
  other_requirements text,

  -- Client profile (anonymised text is what Supply Agents may see, §13)
  client_profile_anonymised text,
  expected_move_in date,

  -- Internal (never exposed to Supply Agents)
  internal_notes text,
  admin_notes text,

  -- Workflow (§14)
  status text not null default 'draft' check (status in
    ('draft','pending_admin_approval','under_admin_review','amendment_required',
     'resubmitted','approved','link_ready','link_active','receiving_submissions',
     'reviewing_submissions','client_presentation_preparation','client_review',
     'viewing_stage','negotiation_stage','offer_stage','transaction_in_progress',
     'successfully_closed','unsuccessful','expired','cancelled','frozen','archived')),
  amendment_reason text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create trigger trg_property_requests_updated before update on public.property_requests
  for each row execute function public.set_updated_at();
create index idx_property_requests_agent on public.property_requests (requesting_agent_id, status);
create index idx_property_requests_status on public.property_requests (status);

alter table public.property_requests enable row level security;

create policy "requests own read" on public.property_requests
  for select to authenticated
  using (requesting_agent_id = auth.uid() or public.is_platform_admin());

create policy "requests verified agent insert" on public.property_requests
  for insert to authenticated
  with check (
    requesting_agent_id = auth.uid()
    and status = 'draft'
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.agent_status = 'verified')
  );

-- Agent may edit while draft / amendment_required; may submit or cancel.
create policy "requests own update" on public.property_requests
  for update to authenticated
  using (
    requesting_agent_id = auth.uid()
    and status in ('draft','amendment_required')
  )
  with check (
    requesting_agent_id = auth.uid()
    and status in ('draft','pending_admin_approval','resubmitted','cancelled')
    and admin_notes is not distinct from (select r.admin_notes from public.property_requests r where r.id = id)
    and approved_by is null and approved_at is null
  );

create policy "requests admin update" on public.property_requests
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Request links (§15). Raw token/password are distribution secrets shared by
-- the RA outside the platform; they are RLS-guarded to the owning RA + admin
-- and never exposed to Supply Agents or the public API.
-- ---------------------------------------------------------------------------

create table public.request_links (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.property_requests(id) on delete cascade,
  token text not null unique,                 -- 192-bit base64url, non-sequential
  password text not null,                     -- shared access code (not a user credential)
  active boolean not null default true,
  expires_at timestamptz not null,
  max_access_count int,
  access_count int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_request_links_updated before update on public.request_links
  for each row execute function public.set_updated_at();
create index idx_request_links_request on public.request_links (request_id);

alter table public.request_links enable row level security;

create policy "links owner read" on public.request_links
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.property_requests r
               where r.id = request_id and r.requesting_agent_id = auth.uid())
  );
create policy "links admin write" on public.request_links
  for insert to authenticated with check (public.is_platform_admin());
create policy "links admin update" on public.request_links
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
-- token lookups from /r/[token] run via service client (server-only projection)

create table public.request_link_access_logs (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.request_links(id) on delete cascade,
  event text not null check (event in
    ('view','password_ok','password_fail','requirement_viewed','locked_out')),
  user_id uuid,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_link_logs_link on public.request_link_access_logs (link_id, created_at desc);

alter table public.request_link_access_logs enable row level security;
create policy "link logs owner read" on public.request_link_access_logs
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.request_links l
               join public.property_requests r on r.id = l.request_id
               where l.id = link_id and r.requesting_agent_id = auth.uid())
  );
-- inserts via service client only (public gate has no session)
