-- =============================================================================
-- 00129 — Instant access for new agents; verification becomes a voluntary
-- badge; the old approval gate stays behind a switch (owner, 13 Nov 2026)
--
-- Until now "approved" and "verified" were the same thing: a new agent could
-- not post in MatchHub, add a property, use the co-broke pool, the AI tools
-- or the public card until an admin set agent_status = 'verified'. Agents
-- joining through referrals found that demotivating.
--
--   1. Access is separate from the badge.
--        agent_access_ok(status, access_granted_at):
--          not suspended / banned / temporarily_restricted / archived, and
--          (verified, or granted access, or approval not required).
--        agent_has_access(user) reads the profile (SECURITY DEFINER).
--      The badge stays agent_status = 'verified' (public is_verified columns,
--      listing quality score, referral rules) — unchanged.
--   2. feature flag `agent_approval_required` (off). Turned on, a new signup
--      gets no access until an admin verifies them: the old flow, unchanged.
--   3. profiles.access_granted_at: set at signup while approval is off, and
--      backfilled for every existing profile, so turning approval on later
--      never locks out agents who already have access. Only an admin with
--      agent.verify, the service role or a direct session may change it.
--   4. Every gate that required 'verified' for USING the system now asks
--      agent_has_access(): MatchHub request and submission inserts, property
--      inserts, is_verified_agent() (co-broke pool), public agent profiles
--      and their social links, the AI brief audience.
--   5. admin_ban_agent(): a permanent stop (status 'banned'), same effects as
--      a suspension (listings paused, writes blocked) but not restorable with
--      admin_restore_agent.
--
-- No policy subqueries its own table (hard rule 4): the profile is read only
-- inside SECURITY DEFINER helpers; the guard trigger reads NEW/OLD.
--
-- Rollback: recreate the three policies, the two views, is_verified_agent()
-- and ai_brief_audience() from their previous definitions (00005, 00007,
-- 00030, 00044, 00050, 00031, 00092) and drop the new functions, trigger and
-- column. The flag row is harmless to leave.
-- =============================================================================

-- 1. Column and switch ----------------------------------------------------------
alter table public.profiles add column if not exists access_granted_at timestamptz;

insert into public.feature_flags (key, name, description, enabled)
values (
  'agent_approval_required',
  'New agents need admin approval',
  'Off: new agents can use the platform as soon as they confirm their email; admins review them afterwards and can suspend or ban. On: new agents wait for an admin to approve them first. Agents who already have access keep it.',
  false
)
on conflict (key) do nothing;

-- 2. Access helpers -----------------------------------------------------------------
create or replace function public.agent_approval_required()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select f.enabled from public.feature_flags f where f.key = 'agent_approval_required'), false);
$$;

create or replace function public.agent_access_ok(p_status text, p_granted timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_status, 'draft') not in ('suspended', 'banned', 'temporarily_restricted', 'archived')
     and (p_status = 'verified' or p_granted is not null or not public.agent_approval_required());
$$;

create or replace function public.agent_has_access(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and public.agent_access_ok(p.agent_status, p.access_granted_at)
      -- Your own answer only, unless you are the server or an admin.
      and (p_user = auth.uid() or auth.uid() is null or public.has_capability('agent.verify'))
  );
$$;

revoke all on function public.agent_approval_required() from public;
revoke all on function public.agent_access_ok(text, timestamptz) from public;
revoke all on function public.agent_has_access(uuid) from public, anon;
grant execute on function public.agent_approval_required() to anon, authenticated;
grant execute on function public.agent_access_ok(text, timestamptz) to anon, authenticated;
grant execute on function public.agent_has_access(uuid) to authenticated, service_role;

-- 3. Signup grant, backfill, guard -------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_country text := upper(nullif(new.raw_user_meta_data->>'country_code', ''));
begin
  if v_country is not null
     and not exists (select 1 from public.countries c where c.code = v_country and c.active) then
    v_country := null;
  end if;
  insert into public.profiles (id, display_name, country_code, access_granted_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_country,
    case when public.agent_approval_required() then null else now() end
  );
  insert into public.users_private (user_id, email) values (new.id, new.email);
  return new;
end $$;

update public.profiles set access_granted_at = coalesce(created_at, now()) where access_granted_at is null;

create or replace function public.guard_profile_access_grant()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.access_granted_at is not distinct from old.access_granted_at then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if public.has_capability('agent.verify') then
    return new;
  end if;
  raise exception 'access can only be granted by an admin' using errcode = '42501';
end;
$$;

drop trigger if exists trg_profiles_access_grant_guard on public.profiles;
create trigger trg_profiles_access_grant_guard
  before update of access_granted_at on public.profiles
  for each row execute function public.guard_profile_access_grant();

-- 4. Gates: "may use the system" instead of "has the badge" -------------------------
create or replace function public.is_verified_agent()
returns boolean language sql stable security definer set search_path = public as $$
  -- Name kept for its callers (co-broke pool policies and functions). Since
  -- 00129 it means "may use the platform", not "holds the Verified badge".
  select public.agent_has_access(auth.uid());
