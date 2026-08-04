-- =============================================================================
-- 00003 — Point agent_profiles.user_id at profiles(id) instead of auth.users
-- so PostgREST can resolve the profiles ⇄ agent_profiles embed (admin queue).
-- Same referential integrity: profiles.id itself cascades from auth.users.
-- =============================================================================

alter table public.agent_profiles
  drop constraint agent_profiles_user_id_fkey;

alter table public.agent_profiles
  add constraint agent_profiles_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
