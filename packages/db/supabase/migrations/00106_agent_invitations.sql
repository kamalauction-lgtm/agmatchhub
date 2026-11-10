-- =============================================================================
-- 00106 — Agent invitations (P0-b): secure links, no admin-made passwords
--
-- Owner decision (10 Nov 2026, Option B): no new role. One capability,
-- `agent.invite`, granted to exactly these existing roles:
--     super_admin   (global)
--     admin         (global, or scoped when granted with country codes)
--     country_admin (scoped to its user_roles.country_codes)
-- compliance_admin does NOT receive it: it is the review role.
-- Role grants stay where 00060 put them: only `roles.manage` (super_admin
-- only) may write user_roles. Nothing here changes that.
--
-- THE FLOW
--   1. An admin with agent.invite FOR THE INVITATION'S COUNTRY creates it.
--      The hub generates a random token, shows the link once, and sends only
--      its SHA-256 hex digest here. The database never sees the token.
--   2. The agent registers or signs in with their own password (the normal
--      /register → verify e-mail path), opens the link, and accepts. The hub
--      hashes the token and calls redeem_agent_invitation(), which is rate
--      limited (refusals are returned, not raised, so attempts are kept), requires the signed-in e-mail to match the invitation, and
--      refuses anything revoked, expired or already redeemed.
--   3. Resend rotates the hash (the old link stops working) and extends the
--      expiry. Revoke ends a pending invitation.
--   Every create, resend, revoke and redeem — and every refused redeem — is
--   written to audit_logs by log_audit(), whose actor is auth.uid() of the
--   caller and whose actor_role is stamped from user_roles (00103).
--
-- SEPARATION OF DUTIES
--   An admin cannot approve verification of an agent they invited. Enforced
--   by triggers on profiles (agent_status → 'verified') and on
--   agent_verifications (action 'approved'), so it holds for any caller with
--   a JWT, not only the hub. Service-role / SQL sessions (no auth.uid()) are
--   the operator path and are not blocked, as in 00060's role guard.
--
-- Depends on 00060 (has_capability_in), 00103 (log_audit actor_role).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Capability and grants
-- -----------------------------------------------------------------------------

insert into public.capabilities (key, description)
values ('agent.invite', 'Create, resend and revoke agent invitations')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_key)
select r.id, 'agent.invite'
from public.roles r
where r.key in ('super_admin', 'admin', 'country_admin')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Invitations and redeem attempts
-- -----------------------------------------------------------------------------

create table public.agent_invitations (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 hex of the link token. Never the token itself.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  country_code text not null references public.countries(code),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null check (email = lower(email) and email like '%_@_%'),
  phone text,
  preferred_language text,
  agency_name text,

  status text not null default 'pending' check (status in ('pending', 'redeemed', 'revoked')),
  expires_at timestamptz not null,
  send_count int not null default 1,
  last_sent_at timestamptz not null default now(),

  -- Actor columns point at auth.users (rule 6).
  invited_by uuid not null references auth.users(id),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoke_reason text,
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agent_invitations is
  'Admin-issued agent invitations (00106). Written only through the agent_invitation_* and redeem_agent_invitation functions.';

-- One open invitation per e-mail address.
create unique index idx_agent_invitations_open_email
  on public.agent_invitations (email) where status = 'pending';
create index idx_agent_invitations_country on public.agent_invitations (country_code, status, created_at desc);
create index idx_agent_invitations_redeemed_by on public.agent_invitations (redeemed_by) where redeemed_by is not null;

create trigger trg_agent_invitations_updated
  before update on public.agent_invitations
  for each row execute function public.set_updated_at();

create table public.agent_invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,          -- 'user:<uuid>' | 'ip:<hash>'
  created_at timestamptz not null default now()
);
create index idx_agent_invitation_attempts on public.agent_invitation_attempts (bucket, created_at);

alter table public.agent_invitations enable row level security;
alter table public.agent_invitation_attempts enable row level security;

-- Read: an admin holding agent.invite for that country. Nobody else.
create policy "agent invitations scoped read" on public.agent_invitations
  for select to authenticated
  using (public.has_capability_in('agent.invite', country_code));

