-- =============================================================================
-- 00132 — An admin opens an account for an agent, with recorded consent and a
-- temporary password the agent must change (owner, 19 Nov 2026)
--
-- Admins call agents on other platforms, ask permission, and open the account
-- for them. The agent receives their email and a temporary password and must
-- choose their own password at first sign-in.
--
--   1. profiles.must_change_password: set when an admin opens the account;
--      while true the Hub sends the agent to choose a password before
--      anything else. Only an admin with agent.invite, the service role or a
--      direct session may change it (BEFORE trigger on NEW/OLD — hard rule 4).
--   2. agent_onboarding_consents: what the agent agreed to, how, when, and the
--      admin who recorded it, with the exact wording shown to the admin.
--      Append-only (hard rule 8): a change of mind is a new row with
--      status 'withdrawn', never an edit. Actor FKs point at auth.users
--      (hard rule 6).
--   3. Inserts come only from the Hub's server action after its capability
--      check (service role); reads: the agent themself and admins of their
--      country.
--
-- Rollback: drop the table, the trigger and its function, and the column.
-- =============================================================================

alter table public.profiles add column if not exists must_change_password boolean not null default false;

create or replace function public.guard_profile_must_change_password()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.must_change_password is not distinct from old.must_change_password then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if public.has_capability('agent.invite') then
    return new;
  end if;
  raise exception 'must_change_password can only be changed by an admin' using errcode = '42501';
end;
$$;

drop trigger if exists trg_profiles_must_change_password_guard on public.profiles;
create trigger trg_profiles_must_change_password_guard
  before update of must_change_password on public.profiles
  for each row execute function public.guard_profile_must_change_password();

create table if not exists public.agent_onboarding_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text references public.countries(code),
  recorded_by uuid references auth.users(id) on delete set null,
  method text not null check (method in ('phone_call', 'whatsapp', 'in_person', 'email')),
  consented_at timestamptz not null,
  scopes text[] not null check (scopes <@ array['open_account', 'import_listings', 'publish_on_behalf']::text[] and cardinality(scopes) > 0),
  source_platform text,
  note text,
  wording text not null,
  language text not null,
  status text not null default 'given' check (status in ('given', 'withdrawn')),
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_onboarding_consents_user on public.agent_onboarding_consents (user_id, created_at desc);

alter table public.agent_onboarding_consents enable row level security;
drop policy if exists "onboarding consents read" on public.agent_onboarding_consents;
create policy "onboarding consents read" on public.agent_onboarding_consents
  for select to authenticated
  using (user_id = auth.uid() or public.admin_sees_user(user_id));
revoke insert, update, delete on public.agent_onboarding_consents from anon, authenticated;

-- Does this agent currently allow the platform to publish for them?
-- The latest row for the scope decides (a withdrawal is a newer row).
create or replace function public.agent_allows(p_user uuid, p_scope text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.status = 'given'
      from public.agent_onboarding_consents c
     where c.user_id = p_user and p_scope = any(c.scopes)
     order by c.created_at desc
     limit 1
  ), false);
$$;

revoke all on function public.agent_allows(uuid, text) from public, anon;
grant execute on function public.agent_allows(uuid, text) to authenticated, service_role;
