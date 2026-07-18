-- =============================================================================
-- 00002 — Agent verification: agent_profiles, verification history, agencies,
-- storage buckets + policies · master spec §12, §44
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Agencies (minimal at MVP; agency_members later)
-- ---------------------------------------------------------------------------

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text,
  country_code text references public.countries(code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_agencies_updated before update on public.agencies
  for each row execute function public.set_updated_at();

alter table public.agencies enable row level security;
create policy "agencies read authenticated" on public.agencies
  for select to authenticated using (true);
-- writes via server code (admin) only

-- ---------------------------------------------------------------------------
-- Agent professional profile + verification submission (§12)
-- ---------------------------------------------------------------------------

create table public.agent_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_legal_name text,
  agency_id uuid references public.agencies(id),
  agency_name text,
  agency_registration_number text,
  agent_role text,
  licence_type text,            -- REN / REA / PEA / Agen Properti / Broker / Other
  licence_number text,
  licence_expiry date,
  country_code text references public.countries(code),
  state_region text,
  city text,
  markets_served text[] not null default '{}',
  property_categories text[] not null default '{}',
  -- storage object paths (private bucket, folder = user_id)
  profile_photo_path text,
  licence_document_path text,
  identity_document_path text,
  agency_document_path text,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text,            -- admin note shown to the agent (amendments etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_agent_profiles_updated before update on public.agent_profiles
  for each row execute function public.set_updated_at();

alter table public.agent_profiles enable row level security;

create policy "agent_profiles self read" on public.agent_profiles
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
create policy "agent_profiles self insert" on public.agent_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy "agent_profiles self update" on public.agent_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    -- agents cannot fabricate a review
    and reviewed_by is not distinct from (select ap.reviewed_by from public.agent_profiles ap where ap.user_id = auth.uid())
    and reviewed_at is not distinct from (select ap.reviewed_at from public.agent_profiles ap where ap.user_id = auth.uid())
  );
create policy "agent_profiles admin update" on public.agent_profiles
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Admin may update profiles.agent_status (self-update policy forbids it)
create policy "profiles admin update" on public.profiles
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Verification event history (§12 statuses, §52 traceability)
-- ---------------------------------------------------------------------------

create table public.agent_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in
    ('submitted','resubmitted','approved','rejected','info_requested','suspended','restored')),
  notes text,
  acted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.agent_verifications enable row level security;
create policy "agent_verifications read own" on public.agent_verifications
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
create policy "agent_verifications insert self" on public.agent_verifications
  for insert to authenticated
  with check (
    (user_id = auth.uid() and action in ('submitted','resubmitted') and acted_by = auth.uid())
    or (public.is_platform_admin() and acted_by = auth.uid())
  );
-- no update/delete policies: history is immutable for normal roles

-- ---------------------------------------------------------------------------
-- Storage buckets (§44): private verification docs, public profile media
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('agent-verification-private', 'agent-verification-private', false, 5242880,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('agent-profile-public', 'agent-profile-public', true, 3145728,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Path convention: <user_id>/<filename>. Owner writes own folder only.
create policy "verif docs owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agent-verification-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "verif docs owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'agent-verification-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "verif docs read own or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agent-verification-private'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())
  );

create policy "profile media owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agent-profile-public'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "profile media owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'agent-profile-public'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