$$;

drop policy if exists "requests verified agent insert" on public.property_requests;
create policy "requests verified agent insert" on public.property_requests
  for insert to authenticated
  with check (requesting_agent_id = auth.uid() and status = 'draft' and public.agent_has_access(auth.uid()));

drop policy if exists "submissions sa insert" on public.property_submissions;
create policy "submissions sa insert" on public.property_submissions
  for insert to authenticated
  with check (supply_agent_id = auth.uid() and status = any (array['draft', 'submitted']) and public.agent_has_access(auth.uid()));

drop policy if exists "properties agent insert" on public.properties;
create policy "properties agent insert" on public.properties
  for insert to authenticated
  with check (agent_id = auth.uid() and public.agent_has_access(auth.uid()));

create or replace view public.public_agent_profiles with (security_invoker = false) as
 select pr.id,
    pr.public_slug,
    pr.display_name,
    pr.avatar_url,
    pr.country_code,
    pr.preferred_language,
    pr.agent_status = 'verified'::text as is_verified,
    agp.agency_name,
    agp.city,
    agp.state_region,
    agp.biography,
    agp.profile_photo_path,
    agp.markets_served,
    agp.property_categories,
    ( select count(*) as count
           from listings l
          where l.agent_id = pr.id and l.status = 'published'::text and l.moderation_state = 'approved'::text and l.archived_at is null) as published_listing_count
   from profiles pr
     left join agent_profiles agp on agp.user_id = pr.id
  where public.agent_access_ok(pr.agent_status, pr.access_granted_at);

create or replace view public.public_agent_social_links with (security_invoker = false) as
 select l.user_id,
    l.platform,
    l.url,
    l.display_label,
    l.verification_status = 'verified'::text as is_verified
   from agent_social_links l
     join profiles p on p.id = l.user_id
  where public.agent_access_ok(p.agent_status, p.access_granted_at)
    and l.visibility = 'public_profile'::text
    and (l.verification_status <> all (array['rejected'::text, 'hidden'::text]));

grant select on public.public_agent_profiles to anon, authenticated;
grant select on public.public_agent_social_links to anon, authenticated;

create or replace function public.ai_brief_audience(p_days integer default 14)
 returns table(user_id uuid, locale text, display_name text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, coalesce(p.preferred_language, 'id'), p.display_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where (auth.uid() is null or public.has_capability('ai.manage'))
    and public.agent_access_ok(p.agent_status, p.access_granted_at)
    and u.last_sign_in_at > now() - greatest(p_days, 1) * interval '1 day'
    and public.is_feature_enabled('ai_features', p.id);
$function$;

-- 5. Ban ---------------------------------------------------------------------------
create or replace function public.admin_ban_agent(p_agent uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_ids uuid[];
  v_id uuid;
begin
  select p.id, p.agent_status, p.country_code into v_profile from public.profiles p where p.id = p_agent;
  if v_profile.id is null or not public.has_capability_in('agent.verify', v_profile.country_code) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_agent = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  if v_profile.agent_status = 'banned' then
    return jsonb_build_object('ok', false, 'error', 'already_banned');
  end if;
  if v_reason is null or length(v_reason) < 3 or length(v_reason) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select coalesce(array_agg(l.id), '{}') into v_ids
    from public.listings l where l.agent_id = p_agent and l.status = 'published';
  update public.listings set status = 'paused' where id = any(v_ids);
  update public.profiles set agent_status = 'banned' where id = p_agent;

  -- An open suspension is closed into the ban, so there is one open record.
  update public.agent_suspensions
     set restored_at = now(), restored_by = auth.uid(), restore_note = 'closed by ban', republished_count = 0
   where agent_id = p_agent and restored_at is null;
  insert into public.agent_suspensions (agent_id, previous_status, reason, paused_listing_ids, suspended_by)
  values (p_agent, v_profile.agent_status, 'BAN: ' || v_reason, v_ids, auth.uid())
  returning id into v_id;
  insert into public.agent_verifications (user_id, action, notes, acted_by)
  values (p_agent, 'suspended', 'BAN: ' || v_reason, auth.uid());
  perform public.log_audit('agent.banned', 'agent_profile', p_agent::text,
    jsonb_build_object('agent_status', v_profile.agent_status),
    jsonb_build_object('agent_status', 'banned', 'suspension', v_id, 'listings_paused', coalesce(array_length(v_ids, 1), 0)), v_reason);
  insert into public.notifications (user_id, kind, payload, href)
  values (p_agent, 'agent.suspended', jsonb_build_object('suspension', v_id), '/dashboard');
  return jsonb_build_object('ok', true, 'suspension', v_id, 'listings_paused', coalesce(array_length(v_ids, 1), 0));
end;
$$;

revoke all on function public.admin_ban_agent(uuid, text) from public, anon;
grant execute on function public.admin_ban_agent(uuid, text) to authenticated;
