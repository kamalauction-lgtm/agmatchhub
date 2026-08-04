-- =============================================================================
-- 00022 — Fix 42P17 on request INSERT: "profiles collaborator read" (00009)
-- joined property_requests inline, so inserting a request re-entered
-- property_requests policy expansion via the profiles check → recursion.
-- Rule (4th occurrence): policies must never reference tables that can lead
-- back to the policy's own table — route cross-table checks through
-- SECURITY DEFINER functions. Applies to 00009 and both 00019 policies.
-- =============================================================================

create or replace function public.is_collaborating_with(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.property_submissions s
    join public.property_requests r on r.id = s.request_id
    where (s.supply_agent_id = p_profile_id and r.requesting_agent_id = auth.uid())
       or (r.requesting_agent_id = p_profile_id and s.supply_agent_id = auth.uid())
  );
$$;

create or replace function public.has_contact_release_with(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contact_release_requests cr
    join public.property_submissions s on s.id = cr.submission_id
    join public.property_requests r on r.id = s.request_id
    where cr.status = 'approved'
      and ((s.supply_agent_id = p_profile_id and r.requesting_agent_id = auth.uid())
        or (r.requesting_agent_id = p_profile_id and s.supply_agent_id = auth.uid()))
  );
$$;

drop policy "profiles collaborator read" on public.profiles;
create policy "profiles collaborator read" on public.profiles
  for select to authenticated
  using (public.is_collaborating_with(profiles.id));

drop policy "agent_profiles collaborator read" on public.agent_profiles;
create policy "agent_profiles collaborator read" on public.agent_profiles
  for select to authenticated
  using (public.is_collaborating_with(agent_profiles.user_id));

drop policy "social links collaborator read" on public.agent_social_links;
create policy "social links collaborator read" on public.agent_social_links
  for select to authenticated
  using (
    public.is_collaborating_with(agent_social_links.user_id)
    and verification_status = 'verified'
    and (
      visibility in ('collaborators','public_profile')
      or (visibility = 'after_contact_release'
          and public.has_contact_release_with(agent_social_links.user_id))
    )
  );
