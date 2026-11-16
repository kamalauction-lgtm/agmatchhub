-- =============================================================================
-- 00121 — suspend and restore an agent (P1-d-1, Agent 360, screen 4)
--
-- Approved plan: Agent 360 "suspend and restore", carrying the agent
-- suspension that moderation handed over (screen 9). Until now
-- profiles.agent_status could say 'suspended' but nothing honoured it: the
-- agent kept full use of the Hub and their listings stayed on the marketplace.
--
--   1. agent_suspensions: one row per suspension, with the status to return
--      to, the reason, the listings it took off the marketplace, and who
--      suspended / restored. RLS on: scoped admins read it; the agent reads
--      their own (they are entitled to the reason); no client writes.
--   2. admin_suspend_agent(agent, reason) — agent.verify in the agent's
--      country, never yourself, never an agent already suspended. Sets the
--      status to 'suspended', pauses their published listings (recorded so
--      restore puts back exactly those), audits, notifies the agent in-app.
--   3. admin_restore_agent(agent, note) — same capability. Returns the
--      previous status, republishes only the listings this suspension paused
--      that are still paused and still approved, audits, notifies.
--   4. A suspended (or banned) agent cannot create or edit listings or their
--      properties: a BEFORE trigger on each refuses the agent's own writes
--      (NEW/OLD and a profiles lookup only — never the table's own policy;
--      hard rule 4). The Hub additionally shows them a suspension notice.
--
-- Rollback: drop the triggers, functions and table; set any 'suspended'
-- agents back by hand from agent_suspensions.previous_status.
-- =============================================================================

create table if not exists public.agent_suspensions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users(id) on delete cascade,
  previous_status text not null,
  reason text not null check (length(reason) between 3 and 2000),
  paused_listing_ids uuid[] not null default '{}',
  suspended_by uuid not null references auth.users(id),
  suspended_at timestamptz not null default now(),
  restored_by uuid references auth.users(id),
  restored_at timestamptz,
  restore_note text check (restore_note is null or length(restore_note) <= 2000),
  republished_count int
);

create index if not exists idx_agent_suspensions_agent on public.agent_suspensions (agent_id, suspended_at desc);
create unique index if not exists idx_agent_suspensions_open on public.agent_suspensions (agent_id) where restored_at is null;

alter table public.agent_suspensions enable row level security;
drop policy if exists "agent suspensions read" on public.agent_suspensions;
create policy "agent suspensions read" on public.agent_suspensions
  for select to authenticated using (agent_id = auth.uid() or public.admin_sees_user(agent_id));
revoke insert, update, delete on public.agent_suspensions from anon, authenticated;

-- -----------------------------------------------------------------------------

create or replace function public.agent_is_suspended(p_agent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_agent and p.agent_status in ('suspended', 'banned'));
$$;
revoke all on function public.agent_is_suspended(uuid) from public, anon;
grant execute on function public.agent_is_suspended(uuid) to authenticated;

create or replace function public.admin_suspend_agent(p_agent uuid, p_reason text)
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
  if v_profile.agent_status in ('suspended', 'banned') then
    return jsonb_build_object('ok', false, 'error', 'already_suspended');
  end if;
  if v_reason is null or length(v_reason) < 3 or length(v_reason) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select coalesce(array_agg(l.id), '{}') into v_ids
    from public.listings l where l.agent_id = p_agent and l.status = 'published';
  update public.listings set status = 'paused' where id = any(v_ids);
  update public.profiles set agent_status = 'suspended' where id = p_agent;

  insert into public.agent_suspensions (agent_id, previous_status, reason, paused_listing_ids, suspended_by)
  values (p_agent, v_profile.agent_status, v_reason, v_ids, auth.uid())
  returning id into v_id;
  insert into public.agent_verifications (user_id, action, notes, acted_by)
  values (p_agent, 'suspended', v_reason, auth.uid());
  perform public.log_audit('agent.suspended', 'agent_profile', p_agent::text,
    jsonb_build_object('agent_status', v_profile.agent_status),
    jsonb_build_object('agent_status', 'suspended', 'suspension', v_id, 'listings_paused', coalesce(array_length(v_ids, 1), 0)), v_reason);
  insert into public.notifications (user_id, kind, payload, href)
  values (p_agent, 'agent.suspended', jsonb_build_object('suspension', v_id), '/dashboard');
  return jsonb_build_object('ok', true, 'suspension', v_id, 'listings_paused', coalesce(array_length(v_ids, 1), 0));
end;
$$;

create or replace function public.admin_restore_agent(p_agent uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile record;
  v_s record;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_count int := 0;
begin
  select p.id, p.agent_status, p.country_code into v_profile from public.profiles p where p.id = p_agent;
  if v_profile.id is null or not public.has_capability_in('agent.verify', v_profile.country_code) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_agent = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  select * into v_s from public.agent_suspensions s where s.agent_id = p_agent and s.restored_at is null for update;
  if v_s.id is null or v_profile.agent_status <> 'suspended' then
    return jsonb_build_object('ok', false, 'error', 'not_suspended');
  end if;
  if v_note is not null and length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long');
  end if;

  update public.profiles set agent_status = v_s.previous_status where id = p_agent;
  -- Only the listings this suspension paused, still paused and still approved.
  with back as (
    update public.listings l set status = 'published'
     where l.id = any(v_s.paused_listing_ids) and l.status = 'paused' and l.moderation_state = 'approved'
     returning 1)
  select count(*) into v_count from back;

  update public.agent_suspensions
     set restored_by = auth.uid(), restored_at = now(), restore_note = v_note, republished_count = v_count
   where id = v_s.id;
  insert into public.agent_verifications (user_id, action, notes, acted_by)
  values (p_agent, 'restored', v_note, auth.uid());
  perform public.log_audit('agent.restored', 'agent_profile', p_agent::text,
    jsonb_build_object('agent_status', 'suspended'),
    jsonb_build_object('agent_status', v_s.previous_status, 'suspension', v_s.id, 'listings_republished', v_count), v_note);
  insert into public.notifications (user_id, kind, payload, href)
  values (p_agent, 'agent.restored', jsonb_build_object('suspension', v_s.id), '/dashboard');
  return jsonb_build_object('ok', true, 'status', v_s.previous_status, 'listings_republished', v_count);
end;
$$;

revoke all on function public.admin_suspend_agent(uuid, text) from public, anon;
revoke all on function public.admin_restore_agent(uuid, text) from public, anon;
grant execute on function public.admin_suspend_agent(uuid, text) to authenticated;
grant execute on function public.admin_restore_agent(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- A suspended agent cannot write their own listings or properties.
-- -----------------------------------------------------------------------------

create or replace function public.guard_suspended_agent_writes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := case when tg_op = 'DELETE' then old.agent_id else new.agent_id end;
begin
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_owner = auth.uid() and public.agent_is_suspended(auth.uid()) then
    raise exception 'agent_suspended: your account is suspended' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_listings_suspended_agent on public.listings;
create trigger trg_listings_suspended_agent
  before insert or update or delete on public.listings
  for each row execute function public.guard_suspended_agent_writes();

drop trigger if exists trg_properties_suspended_agent on public.properties;
create trigger trg_properties_suspended_agent
  before insert or update or delete on public.properties
  for each row execute function public.guard_suspended_agent_writes();
