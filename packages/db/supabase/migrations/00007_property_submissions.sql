-- =============================================================================
-- 00007 — Property submissions · spec §16–20
-- Visibility: SA sees own submissions only (never competitors); RA sees all
-- submissions on own requests; SA-confidential data (minimum price, internal
-- remarks, source identities) lives in separate SA+admin-only tables.
-- =============================================================================

create table public.property_submissions (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,           -- SUB-2026-000001
  request_id uuid not null references public.property_requests(id),
  supply_agent_id uuid not null references public.profiles(id),

  status text not null default 'submitted' check (status in
    ('draft','submitted','declaration_pending','under_review',
     'more_information_required','verification_pending','suitable','rejected',
     'shortlisted','approved_for_client','shared_with_client','client_viewed',
     'client_interested','client_not_interested','viewing_requested',
     'viewing_proposed','viewing_confirmed','viewing_completed','negotiation',
     'offer_submitted','counter_offer','offer_accepted','offer_rejected',
     'transaction_in_progress','closed','withdrawn','no_longer_available',
     'expired','frozen','archived')),

  -- Property information (§16)
  title text not null,
  property_category text not null check (property_category in
    ('residential','commercial','industrial','land','other')),
  property_type text,
  country_code text not null references public.countries(code),
  state_region text,
  city text not null,
  district text,
  full_address text,                 -- agent-to-agent; excluded from client projections
  general_address text,              -- client-safe general location
  building_name text,
  project_name text,
  unit_number text,                  -- agent-to-agent
  postal_code text,

  -- Pricing (numeric only, §36)
  currency text not null references public.currencies(code),
  asking_price numeric(14,2),
  monthly_rental numeric(14,2),
  negotiable text not null default 'subject_to_offer'
    check (negotiable in ('yes','no','subject_to_offer')),
  deposit numeric(14,2),
  service_charge numeric(14,2),
  fees_remarks text,

  -- Specifications
  measurement_unit text not null default 'sqft' check (measurement_unit in ('sqft','sqm')),
  built_up numeric(12,2),
  land_area numeric(12,2),
  bedrooms int,
  bathrooms int,
  car_parks int,
  floor_level text,
  furnishing text check (furnishing in ('unfurnished','partially','fully')),
  property_condition text,
  tenure text,
  completion_year int,
  availability_date date,
  vacant boolean,
  facing text,
  facilities text[] not null default '{}',
  restrictions text,

  -- Marketing
  description text,
  key_selling_points text,
  nearby_amenities text,
  client_safe_remarks text,
  viewing_instructions text,         -- agent-to-agent

  -- Availability & authority (§16)
  availability_status text not null default 'available'
    check (availability_status in ('available','pending_confirmation','unavailable')),
  availability_confirmed_at timestamptz,
  owner_confirmation_status text check (owner_confirmation_status in
    ('confirmed','pending','not_obtained')),
  appointment_status text check (appointment_status in
    ('written_appointment','appointment_pending','verbal_authorisation','none')),
  exclusive_listing boolean,

  -- Source classification summary (§17) — detail identities in sources table
  source_type text not null check (source_type in
    ('direct_written_appointment','direct_appointment_pending',
     'direct_verbal_authorisation','direct_no_appointment','indirect_other_agent',
     'co_agent','agency_shared','developer','landlord_referral','open_market','other')),
  risk_indicator text not null check (risk_indicator in
    ('verified_direct','direct_document_pending','indirect_verified_source',
     'indirect_limited_verification','open_market_confirmation_required',
     'high_risk')),

  -- Co-broke terms (§16) — agent-to-agent; never client-facing (§78)
  cobroke_accepted boolean not null default true,
  commission_type text check (commission_type in ('percentage','fixed','rental_months')),
  commission_percentage numeric(7,4),
  commission_amount numeric(14,2),
  commission_months numeric(5,2),
  commission_currency text references public.currencies(code),
  commission_conditions text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create trigger trg_property_submissions_updated before update on public.property_submissions
  for each row execute function public.set_updated_at();
create index idx_submissions_request on public.property_submissions (request_id, status);
create index idx_submissions_agent on public.property_submissions (supply_agent_id, status);

alter table public.property_submissions enable row level security;

create or replace function public.owns_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.property_requests r
                 where r.id = p_request_id and r.requesting_agent_id = auth.uid());
$$;

create policy "submissions visibility" on public.property_submissions
  for select to authenticated
  using (
    supply_agent_id = auth.uid()
    or public.owns_request(request_id)
    or public.is_platform_admin()
  );

create policy "submissions sa insert" on public.property_submissions
  for insert to authenticated
  with check (
    supply_agent_id = auth.uid()
    and status in ('draft','submitted')
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.agent_status = 'verified')
  );

create policy "submissions sa update" on public.property_submissions
  for update to authenticated
  using (
    supply_agent_id = auth.uid()
    and status in ('draft','submitted','more_information_required')
  )
  with check (
    supply_agent_id = auth.uid()
    and status in ('draft','submitted','more_information_required',
                   'withdrawn','no_longer_available')
  );

