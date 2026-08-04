-- =============================================================================
-- 00020 — Fix 42P17: "profiles self update" WITH CHECK subselected from
-- profiles inside its own policy → infinite recursion (latent since 00001;
-- first triggered by trust-profile self-updates). A SECURITY DEFINER helper
-- reads the current status without re-entering RLS.
-- =============================================================================

create or replace function public.own_agent_status()
returns text language sql stable security definer set search_path = public as $$
  select p.agent_status from public.profiles p where p.id = auth.uid();
$$;

drop policy "profiles self update" on public.profiles;

create policy "profiles self update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- agents may edit their profile but never their own verification status
    and agent_status = public.own_agent_status()
  );