-- No insert/update/delete policies: every write goes through the functions
-- below, which check scope and audit. The attempts table has no policy at all.
revoke all on public.agent_invitations from anon, authenticated;
revoke all on public.agent_invitation_attempts from anon, authenticated;
grant select on public.agent_invitations to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Admin functions: create, resend, revoke
-- -----------------------------------------------------------------------------

create or replace function public.agent_invitation_create(
  p_token_hash text,
  p_country text,
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_language text default null,
  p_agency text default null,
  p_valid_days int default 7
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  if auth.uid() is null or not public.has_capability_in('agent.invite', p_country) then
    raise exception 'not permitted to invite agents in %', coalesce(p_country, 'this country')
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.countries c where c.code = p_country and c.active) then
    raise exception 'invitation_country_inactive' using errcode = '22023';
  end if;
  if p_valid_days not between 1 and 30 then
    raise exception 'invitation_validity_out_of_range' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'invitation_email_registered' using errcode = '23505';
  end if;

  insert into public.agent_invitations (token_hash, country_code, full_name, email, phone,
    preferred_language, agency_name, expires_at, invited_by)
  values (p_token_hash, p_country, trim(p_full_name), v_email, nullif(trim(p_phone), ''),
    nullif(p_language, ''), nullif(trim(p_agency), ''),
    now() + make_interval(days => p_valid_days), auth.uid())
  returning id into v_id;

  -- No e-mail, phone or token in the audit row: the invitation id leads to them
  -- for anyone allowed to see them.
  perform public.log_audit('agent_invitation.created', 'agent_invitation', v_id::text,
    null, jsonb_build_object('country_code', p_country, 'valid_days', p_valid_days));
  return v_id;
end;
$$;

