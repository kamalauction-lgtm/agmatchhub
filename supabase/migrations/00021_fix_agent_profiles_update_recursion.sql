-- =============================================================================
-- 00021 — Fix 42P17 in "agent_profiles self update" (same self-referential
-- WITH CHECK pattern as 00020). Replace the subquery guard with a BEFORE
-- UPDATE trigger: triggers see OLD directly, so no policy recursion, and the
-- review fields stay agent-immutable.
-- =============================================================================

drop policy "agent_profiles self update" on public.agent_profiles;

create policy "agent_profiles self update" on public.agent_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.guard_agent_profile_review_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    if new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.review_notes is distinct from old.review_notes then
      raise exception 'review fields are admin-only';
    end if;
  end if;
  return new;
end $$;

create trigger trg_guard_agent_profile_review
  before update on public.agent_profiles
  for each row execute function public.guard_agent_profile_review_fields();
