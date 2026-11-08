-- =============================================================================
-- 00063 — Growth: campaigns, referrals, rewards
--
-- THE LOOP THIS SERVES
--   agent joins → publishes inventory → invites agents → they activate →
--   original agent earns platform capability → more agents, more listings.
--
-- WHAT "ACTIVATED" MEANS, AND WHY IT IS STRICT
--   A referral pays out only when the referred agent is VERIFIED and has one
--   APPROVED PUBLISHED listing. Rewarding a click, or a registration, or an
--   unverified account, is how a free growth campaign turns into a farm of
--   fake accounts — and the reward here is real platform capacity, which costs
--   the platform something. The definition is configurable per campaign, but
--   the default is deliberately the strict one.
--
-- REWARDS ARE NOT MONEY
--   Listing slots, boost credits, featured vouchers, recognition. No cash, no
--   multi-level payout. Direct referrals only (§26): the tree is recorded for
--   analytics, but only the immediate referrer is ever paid.
--
-- IDEMPOTENCY IS ENFORCED BY THE DATABASE, NOT BY CAREFUL CODE
--   `referral_rewards` carries a unique key on (referrer, campaign, rule). A
--   milestone therefore cannot pay twice even if the awarding job runs twice,
--   which it will.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Campaigns
-- -----------------------------------------------------------------------------

create table public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,

  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'ended')),

  -- What counts as an activated referral under THIS campaign. Data, so a
  -- future campaign can loosen or tighten it without a deploy.
  require_verified boolean not null default true,
  require_published_listing boolean not null default true,
  min_published_listings int not null default 1,

  country_code text references public.countries(code),

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_growth_campaigns_updated before update on public.growth_campaigns
  for each row execute function public.set_updated_at();

/**
 * The reward ladder, as rows.
 *
 * `threshold` is read against `metric`: activated referrals for the headcount
 * ladder, published listings across the referral network for the inventory
 * ladder (§25). Both live in one table because both pay the same way.
 */
create table public.referral_reward_rules (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.growth_campaigns(id) on delete cascade,

  metric text not null default 'activated_referrals'
    check (metric in ('activated_referrals', 'network_published_listings', 'first_activation')),
  threshold int not null,

  -- Who receives it. `referred` is how §27's double-sided welcome reward works.
  recipient text not null default 'referrer' check (recipient in ('referrer', 'referred')),

  entitlement_key text references public.entitlement_definitions(key),
  int_value int,
  -- Recognition rewards carry no entitlement, only a flag to review.
  recognition text,

  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint rule_grants_something check (entitlement_key is not null or recognition is not null)
);

create index idx_reward_rules_campaign on public.referral_reward_rules (campaign_id, metric, threshold);

-- -----------------------------------------------------------------------------
-- 2. Referral codes and the funnel
-- -----------------------------------------------------------------------------

create table public.referral_codes (
  code text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index idx_referral_code_per_user on public.referral_codes (user_id) where is_active;

/**
 * One row per referred person, carrying their furthest stage.
 *
 * Stage history lives in `referral_events` — this row is the current state, so
 * the funnel query does not have to aggregate events every time.
 */
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid references public.growth_campaigns(id),
  code text references public.referral_codes(code),

  stage text not null default 'REGISTERED' check (stage in
    ('INVITED', 'REGISTERED', 'VERIFIED', 'FIRST_LISTING', 'FIRST_PUBLISHED_LISTING', 'ACTIVATED')),
  activated_at timestamptz,

  -- Set when an admin decides the referral is not genuine. Excluded from every
  -- count, but never deleted: the fraud review needs its own history.
  invalidated_at timestamptz,
  invalidated_by uuid references auth.users(id),
  invalidate_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A person is referred once, by one person. Prevents a second referrer
  -- claiming the same agent later.
  unique (referred_id),
  -- And cannot refer themselves.
  constraint no_self_referral check (referrer_id <> referred_id)
);

create index idx_referrals_referrer on public.referrals (referrer_id, stage) where invalidated_at is null;
create trigger trg_referrals_updated before update on public.referrals
  for each row execute function public.set_updated_at();

create table public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  stage text not null,
  note text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. The reward ledger