create policy "submissions admin update" on public.property_submissions
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- RA status decisions go through a definer function so the RA can change the
-- workflow status but can never edit the SA's factual property data (§9).
create or replace function public.ra_review_submission(
  p_submission_id uuid, p_new_status text, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid;
  v_old_status text;
begin
  select request_id, status into v_request_id, v_old_status
  from public.property_submissions where id = p_submission_id;
  if v_request_id is null then raise exception 'submission not found'; end if;
  if not public.owns_request(v_request_id) then
    raise exception 'not authorised';
  end if;
  if p_new_status not in ('under_review','suitable','rejected','shortlisted',
                          'more_information_required','approved_for_client') then
    raise exception 'status not allowed';
  end if;
  if v_old_status in ('withdrawn','no_longer_available','frozen','archived','closed') then
    raise exception 'submission not reviewable';
  end if;

  update public.property_submissions
    set status = p_new_status where id = p_submission_id;
  insert into public.submission_status_history
    (submission_id, previous_status, new_status, changed_by, actor_role, reason)
  values (p_submission_id, v_old_status, p_new_status, auth.uid(), 'requesting_agent', p_reason);
end $$;

-- ---------------------------------------------------------------------------
-- SA-confidential companion row (min price, internal remarks) — SA + admin only
-- ---------------------------------------------------------------------------

create table public.property_submission_private (
  submission_id uuid primary key references public.property_submissions(id) on delete cascade,
  min_acceptable_price numeric(14,2),
  internal_remarks text,
  updated_at timestamptz not null default now()
);
create trigger trg_submission_private_updated before update on public.property_submission_private
  for each row execute function public.set_updated_at();

alter table public.property_submission_private enable row level security;
create policy "submission private sa" on public.property_submission_private
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.property_submissions s
               where s.id = submission_id and s.supply_agent_id = auth.uid())
  );
create policy "submission private sa write" on public.property_submission_private
  for insert to authenticated
  with check (exists (select 1 from public.property_submissions s
              where s.id = submission_id and s.supply_agent_id = auth.uid()));
create policy "submission private sa update" on public.property_submission_private
  for update to authenticated
  using (exists (select 1 from public.property_submissions s
         where s.id = submission_id and s.supply_agent_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Detailed source info (§17) — identities visible to SA + admin only;
-- the RA sees only source_type + risk_indicator on the submission row.
-- ---------------------------------------------------------------------------

create table public.property_submission_sources (
  submission_id uuid primary key references public.property_submissions(id) on delete cascade,
  source_agent_name text,
  source_agency text,
  source_contact_reference text,
  permission_to_share boolean,
  permission_obtained_on date,
  price_confirmed_by text,
  chain_agent_count int,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.property_submission_sources enable row level security;
create policy "sources sa read" on public.property_submission_sources
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.property_submissions s
               where s.id = submission_id and s.supply_agent_id = auth.uid())
  );
create policy "sources sa write" on public.property_submission_sources
  for insert to authenticated
  with check (exists (select 1 from public.property_submissions s
              where s.id = submission_id and s.supply_agent_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Media (§16) + status history (§18)
-- ---------------------------------------------------------------------------

create table public.property_submission_media (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.property_submissions(id) on delete cascade,
  storage_path text not null,
  kind text not null default 'image' check (kind in ('image','floor_plan','document')),
  is_cover boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_submission_media on public.property_submission_media (submission_id, position);

alter table public.property_submission_media enable row level security;
create policy "media visibility" on public.property_submission_media
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.property_submissions s
               where s.id = submission_id
                 and (s.supply_agent_id = auth.uid() or public.owns_request(s.request_id)))
  );
create policy "media sa write" on public.property_submission_media
  for insert to authenticated
  with check (exists (select 1 from public.property_submissions s
              where s.id = submission_id and s.supply_agent_id = auth.uid()));

create table public.submission_status_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.property_submissions(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users(id),
  actor_role text not null check (actor_role in
    ('supply_agent','requesting_agent','admin','system')),
  reason text,
  created_at timestamptz not null default now()
);
create index idx_status_history on public.submission_status_history (submission_id, created_at desc);

alter table public.submission_status_history enable row level security;
create policy "history visibility" on public.submission_status_history
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.property_submissions s
               where s.id = submission_id
                 and (s.supply_agent_id = auth.uid() or public.owns_request(s.request_id)))
  );
create policy "history participant insert" on public.submission_status_history
  for insert to authenticated
  with check (
    changed_by = auth.uid()
    and (
      public.is_platform_admin()
      or exists (select 1 from public.property_submissions s
                 where s.id = submission_id
                   and (s.supply_agent_id = auth.uid() or public.owns_request(s.request_id)))
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: private originals bucket (§44). SA uploads to own folder;
-- RA of the linked request + admin may read via signed URLs.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-original-private', 'property-original-private', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "property media owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'property-original-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "property media read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'property-original-private'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_admin()
      or exists (
        select 1 from public.property_submission_media m
        join public.property_submissions s on s.id = m.submission_id
        where m.storage_path = storage.objects.name
          and public.owns_request(s.request_id)
      )
    )
  );
