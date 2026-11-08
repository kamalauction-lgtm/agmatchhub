-- =============================================================================
-- 00088 — AG Hero link and launch benefits (Stage B, E8 · 7 Nov 2026)
--
-- Phase 1, exactly as the owner approved on 7 Nov 2026 (Decision 2): Hero is
-- the authority; the hub asks Hero's partner API `POST /api/rens/status`
-- (scope rens:status) about the agent's OWN verified e-mail / phone, and
-- nothing else. A hit with a first login = linked. Benefits are ordinary
-- entitlement_grants with source 'hero_benefit', valued from ONE editable
-- row (hero_benefits), expiring on the date in that row (Decision 3:
-- 30 June 2027, review 1 June 2027), never hard-coded. Nothing from Hero's
-- database is copied here beyond found / login timestamps (and, when Hero
-- adds them in Phase 2, country and membership status).
-- =============================================================================

-- A new grant source; the check constraint listed them explicitly.
alter table public.entitlement_grants drop constraint if exists entitlement_grants_source_check;
alter table public.entitlement_grants add constraint entitlement_grants_source_check
  check (source in ('admin_grant', 'referral_reward', 'campaign', 'plan_bonus', 'compensation', 'hero_benefit'));

-- ---------------------------------------------------------------------------
-- The link
-- ---------------------------------------------------------------------------
create table public.hero_links (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  method                  text not null check (method in ('email', 'phone')),
  status                  text not null check (status in ('linked', 'stale', 'unlinked')),
  -- sha256 of the identifier that matched, so a re-check can prove it is the
  -- same identity without the row ever holding the identifier itself
  matched_hash            text not null,
  hero_account_created_at timestamptz,
  hero_first_login_at     timestamptz,
  hero_last_login_at      timestamptz,
  hero_country            text,          -- Phase 2 (Hero adds it to the response)
  hero_membership_status  text,          -- Phase 2
  last_result             text check (last_result in ('found', 'not_found', 'error')),
  last_error              text,
  linked_at               timestamptz,
  last_checked_at         timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger hero_links_updated_at before update on public.hero_links
  for each row execute function public.set_updated_at();
alter table public.hero_links enable row level security;
create policy "hero link own read"   on public.hero_links for select to authenticated using (user_id = auth.uid());
create policy "hero link admin read" on public.hero_links for select to authenticated using (public.has_capability('commercial.manage'));
revoke all on public.hero_links from anon;

-- ---------------------------------------------------------------------------
-- The benefit values — one row, admin-edited, read by grant_hero_benefits()
-- ---------------------------------------------------------------------------
create table public.hero_benefits (
  id                       boolean primary key default true check (id),
  enabled                  boolean not null default true,
  listing_active_limit     integer not null default 300,
  ai_monthly_usage         integer not null default 50,
  ai_poster_exports        integer not null default 10,
  matchhub_enabled         boolean not null default true,
  comarketing_enabled      boolean not null default true,
  content_studio_level     text    not null default 'advanced',
  ai_roles_tier            text    not null default 'workforce',
  expires_at               timestamptz not null default '2027-06-30 23:59:59+08',
  review_at                timestamptz not null default '2027-06-01 09:00:00+08',
  -- a re-check that cannot reach Hero keeps the benefits; one that says
  -- "not found" lets them run out this many days later, not instantly
  grace_days               integer not null default 7,
  updated_by               uuid references auth.users(id) on delete set null,
  updated_at               timestamptz not null default now()
);
insert into public.hero_benefits default values;
alter table public.hero_benefits enable row level security;
create policy "hero benefits read"  on public.hero_benefits for select to authenticated using (true);
create policy "hero benefits admin" on public.hero_benefits for update to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
revoke all on public.hero_benefits from anon;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
create or replace function public.hero_may_act_for(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or auth.uid() = p_user or public.has_capability('commercial.manage');
$$;
revoke execute on function public.hero_may_act_for(uuid) from public, anon;

/** Grant (or refresh) the launch benefits for a linked agent. Idempotent. */
create or replace function public.grant_hero_benefits(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare b public.hero_benefits%rowtype; n int := 0;
begin
  if not public.hero_may_act_for(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into b from public.hero_benefits limit 1;
  if not b.enabled or b.expires_at <= now() then return 0; end if;

  -- replace, never stack: an earlier grant for the same key is closed first
  update public.entitlement_grants
     set revoked_at = now(), revoke_reason = 'refreshed'
   where user_id = p_user and source = 'hero_benefit' and revoked_at is null;

  insert into public.entitlement_grants (user_id, entitlement_key, int_value, bool_value, tier_value, source, source_ref, reason, effective_from, effective_until)
  select p_user, v.key, v.i, v.b, v.t, 'hero_benefit', p_user, 'AG Hero launch benefit', now(), b.expires_at
  from (values
    ('listing.active_limit',       b.listing_active_limit, null::boolean, null::text),
    ('ai.monthly_usage',           b.ai_monthly_usage,     null,          null),
    ('ai.poster_exports_monthly',  b.ai_poster_exports,    null,          null),
    ('matchhub.enabled',           null,                   b.matchhub_enabled,    null),
    ('comarketing.enabled',        null,                   b.comarketing_enabled, null),
    ('content_studio.level',       null,                   null,          b.content_studio_level),
    ('ai.roles',                   null,                   null,          b.ai_roles_tier)
  ) as v(key, i, b, t)
  where v.i is not null or v.b is not null or v.t is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.grant_hero_benefits(uuid) from public, anon;

/** Let the benefits run out — now, or after the grace period. */
create or replace function public.revoke_hero_benefits(p_user uuid, p_reason text, p_grace boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare n int; g int;
begin
  if not public.hero_may_act_for(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select grace_days into g from public.hero_benefits limit 1;
  update public.entitlement_grants
     set effective_until = least(effective_until, case when p_grace then now() + make_interval(days => coalesce(g, 7)) else now() end),
         revoke_reason = coalesce(revoke_reason, p_reason)
   where user_id = p_user and source = 'hero_benefit' and revoked_at is null and effective_until > now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.revoke_hero_benefits(uuid, text, boolean) from public, anon;

/** Record what Hero answered. Called by the agent's own action or the cron. */
create or replace function public.hero_link_record(
  p_user uuid, p_method text, p_hash text, p_result text, p_account_created timestamptz,
  p_first_login timestamptz, p_last_login timestamptz, p_country text, p_membership text, p_error text
) returns text language plpgsql security definer set search_path = public as $$
declare v_status text; v_prev text;
begin
  if not public.hero_may_act_for(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select status into v_prev from public.hero_links where user_id = p_user;

  v_status := case
    when p_result = 'found' and p_first_login is not null then 'linked'
    when p_result = 'error' then coalesce(v_prev, 'stale')          -- keep last known state
    else 'stale'
  end;

  insert into public.hero_links (user_id, method, status, matched_hash, hero_account_created_at, hero_first_login_at, hero_last_login_at,
                                 hero_country, hero_membership_status, last_result, last_error, linked_at, last_checked_at)
  values (p_user, p_method, v_status, p_hash, p_account_created, p_first_login, p_last_login, p_country, p_membership, p_result, left(p_error, 200),
          case when v_status = 'linked' then now() end, now())
  on conflict (user_id) do update set
    method = excluded.method, status = excluded.status, matched_hash = excluded.matched_hash,
    hero_account_created_at = coalesce(excluded.hero_account_created_at, hero_links.hero_account_created_at),
    hero_first_login_at = coalesce(excluded.hero_first_login_at, hero_links.hero_first_login_at),
    hero_last_login_at = coalesce(excluded.hero_last_login_at, hero_links.hero_last_login_at),
    hero_country = coalesce(excluded.hero_country, hero_links.hero_country),
    hero_membership_status = coalesce(excluded.hero_membership_status, hero_links.hero_membership_status),
    last_result = excluded.last_result, last_error = excluded.last_error,
    linked_at = case when excluded.status = 'linked' and hero_links.linked_at is null then now() else hero_links.linked_at end,
    last_checked_at = now();

  if v_status = 'linked' then
    perform public.grant_hero_benefits(p_user);
  elsif p_result = 'not_found' and v_prev = 'linked' then
    perform public.revoke_hero_benefits(p_user, 'hero: not found on re-check', true);
  end if;
  return v_status;
end $$;
revoke execute on function public.hero_link_record(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text, text) from public, anon;

create or replace function public.hero_unlink(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.hero_may_act_for(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.hero_links set status = 'unlinked', last_checked_at = now() where user_id = p_user;
  perform public.revoke_hero_benefits(p_user, 'unlinked by agent', false);
end $$;
revoke execute on function public.hero_unlink(uuid) from public, anon;

comment on table public.hero_links is 'Phase 1 AG Hero identity link: found/login timestamps only. Benefits = entitlement_grants source hero_benefit, valued from hero_benefits.';