-- -----------------------------------------------------------------------------

create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid not null references public.growth_campaigns(id) on delete cascade,
  rule_id uuid not null references public.referral_reward_rules(id) on delete cascade,
  referral_id uuid references public.referrals(id) on delete set null,

  status text not null default 'PENDING'
    check (status in ('PENDING', 'QUALIFIED', 'GRANTED', 'REVERSED', 'REJECTED')),

  entitlement_key text references public.entitlement_definitions(key),
  int_value int,
  recognition text,

  -- The grant this reward produced, so reversing the reward can revoke the
  -- capability it handed out.
  grant_id uuid references public.entitlement_grants(id) on delete set null,

  reason text,
  reversed_reason text,
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/**
 * The idempotency guarantee.
 *
 * A milestone rule pays a person once per campaign. `first_activation` rules
 * pay once per referral, so those carry the referral in the key. Expressed as
 * a constraint rather than as a check in application code, because the awarding
 * job WILL run twice — on a retry, on a double click, on two workers.
 */
create unique index idx_reward_once_per_milestone
  on public.referral_rewards (user_id, campaign_id, rule_id)
  where referral_id is null;

create unique index idx_reward_once_per_referral
  on public.referral_rewards (campaign_id, rule_id, referral_id)
  where referral_id is not null;

create index idx_rewards_user on public.referral_rewards (user_id, status);
create trigger trg_referral_rewards_updated before update on public.referral_rewards
  for each row execute function public.set_updated_at();