create or replace function public.agent_invitation_resend(
  p_id uuid,
  p_new_token_hash text,
  p_valid_days int default 7
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.agent_invitations;
begin
  select * into v_inv from public.agent_invitations where id = p_id for update;
  if v_inv.id is null or auth.uid() is null
     or not public.has_capability_in('agent.invite', v_inv.country_code) then
    raise exception 'not permitted to resend this invitation' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = '22023';
  end if;
  if p_valid_days not between 1 and 30 then
    raise exception 'invitation_validity_out_of_range' using errcode = '22023';
  end if;

  update public.agent_invitations
     set token_hash = p_new_token_hash,          -- the previous link stops working
         expires_at = now() + make_interval(days => p_valid_days),
         send_count = send_count + 1,
         last_sent_at = now()
   where id = p_id;

  perform public.log_audit('agent_invitation.resent', 'agent_invitation', p_id::text,
    jsonb_build_object('send_count', v_inv.send_count),
    jsonb_build_object('send_count', v_inv.send_count + 1, 'valid_days', p_valid_days));
end;
$$;

create or replace function public.agent_invitation_revoke(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.agent_invitations;
begin
  select * into v_inv from public.agent_invitations where id = p_id for update;
  if v_inv.id is null or auth.uid() is null
     or not public.has_capability_in('agent.invite', v_inv.country_code) then
    raise exception 'not permitted to revoke this invitation' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = '22023';
  end if;

  update public.agent_invitations
     set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(),
         revoke_reason = nullif(trim(p_reason), '')
   where id = p_id;

  perform public.log_audit('agent_invitation.revoked', 'agent_invitation', p_id::text,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'revoked'),
    nullif(trim(p_reason), ''));
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Redemption: the one door for the invited agent
-- -----------------------------------------------------------------------------

create or replace function public.redeem_agent_invitation(p_token_hash text, p_ip_hash text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.agent_invitations;
  v_user_attempts int;
  v_ip_attempts int := 0;
begin
  -- Refusals RETURN an error instead of raising: an exception would roll back
  -- the attempt row and the audit row, and the rate limit would count nothing.
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  -- Rate limit: 10 attempts an hour per account, 30 per network. Counted
  -- before the lookup so a guessing loop is throttled whether or not it hits.
  select count(*) into v_user_attempts from public.agent_invitation_attempts
   where bucket = 'user:' || v_uid and created_at > now() - interval '1 hour';
  if p_ip_hash is not null then
    select count(*) into v_ip_attempts from public.agent_invitation_attempts
     where bucket = 'ip:' || p_ip_hash and created_at > now() - interval '1 hour';
  end if;
  if v_user_attempts >= 10 or v_ip_attempts >= 30 then
    perform public.log_audit('agent_invitation.redeem_refused', 'agent_invitation', null,
      null, null, 'rate_limited', 'denied');
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  insert into public.agent_invitation_attempts (bucket) values ('user:' || v_uid);
  if p_ip_hash is not null then
    insert into public.agent_invitation_attempts (bucket) values ('ip:' || p_ip_hash);
  end if;

  select * into v_inv from public.agent_invitations where token_hash = p_token_hash for update;

  -- One answer for unknown, revoked, redeemed and expired: the caller learns
  -- nothing about which links exist.
  if v_inv.id is null or v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    perform public.log_audit('agent_invitation.redeem_refused', 'agent_invitation', v_inv.id::text,
      null, null,
      case when v_inv.id is null then 'unknown'
           when v_inv.status <> 'pending' then v_inv.status
           else 'expired' end,
      'denied');
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is distinct from v_inv.email then
    perform public.log_audit('agent_invitation.redeem_refused', 'agent_invitation', v_inv.id::text,
      null, null, 'email_mismatch', 'denied');
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  update public.agent_invitations
     set status = 'redeemed', redeemed_by = v_uid, redeemed_at = now()
   where id = v_inv.id;

  -- The invitation's country becomes the agent's when they have none yet.
  update public.profiles
     set country_code = v_inv.country_code
   where id = v_uid and country_code is null;

  perform public.log_audit('agent_invitation.redeemed', 'agent_invitation', v_inv.id::text,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'redeemed'));

  return jsonb_build_object('ok', true, 'invitation_id', v_inv.id, 'country_code', v_inv.country_code);
end;
$$;

revoke all on function public.agent_invitation_create(text, text, text, text, text, text, text, int) from public, anon;
revoke all on function public.agent_invitation_resend(uuid, text, int) from public, anon;
revoke all on function public.agent_invitation_revoke(uuid, text) from public, anon;
revoke all on function public.redeem_agent_invitation(text, text) from public, anon;
grant execute on function public.agent_invitation_create(text, text, text, text, text, text, text, int) to authenticated;
grant execute on function public.agent_invitation_resend(uuid, text, int) to authenticated;
grant execute on function public.agent_invitation_revoke(uuid, text) to authenticated;
grant execute on function public.redeem_agent_invitation(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Separation of duties: the inviter cannot approve the invitee
-- -----------------------------------------------------------------------------

create or replace function public.invited_by_me(p_agent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.agent_invitations i
    where i.redeemed_by = p_agent and i.invited_by = auth.uid()
  );
$$;

revoke all on function public.invited_by_me(uuid) from public, anon;
grant execute on function public.invited_by_me(uuid) to authenticated;

create or replace function public.guard_invitation_separation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;                         -- operator path (service role / SQL)
  end if;
  if tg_table_name = 'profiles' then
    if new.agent_status = 'verified' and old.agent_status is distinct from 'verified'
       and public.invited_by_me(new.id) then
      raise exception 'separation_of_duties: you invited this agent, so another admin must verify them'
        using errcode = '42501';
    end if;
  elsif tg_table_name = 'agent_verifications' then
    if new.action = 'approved' and public.invited_by_me(new.user_id) then
      raise exception 'separation_of_duties: you invited this agent, so another admin must verify them'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_invitation_separation
  before update of agent_status on public.profiles
  for each row execute function public.guard_invitation_separation();

create trigger trg_agent_verifications_invitation_separation
  before insert on public.agent_verifications
  for each row execute function public.guard_invitation_separation();

-- -----------------------------------------------------------------------------
-- 6. Planned, not granted here
-- -----------------------------------------------------------------------------
-- P0-d will add `listing.import_assisted` for the same three roles
-- (super_admin, admin, country_admin). Recorded here so the two stay aligned;
-- that capability is created in P0-d's own migration, not this one.
