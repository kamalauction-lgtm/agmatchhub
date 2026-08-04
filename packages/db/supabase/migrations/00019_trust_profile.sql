-- =============================================================================
-- 00019 — Agent trust profile · spec §71, §86 modules 3–5
-- Structured social links (never one text blob), name-card storage paths,
-- and a restricted collaborator view of professional details.
-- =============================================================================

create table public.agent_social_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in
    ('facebook','instagram','linkedin','tiktok','youtube','whatsapp','telegram',
     'website','agency_profile','other')),
  url text not null,
  display_label text,
  verification_status text not null default 'unverified' check (verification_status in
    ('unverified','verified','rejected','hidden')),
  visibility text not null default 'collaborators' check (visibility in
    ('admin_only','collaborators','after_contact_release','public_profile')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_social_links_updated before update on public.agent_social_links
  for each row execute function public.set_updated_at();
create index idx_social_links_user on public.agent_social_links (user_id);

alter table public.agent_social_links enable row level security;

create policy "social links own" on public.agent_social_links
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy "social links own insert" on public.agent_social_links
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (url like 'https://%' or url like 'http://%')   -- §71: reject dangerous schemes
  );
create policy "social links own update" on public.agent_social_links
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (url like 'https://%' or url like 'http://%')
    -- agents cannot self-verify; admin does that
    and verification_status = 'unverified'
  );
create policy "social links own delete" on public.agent_social_links
  for delete to authenticated using (user_id = auth.uid());
create policy "social links admin update" on public.agent_social_links
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Collaborating agents may see verified links marked visible to collaborators,
-- or (§71 visibility level 4) after an approved contact release.
create policy "social links collaborator read" on public.agent_social_links
  for select to authenticated
  using (
    exists (
      select 1 from public.property_submissions s
      join public.property_requests r on r.id = s.request_id
      where ((s.supply_agent_id = agent_social_links.user_id and r.requesting_agent_id = auth.uid())
          or (r.requesting_agent_id = agent_social_links.user_id and s.supply_agent_id = auth.uid()))
    )
    and verification_status = 'verified'
    and (
      visibility in ('collaborators','public_profile')
      or (visibility = 'after_contact_release' and exists (
        select 1 from public.contact_release_requests cr
        join public.property_submissions s2 on s2.id = cr.submission_id
        join public.property_requests r2 on r2.id = s2.request_id
        where cr.status = 'approved'
          and ((s2.supply_agent_id = agent_social_links.user_id and r2.requesting_agent_id = auth.uid())
            or (r2.requesting_agent_id = agent_social_links.user_id and s2.supply_agent_id = auth.uid()))
      ))
    )
  );

-- Name card storage paths (§71) — files live in agent-verification-private
alter table public.agent_profiles
  add column name_card_front_path text,
  add column name_card_back_path text,
  add column biography text;

-- Restricted trust-profile read for collaborating agents (§71): professional
-- fields only become visible through a submission relationship. Document
-- paths are inert strings; the storage policies still gate the files.
create policy "agent_profiles collaborator read" on public.agent_profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.property_submissions s
      join public.property_requests r on r.id = s.request_id
      where ((s.supply_agent_id = agent_profiles.user_id and r.requesting_agent_id = auth.uid())
          or (r.requesting_agent_id = agent_profiles.user_id and s.supply_agent_id = auth.uid()))
    )
  );