-- Referral points: recognition only, never spendable. Kept apart from
-- credit_wallets deliberately (§29) so nobody can confuse a leaderboard score
-- with a boost balance.
create table public.referral_points (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  points int not null default 0,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. Counting, and deciding what has been earned
-- -----------------------------------------------------------------------------

/** Genuine activated referrals — invalidated ones never count. */
create or replace function public.activated_referral_count(p_user uuid, p_campaign uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.referrals r
  where r.referrer_id = p_user
    and r.stage = 'ACTIVATED'
    and r.invalidated_at is null
    and (p_campaign is null or r.campaign_id = p_campaign);
$$;

/** Published listings created by the people this agent brought in (§25). */
create or replace function public.network_published_listings(p_user uuid, p_campaign uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.referrals r
  join public.listings l on l.agent_id = r.referred_id
  where r.referrer_id = p_user
    and r.invalidated_at is null
    and l.status = 'published'
    and l.moderation_state = 'approved'
    and (p_campaign is null or r.campaign_id = p_campaign);
$$;

/**
 * Award everything this agent has earned but not yet been given.
 *
 * Safe to call repeatedly and from anywhere — the unique indexes above make a
 * second call a no-op rather than a double payout. Returns how many rewards
 * were created so a caller can log something meaningful.
 */
create or replace function public.award_referral_rewards(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_rule record;
  v_count int;
  v_grant uuid;
  v_awarded int := 0;
begin
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
    v_count := case v_rule.metric
      when 'activated_referrals' then public.activated_referral_count(p_user, v_rule.campaign)
      else public.network_published_listings(p_user, v_rule.campaign)
    end;

    if v_count < v_rule.threshold then
      continue;
    end if;

    -- Already paid? The index would refuse the insert anyway; checking first
    -- keeps the grant from being created and orphaned.
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

/**
 * Move a referral to ACTIVATED when it genuinely qualifies, then pay.
 *
 * Called after verification and after a listing is approved. Re-entrant: a
 * referral already activated is left alone.
 */
create or replace function public.evaluate_referral(p_referred uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ref record;
  v_camp record;
  v_verified boolean;
  v_published int;
begin
  select * into v_ref from public.referrals
  where referred_id = p_referred and invalidated_at is null;
  if not found or v_ref.stage = 'ACTIVATED' then
    return false;
  end if;

  select * into v_camp from public.growth_campaigns where id = v_ref.campaign_id;

  select (p.agent_status = 'verified') into v_verified
  from public.profiles p where p.id = p_referred;

  select count(*)::int into v_published
  from public.listings l
  where l.agent_id = p_referred and l.status = 'published' and l.moderation_state = 'approved';

  -- Record the furthest stage reached even when it is short of activation, so
  -- the funnel shows where people actually stop.
  if v_published > 0 then
    update public.referrals set stage = 'FIRST_PUBLISHED_LISTING' where id = v_ref.id and stage <> 'ACTIVATED';
  elsif v_verified then
    update public.referrals set stage = 'VERIFIED' where id = v_ref.id and stage = 'REGISTERED';
  end if;

  if (v_camp.require_verified is not true or v_verified)
     and (v_camp.require_published_listing is not true or v_published >= coalesce(v_camp.min_published_listings, 1))
  then
    update public.referrals
      set stage = 'ACTIVATED', activated_at = now()
      where id = v_ref.id;
    insert into public.referral_events (referral_id, stage, note)
      values (v_ref.id, 'ACTIVATED', 'met campaign activation rule');

    perform public.award_referral_rewards(v_ref.referrer_id);
    return true;
  end if;

  return false;
end;
$$;

/**
 * Reverse a reward without losing the record of it.
 *
 * Revokes the capability it granted and marks the row REVERSED. The original
 * row stays — a reversal is history, not an erasure (§50).
 */
create or replace function public.reverse_referral_reward(p_reward uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_reward record;
begin
  if not public.has_capability('growth.manage') then
    raise exception 'not permitted to reverse rewards' using errcode = '42501';
  end if;

  select * into v_reward from public.referral_rewards where id = p_reward;
  if not found or v_reward.status = 'REVERSED' then
    return false;
  end if;

  if v_reward.grant_id is not null then
    update public.entitlement_grants
      set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
      where id = v_reward.grant_id;
  end if;

  update public.referral_rewards
    set status = 'REVERSED', reversed_reason = p_reason, decided_by = auth.uid()
    where id = p_reward;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. The growth capability, added to the matrix from 00060
-- -----------------------------------------------------------------------------

insert into public.capabilities (key, description)
values ('growth.manage', 'Referral campaigns, reward rules and reward reversal')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_key)
select r.id, 'growth.manage' from public.roles r where r.key in ('super_admin', 'admin')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
alter table public.growth_campaigns enable row level security;
alter table public.referral_reward_rules enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_events enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.referral_points enable row level security;

-- Campaigns and their ladders are public to signed-in agents: an agent has to
-- see what they are working towards, or the loop does not turn.
create policy "campaigns readable" on public.growth_campaigns
  for select to authenticated using (true);
create policy "reward rules readable" on public.referral_reward_rules
  for select to authenticated using (true);

create policy "own code readable" on public.referral_codes
  for select to authenticated
  using (user_id = auth.uid() or public.has_capability('growth.manage'));

-- An agent sees the people THEY referred, not who referred anyone else.
create policy "own referrals readable" on public.referrals
  for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid() or public.has_capability('growth.manage'));

create policy "own rewards readable" on public.referral_rewards
  for select to authenticated
  using (user_id = auth.uid() or public.has_capability('growth.manage'));

create policy "own points readable" on public.referral_points
  for select to authenticated
  using (user_id = auth.uid() or public.has_capability('growth.manage'));

create policy "referral events admin" on public.referral_events
  for select to authenticated using (public.has_capability('growth.manage'));

-- Everything that WRITES growth data is growth.manage. Agents never write
-- their own referral state: it is derived from verification and moderation,
-- which are other people's decisions.
create policy "campaigns managed" on public.growth_campaigns
  for all to authenticated
  using (public.has_capability('growth.manage')) with check (public.has_capability('growth.manage'));
create policy "reward rules managed" on public.referral_reward_rules
  for all to authenticated
  using (public.has_capability('growth.manage')) with check (public.has_capability('growth.manage'));
create policy "codes managed" on public.referral_codes
  for all to authenticated
  using (public.has_capability('growth.manage')) with check (public.has_capability('growth.manage'));
create policy "referrals managed" on public.referrals
  for all to authenticated
  using (public.has_capability('growth.manage')) with check (public.has_capability('growth.manage'));
create policy "referral events managed" on public.referral_events
  for all to authenticated
  using (public.has_capability('growth.manage')) with check (public.has_capability('growth.manage'));
create policy "rewards managed" on public.referral_rewards
  for all to authenticated
  using (public.has_capability('growth.manage')) with check (public.has_capability('growth.manage'));
create policy "points managed" on public.referral_points
  for all to authenticated
  using (public.has_capability('growth.manage')) with check (public.has_capability('growth.manage'));

revoke all on public.growth_campaigns, public.referral_reward_rules, public.referral_codes,
  public.referrals, public.referral_events, public.referral_rewards, public.referral_points
  from anon, authenticated;
grant select on public.growth_campaigns, public.referral_reward_rules, public.referral_codes,
  public.referrals, public.referral_rewards, public.referral_points to authenticated;
grant insert, update, delete on public.growth_campaigns, public.referral_reward_rules,
  public.referral_codes, public.referrals, public.referral_events, public.referral_rewards,
  public.referral_points to authenticated;

revoke all on function public.award_referral_rewards(uuid) from anon, authenticated;
revoke all on function public.evaluate_referral(uuid) from anon, authenticated;
revoke all on function public.reverse_referral_reward(uuid, text) from anon;
grant execute on function public.activated_referral_count(uuid, uuid) to authenticated;
grant execute on function public.network_published_listings(uuid, uuid) to authenticated;
grant execute on function public.reverse_referral_reward(uuid, text) to authenticated;

-- =============================================================================
-- 7. Seed: the launch campaign and its ladder (§24)
--
-- Values are INITIAL CONFIGURATION. Every threshold and amount below is a row
-- an admin can change; none of it is business logic in code.
-- =============================================================================

insert into public.growth_campaigns (key, name, description, status, country_code)
values (
  'indonesia_free_launch',
  'Indonesia Free Launch',
  'Phase 1 acquisition: agents earn platform capacity by bringing in agents who genuinely activate.',
  'active',
  'ID'
);

insert into public.referral_reward_rules
  (campaign_id, metric, threshold, recipient, entitlement_key, int_value, recognition, label)
select c.id, r.metric, r.threshold, r.recipient, r.ent, r.val, r.recog, r.label
from public.growth_campaigns c
join (values
  ('activated_referrals',          1,  'referrer', 'listing.active_limit',   5,   null, '1 activated referral'),
  ('activated_referrals',          3,  'referrer', 'listing.active_limit',   10,  null, '3 activated referrals'),
  ('activated_referrals',          3,  'referrer', 'boost.monthly_credits',  1,   null, '3 activated referrals — boost'),
  ('activated_referrals',          5,  'referrer', 'listing.active_limit',   15,  null, '5 activated referrals'),
  ('activated_referrals',          5,  'referrer', 'boost.monthly_credits',  2,   null, '5 activated referrals — boost'),
  ('activated_referrals',         10,  'referrer', 'listing.active_limit',   25,  null, '10 activated referrals'),
  ('activated_referrals',         10,  'referrer', 'featured.vouchers',      1,   null, '10 activated referrals — featured'),
  ('activated_referrals',         20,  'referrer', 'listing.active_limit',   50,  null, '20 activated referrals'),
  ('activated_referrals',         20,  'referrer', 'featured.vouchers',      3,   null, '20 activated referrals — featured'),
  ('activated_referrals',         30,  'referrer', null,                     null, 'homepage_spotlight',  '30 activated referrals — homepage spotlight'),
  ('activated_referrals',         50,  'referrer', null,                     null, 'marketing_booster',   '50 activated referrals — marketing booster'),
  ('activated_referrals',        100,  'referrer', null,                     null, 'growth_partner',      '100 activated referrals — Growth Partner'),
  ('network_published_listings', 500,  'referrer', 'featured.vouchers',      2,   null, 'Referral network reached 500 published listings'),
  ('network_published_listings',1000,  'referrer', null,                     null, 'marketing_booster_priority', 'Referral network reached 1,000 published listings'),
  -- §27: the welcome reward on the other side of the loop.
  ('first_activation',             1,  'referred', 'boost.monthly_credits',  1,   null, 'Welcome boost credit')
) as r(metric, threshold, recipient, ent, val, recog, label) on true
where c.key = 'indonesia_free_launch';
