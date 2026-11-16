-- =============================================================================
-- 00126 — Agent Acquisition Pipeline (screen 2)
--
-- Approved plan (P0-a → P2-b, 10 Nov 2026): `agent_prospects` is "a small
-- pre-account CRM: name, contact, source, owner admin, stage and purpose
-- note — admin only, country-scoped. Retention rule to be set by the owner"
-- (owner decision 5).
--
-- The screen is built now; the decision is honoured in the database:
--
--   · A prospect can only be stored in a country whose retention period is
--     set (countries.settings.prospect_retention_days, 30–730 days). Until
--     the owner sets it, INSERT is refused ('retention_not_set'), so no
--     personal data is held without a deletion date.
--   · Every row carries delete_after = last activity + the retention period;
--     purge_expired_prospects() (service role, daily cron) deletes past it
--     and audits the count — never names.
--   · RLS: agent.invite IN the prospect's country for every operation; no
--     agent, client or anon access. Converted prospects keep only the link to
--     the account/invitation.
--
-- No policy subqueries agent_prospects itself (hard rule 4).
-- Rollback: drop the trigger, functions and table.
-- =============================================================================

create table if not exists public.agent_prospects (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  full_name text not null check (length(full_name) between 2 and 120),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  agency_name text check (agency_name is null or length(agency_name) <= 160),
  source text not null check (source in ('referral', 'event', 'portal_listing', 'social', 'inbound', 'other')),
  source_note text check (source_note is null or length(source_note) <= 300),
  purpose_note text not null check (length(purpose_note) between 3 and 500),
  stage text not null default 'new' check (stage in ('new', 'contacted', 'interested', 'invited', 'declined', 'converted')),
  owner_admin uuid references auth.users(id),
  invitation_id uuid references public.agent_invitations(id) on delete set null,
  converted_user_id uuid references auth.users(id) on delete set null,
  last_contact_at timestamptz,
  delete_after timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prospect_has_contact check (phone is not null or email is not null)
);

create index if not exists idx_agent_prospects_country_stage on public.agent_prospects (country_code, stage);
create index if not exists idx_agent_prospects_delete_after on public.agent_prospects (delete_after);

alter table public.agent_prospects enable row level security;

drop policy if exists "prospects admin read" on public.agent_prospects;
create policy "prospects admin read" on public.agent_prospects
  for select to authenticated using (public.has_capability_in('agent.invite', country_code));
drop policy if exists "prospects admin insert" on public.agent_prospects;
create policy "prospects admin insert" on public.agent_prospects
  for insert to authenticated with check (public.has_capability_in('agent.invite', country_code) and created_by = auth.uid());
drop policy if exists "prospects admin update" on public.agent_prospects;
create policy "prospects admin update" on public.agent_prospects
  for update to authenticated
  using (public.has_capability_in('agent.invite', country_code))
  with check (public.has_capability_in('agent.invite', country_code));
drop policy if exists "prospects admin delete" on public.agent_prospects;
create policy "prospects admin delete" on public.agent_prospects
  for delete to authenticated using (public.has_capability_in('agent.invite', country_code));

-- -----------------------------------------------------------------------------
-- Retention: the owner's period, per country; delete_after kept by trigger.
-- -----------------------------------------------------------------------------

create or replace function public.prospect_retention_days(p_country text)
returns int language sql stable security definer set search_path = public as $$
  select case when (c.settings->>'prospect_retention_days') ~ '^[0-9]+$'
              and (c.settings->>'prospect_retention_days')::int between 30 and 730
         then (c.settings->>'prospect_retention_days')::int end
    from public.countries c where c.code = p_country;
$$;
revoke all on function public.prospect_retention_days(text) from public, anon;
grant execute on function public.prospect_retention_days(text) to authenticated;

create or replace function public.guard_agent_prospect()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_days int := public.prospect_retention_days(new.country_code);
begin
  if v_days is null then
    raise exception 'retention_not_set: set the prospect retention period for % first', new.country_code using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.country_code is distinct from old.country_code then
    raise exception 'a prospect''s country cannot change' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.delete_after := coalesce(new.last_contact_at, case when tg_op = 'INSERT' then now() else old.created_at end) + make_interval(days => v_days);
  return new;
end;
$$;

drop trigger if exists trg_agent_prospects_guard on public.agent_prospects;
create trigger trg_agent_prospects_guard
  before insert or update on public.agent_prospects
  for each row execute function public.guard_agent_prospect();

create or replace function public.purge_expired_prospects()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  with gone as (delete from public.agent_prospects where delete_after < now() returning 1)
  select count(*) into v_count from gone;
  if v_count > 0 then
    perform public.log_audit('agent_prospects.purged', 'agent_prospects', null, null, jsonb_build_object('deleted', v_count));
  end if;
  return v_count;
end;
$$;
revoke all on function public.purge_expired_prospects() from public, anon, authenticated;
grant execute on function public.purge_expired_prospects() to service_role;
