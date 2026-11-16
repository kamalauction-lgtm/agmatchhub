-- =============================================================================
-- 00130 — Agency directory; AG Hero only for partner agencies (owner, 13 and
-- 16 Nov 2026)
--
-- An agent's company was free text, typed only on the Verification page, and
-- the AG Hero card showed on every profile. Now:
--
--   1. agencies gains status ('confirmed' | 'unconfirmed'), hero_partner and
--      created_by (auth.users — hard rule 6). Existing rows are confirmed.
--   2. agent_add_agency(name): an agent with access adds their company when it
--      is not in the directory. It is created in the agent's own country as
--      'unconfirmed' (an admin confirms or merges it), a same-name agency in
--      that country is reused instead of duplicated, and one agent can have at
--      most 3 unconfirmed agencies. Audited.
--   3. agent_set_agency(agency): the agent picks their company from the
--      directory; it must be in their own country. Keeps agent_profiles
--      .agency_name in step for every screen that shows it. Audited.
--   4. agency_is_hero_partner(user): the AG Hero card shows only when the
--      agent's agency is a confirmed Hero partner (or they are already linked,
--      handled in the app). Which agencies are partners is data an admin sets,
--      never a name in code (hard rule 12).
--
-- Agencies stay readable by every signed-in user and writable directly only
-- by admins (00125); agents write only through the two functions above.
-- No policy subqueries its own table (hard rule 4).
--
-- Rollback: drop the three functions and the three columns.
-- =============================================================================

alter table public.agencies
  add column if not exists status text not null default 'confirmed'
    check (status in ('confirmed', 'unconfirmed')),
  add column if not exists hero_partner boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists idx_agencies_country_name on public.agencies (country_code, lower(name));

-- 2. Agent adds their company ----------------------------------------------------
create or replace function public.agent_add_agency(p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_country text;
  v_id uuid;
  v_open int;
begin
  if auth.uid() is null or not public.agent_has_access(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if length(v_name) < 2 or length(v_name) > 160 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  select country_code into v_country from public.profiles where id = auth.uid();
  if v_country is null then
    return jsonb_build_object('ok', false, 'error', 'no_country');
  end if;

  select a.id into v_id from public.agencies a
   where a.country_code = v_country and lower(a.name) = lower(v_name)
   order by (a.status = 'confirmed') desc, a.created_at
   limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'agency', v_id, 'created', false);
  end if;

  select count(*) into v_open from public.agencies a
   where a.created_by = auth.uid() and a.status = 'unconfirmed';
  if v_open >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  insert into public.agencies (name, country_code, status, created_by)
  values (v_name, v_country, 'unconfirmed', auth.uid())
  returning id into v_id;
  perform public.log_audit('agency.added_by_agent', 'agency', v_id::text, null,
    jsonb_build_object('name', v_name, 'country_code', v_country, 'status', 'unconfirmed'), null);
  return jsonb_build_object('ok', true, 'agency', v_id, 'created', true);
end;
$$;

-- 3. Agent picks their company ---------------------------------------------------
create or replace function public.agent_set_agency(p_agency uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_agency record;
  v_country text;
  v_before uuid;
begin
  if auth.uid() is null or not public.agent_has_access(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select a.id, a.name, a.country_code into v_agency from public.agencies a where a.id = p_agency;
  if v_agency.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select country_code into v_country from public.profiles where id = auth.uid();
  if v_country is null or v_agency.country_code is distinct from v_country then
    return jsonb_build_object('ok', false, 'error', 'other_country');
  end if;

  select agency_id into v_before from public.agent_profiles where user_id = auth.uid();
  insert into public.agent_profiles (user_id, agency_id, agency_name)
  values (auth.uid(), v_agency.id, v_agency.name)
  on conflict (user_id) do update set agency_id = excluded.agency_id, agency_name = excluded.agency_name;
  perform public.log_audit('agent.agency_set', 'agent_profile', auth.uid()::text,
    jsonb_build_object('agency_id', v_before), jsonb_build_object('agency_id', v_agency.id), null);
  return jsonb_build_object('ok', true, 'agency', v_agency.id);
end;
$$;

-- 4. Hero partner check ----------------------------------------------------------
create or replace function public.agency_is_hero_partner(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agent_profiles ap
    join public.agencies a on a.id = ap.agency_id
    where ap.user_id = p_user and a.hero_partner and a.status = 'confirmed'
      and (p_user = auth.uid() or auth.uid() is null or public.has_capability('agent.verify'))
  );
$$;

revoke all on function public.agent_add_agency(text) from public, anon;
revoke all on function public.agent_set_agency(uuid) from public, anon;
revoke all on function public.agency_is_hero_partner(uuid) from public, anon;
grant execute on function public.agent_add_agency(text) to authenticated;
grant execute on function public.agent_set_agency(uuid) to authenticated;
grant execute on function public.agency_is_hero_partner(uuid) to authenticated, service_role;
