-- =============================================================================
-- 00128 — Country at signup; licence types per country (owner, 13 Nov 2026)
--
-- Self-registered agents never got profiles.country_code: /register asked for
-- no country, and only an invitation set it (00106). Admin scoping reads
-- profiles.country_code (00105), so a country admin could neither see nor
-- approve them — on production 11 of 12 profiles had no country.
--
--   1. handle_new_user() takes the country the person chose at /register
--      (user metadata `country_code`), only if it is an active country.
--   2. Once set, the country can be changed only by an admin with
--      agent.verify, the service role, or a direct database session. A
--      BEFORE trigger reading NEW/OLD only — never a subquery on profiles
--      (hard rule 4).
--   3. Backfill from agent_profiles.country_code where the profile has none.
--   4. Licence types become country configuration
--      (countries.terminology.licence_fields), so REN shows to Malaysian
--      negotiators only and a new country is configuration, not code.
--
-- Rollback: restore handle_new_user from 00001; drop trigger
-- trg_profiles_country_guard and function guard_profile_country(). The
-- backfill and the licence_fields values are harmless to leave.
-- =============================================================================

-- 1. Country from signup -------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_country text := upper(nullif(new.raw_user_meta_data->>'country_code', ''));
begin
  if v_country is not null
     and not exists (select 1 from public.countries c where c.code = v_country and c.active) then
    v_country := null;
  end if;
  insert into public.profiles (id, display_name, country_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_country
  );
  insert into public.users_private (user_id, email) values (new.id, new.email);
  return new;
end $$;

-- 2. Guard ------------------------------------------------------------------------
create or replace function public.guard_profile_country()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.country_code is not distinct from old.country_code then
    return new;
  end if;
  -- First choice (null -> a country) is the person's own; it must be active.
  if old.country_code is null then
    if new.country_code is not null
       and not exists (select 1 from public.countries c where c.code = new.country_code and c.active) then
      raise exception 'country_inactive' using errcode = '22023';
    end if;
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if public.has_capability('agent.verify') then
    return new;
  end if;
  raise exception 'country can only be changed by an admin' using errcode = '42501';
end;
$$;

drop trigger if exists trg_profiles_country_guard on public.profiles;
create trigger trg_profiles_country_guard
  before update of country_code on public.profiles
  for each row execute function public.guard_profile_country();

-- 3. Backfill ---------------------------------------------------------------------
update public.profiles p
   set country_code = ap.country_code
  from public.agent_profiles ap
 where ap.user_id = p.id
   and p.country_code is null
   and ap.country_code is not null;

-- 4. Licence types per country -------------------------------------------------
update public.countries
   set terminology = coalesce(terminology, '{}'::jsonb)
                     || jsonb_build_object('licence_fields', jsonb_build_array('REN', 'REA', 'PEA'))
 where code = 'MY';

update public.countries
   set terminology = coalesce(terminology, '{}'::jsonb)
                     || jsonb_build_object('licence_fields', jsonb_build_array('AGEN_PROPERTI', 'BROKER'))
 where code = 'ID';
