-- =============================================================================
-- 00066 — Feature flags and activation controls
--
-- §38 wants the growth programme switchable: referrals on or off, reward
-- issuing on or off, spotlight and booster on or off, targeted at everyone or
-- at one country, company or person.
--
-- WHAT A FLAG IS AND IS NOT
--   A flag decides whether a CAPABILITY OF THE PRODUCT is available. It never
--   decides whether a PERSON is allowed to do something — that is authorization,
--   it lives in `role_capabilities` (00060), and §43 is explicit that flags must
--   not replace it. The distinction matters when somebody eventually asks "can
--   we just flag this off for that user": turning a feature off for an
--   individual is a product decision; stopping them from doing something they
--   should not do is a permission, and a flag is the wrong tool for it.
--
-- OFF WINS
--   A flag that is globally disabled is off for everyone, regardless of
--   targeting. Targeting narrows an ENABLED flag; it cannot re-enable a
--   disabled one. The alternative — targets overriding the master switch —
--   makes "turn this off" a question rather than an answer, which is the
--   opposite of what a kill switch is for.
-- =============================================================================

create table public.feature_flags (
  key text primary key,
  name text not null,
  description text,
  enabled boolean not null default true,
  -- When false the flag applies to everyone it is enabled for. When true it
  -- applies ONLY to the rows in feature_flag_targets.
  targeted boolean not null default false,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_feature_flags_updated before update on public.feature_flags
  for each row execute function public.set_updated_at();

create table public.feature_flag_targets (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null references public.feature_flags(key) on delete cascade,
  target_type text not null check (target_type in ('user', 'agency', 'country', 'campaign')),
  user_id uuid references public.profiles(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete cascade,
  country_code text references public.countries(code),
  campaign_id uuid references public.growth_campaigns(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_flag_targets_key on public.feature_flag_targets (flag_key);

/**
 * Is this feature on for this person?
 *
 * `p_user` may be null for a global check ("are referrals on at all"), which is
 * what a background job or a marketing page needs.
 */
create or replace function public.is_feature_enabled(p_key text, p_user uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  with flag as (
    select * from public.feature_flags where key = p_key
  ),
  who as (
    select ap.agency_id, pr.country_code
    from public.profiles pr
    left join public.agent_profiles ap on ap.user_id = pr.id
    where pr.id = p_user
  )
  select case
    -- An unknown key is OFF. A typo must not silently enable something.
    when not exists (select 1 from flag) then false
    when not (select enabled from flag) then false
    when not (select targeted from flag) then true
    when p_user is null then false          -- targeted flag, nobody to match
    else exists (
      select 1
      from public.feature_flag_targets t
      left join who w on true
      where t.flag_key = p_key
        and (
          (t.target_type = 'user'    and t.user_id = p_user)
          or (t.target_type = 'agency'  and t.agency_id is not null and t.agency_id = w.agency_id)
          or (t.target_type = 'country' and t.country_code is not null and t.country_code = w.country_code)
        )
    )
  end;
$$;

insert into public.feature_flags (key, name, description, enabled) values
  ('referrals',            'Referral programme',      'The referral loop as a whole', true),
  ('referral_registration','Referral sign-ups',       'New accounts may be attributed to a referrer', true),
  ('reward_issuing',       'Reward issuing',          'Milestones actually pay out', true),
  ('featured_rewards',     'Featured vouchers',       'Featured property vouchers may be earned', true),
  ('homepage_spotlight',   'Homepage spotlight',      'Agent spotlight eligibility', true),
  ('marketing_booster',    'Marketing Booster',       'Marketing Booster eligibility', true),
  ('listing_import',       'Portal import',           'Importing listings from other portals', true),
  ('comarketing',          'Co-marketing',            'Listing collaboration between agents', true),
  ('matchhub',             'MatchHub',                'Private co-broke requirements', true),
  ('paid_boosts',          'Paid boosts',             'Spending credits to boost a listing', true),
  ('new_registrations',    'New registrations',       'Whether anyone new may sign up', true),
  ('ai_features',          'AI features',             'AI-assisted content and advice', true),
  ('custom_domains',       'Custom domains',          'Agent websites on their own domain', false),
  ('payments',             'Payments',                'Payment collection. Off until billing goes live.', false);

-- -----------------------------------------------------------------------------
-- Honour the flags inside the referral engine
-- -----------------------------------------------------------------------------
-- A flag nothing reads is decoration. These two are the switches §38 actually
-- asks for, so the engine checks them at the two points where it acts.

create or replace function public.attach_referral(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_referrer uuid;
  v_campaign uuid;
  v_age interval;
begin
  if v_user is null or p_code is null or btrim(p_code) = '' then
    return false;
  end if;

  -- Both switches: the programme as a whole, and attribution specifically.
  if not public.is_feature_enabled('referrals')
     or not public.is_feature_enabled('referral_registration') then
    return false;
  end if;

  select user_id into v_referrer from public.referral_codes
  where code = upper(btrim(p_code)) and is_active;
  if v_referrer is null or v_referrer = v_user then
    return false;
  end if;

  if exists (select 1 from public.referrals where referred_id = v_user) then
    return false;
  end if;

  select now() - created_at into v_age from public.profiles where id = v_user;
  if v_age is null or v_age > interval '10 minutes' then
    return false;
  end if;

  select id into v_campaign from public.growth_campaigns
  where status = 'active' and starts_at <= now()
    and (ends_at is null or ends_at > now())
  order by starts_at desc limit 1;

  insert into public.referrals (referrer_id, referred_id, campaign_id, code, stage)
  values (v_referrer, v_user, v_campaign, upper(btrim(p_code)), 'REGISTERED');

  insert into public.referral_events (referral_id, stage, note)
  select id, 'REGISTERED', 'signed up with code ' || upper(btrim(p_code))
  from public.referrals where referred_id = v_user;

  return true;
end;
$$;

create or replace function public.award_referral_rewards(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_rule record;
  v_count int;
  v_grant uuid;
  v_awarded int := 0;
begin
  /* The kill switch for payouts. Referrals keep being tracked and the funnel
   * keeps filling — only the granting stops, so turning it back on pays out
   * everything earned in between rather than losing it. */
  if not public.is_feature_enabled('reward_issuing') then
    return 0;
  end if;

  for v_rule in
    select rr.*, gc.id as campaign
    from public.referral_reward_rules rr
    join public.growth_campaigns gc on gc.id = rr.campaign_id
    where rr.is_active
      and gc.status = 'active'
      and gc.starts_at <= now()
      and (gc.ends_at is null or gc.ends_at > now())
      and rr.recipient = 'referrer'
      and rr.metric in ('activated_referrals', 'network_published_listings')
  loop
    -- Featured vouchers have their own switch (§38).
    if v_rule.entitlement_key = 'featured.vouchers'
       and not public.is_feature_enabled('featured_rewards') then
      continue;
    end if;

    v_count := case v_rule.metric
      when 'activated_referrals' then public.activated_referral_count(p_user, v_rule.campaign)
      else public.network_published_listings(p_user, v_rule.campaign)
    end;

    if v_count < v_rule.threshold then
      continue;
    end if;

    if exists (
      select 1 from public.referral_rewards x
      where x.user_id = p_user and x.campaign_id = v_rule.campaign
        and x.rule_id = v_rule.id and x.referral_id is null
    ) then
      continue;
    end if;

    v_grant := null;
    if v_rule.entitlement_key is not null then
      insert into public.entitlement_grants
        (user_id, entitlement_key, int_value, source, reason)
      values
        (p_user, v_rule.entitlement_key, v_rule.int_value, 'referral_reward', v_rule.label)
      returning id into v_grant;
    end if;

    insert into public.referral_rewards
      (user_id, campaign_id, rule_id, status, entitlement_key, int_value, recognition, grant_id, reason)
    values
      (p_user, v_rule.campaign, v_rule.id,
       case when v_rule.recognition is not null then 'QUALIFIED' else 'GRANTED' end,
       v_rule.entitlement_key, v_rule.int_value, v_rule.recognition, v_grant, v_rule.label);

    v_awarded := v_awarded + 1;
  end loop;

  return v_awarded;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.feature_flags enable row level security;
alter table public.feature_flag_targets enable row level security;

-- Readable by any signed-in user: the app has to check them on every render,
-- and which features exist is not a secret.
create policy "flags readable" on public.feature_flags
  for select to authenticated using (true);
create policy "flag targets readable" on public.feature_flag_targets
  for select to authenticated using (true);

create policy "flags managed" on public.feature_flags
  for all to authenticated
  using (public.has_capability('platform.configure'))
  with check (public.has_capability('platform.configure'));
create policy "flag targets managed" on public.feature_flag_targets
  for all to authenticated
  using (public.has_capability('platform.configure'))
  with check (public.has_capability('platform.configure'));

revoke all on public.feature_flags, public.feature_flag_targets from anon, authenticated;
grant select on public.feature_flags, public.feature_flag_targets to authenticated;
grant insert, update, delete on public.feature_flags, public.feature_flag_targets to authenticated;

revoke all on function public.is_feature_enabled(text, uuid) from anon;
grant execute on function public.is_feature_enabled(text, uuid) to authenticated;
