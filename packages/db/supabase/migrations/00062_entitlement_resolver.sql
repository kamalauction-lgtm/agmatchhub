-- =============================================================================
-- 00062 — Resolving entitlements and price
--
-- Two questions, answered from data, never from a branch in application code:
--
--   resolve_entitlement(user, key)   what may this agent do, and WHY
--   resolve_price(user)              what would this agent pay, and WHY
--
-- Both return the WORKING, not just the number. An admin asked "why does this
-- agent have 355 listing slots" must get "plan 300 + referral 35 + grant 20",
-- and that has to come out of the same code path that enforces the limit —
-- otherwise the explanation drifts from the enforcement and becomes a lie.
--
-- PRECEDENCE (§9), for PRICE only:
--   1. explicit user policy      highest priority number wins
--   2. agency policy
--   3. campaign / everyone
--   4. plan base price
--
-- ENTITLEMENTS DO NOT USE PRECEDENCE. They ADD (or max, or or) according to
-- each definition's `combine` rule, because a referral bonus is meant to stack
-- on the plan rather than replace it. Conflating the two is the classic way
-- these systems start giving wrong answers.
-- =============================================================================

/**
 * The plan version currently in force for a user.
 *
 * Falls back to the configured default plan when there is no subscription
 * row, so an agent who signed up before subscriptions existed still resolves
 * to something rather than to nothing. During FREE_LAUNCH that default is
 * Platinum, which is the whole point of the growth phase.
 */
create or replace function public.current_plan_version(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select s.plan_version_id
      from public.subscriptions s
      where s.user_id = p_user
        and s.status in ('trial', 'active', 'complimentary', 'grace')
      order by s.started_at desc
      limit 1
    ),
    (
      select pv.id
      from public.plan_versions pv
      join public.plans p on p.id = pv.plan_id
      join public.commercial_settings cs on cs.id
      where p.key = cs.default_plan_key and pv.is_current
      limit 1
    )
  );
$$;

/**
 * What an agent may do, with every contributing line.
 *
 * Returns one row per SOURCE, so the caller can either sum it (enforcement) or
 * list it (the explanation screen). One function, two uses — they cannot drift.
 */
create or replace function public.entitlement_lines(p_user uuid, p_key text)
returns table (
  source text,
  label text,
  int_value int,
  bool_value boolean,
  tier_value text,
  expires_at timestamptz
)
language sql stable security definer set search_path = public as $$
  -- the plan
  select
    'plan'::text,
    p.name,
    pe.int_value,
    pe.bool_value,
    pe.tier_value,
    null::timestamptz
  from public.plan_entitlements pe
  join public.plan_versions pv on pv.id = pe.plan_version_id
  join public.plans p on p.id = pv.plan_id
  where pe.entitlement_key = p_key
    and pv.id = public.current_plan_version(p_user)

  union all

  -- grants aimed at the person, plus grants aimed at their agency
  select
    g.source,
    g.reason,
    g.int_value,
    g.bool_value,
    g.tier_value,
    g.effective_until
  from public.entitlement_grants g
  where g.entitlement_key = p_key
    and g.revoked_at is null
    and g.effective_from <= now()
    and (g.effective_until is null or g.effective_until > now())
    and (
      g.user_id = p_user
      or g.agency_id = (
        select ap.agency_id from public.agent_profiles ap where ap.user_id = p_user
      )
    );
$$;

/**
 * The single number the application enforces against.
 *
 * Combines per the definition's rule: quotas sum, tiers take the highest,
 * booleans are true if any source says true.
 */
create or replace function public.resolve_entitlement_int(p_user uuid, p_key text)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.int_value), 0)::int
  from public.entitlement_lines(p_user, p_key) l;
$$;

create or replace function public.resolve_entitlement_bool(p_user uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(bool_or(l.bool_value), false)
  from public.entitlement_lines(p_user, p_key) l;
$$;

create or replace function public.resolve_entitlement_tier(p_user uuid, p_key text)
returns text language sql stable security definer set search_path = public as $$
  -- Ordered by the tier ladder, not alphabetically: 'advanced' must beat
  -- 'basic' even though 'a' sorts first.
  select l.tier_value
  from public.entitlement_lines(p_user, p_key) l
  where l.tier_value is not null
  order by case l.tier_value
    when 'dedicated' then 4 when 'advanced' then 3 when 'priority' then 3
    when 'basic' then 2 when 'standard' then 2 when 'none' then 1 else 0 end desc
  limit 1;
$$;

/**
 * The commercial policy that applies to a user, if any.
 *
 * Precedence is priority DESC, then specificity: a policy aimed at the person
 * beats one aimed at their agency, which beats one aimed at everyone. Ties
 * break on the newest policy so a later negotiated deal supersedes an older
 * one of equal priority.
 */
create or replace function public.effective_commercial_policy(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  with agency as (
    select ap.agency_id, pr.country_code, pr.created_at
    from public.profiles pr
    left join public.agent_profiles ap on ap.user_id = pr.id
    where pr.id = p_user
  )
  select cp.id
  from public.commercial_policies cp
  join public.commercial_policy_targets t on t.policy_id = cp.id
  cross join agency a
  where cp.is_active
    and cp.effective_from <= now()
    and (cp.effective_until is null or cp.effective_until > now())
    and (
      (t.target_type = 'user'          and t.user_id = p_user)
      or (t.target_type = 'agency'     and t.agency_id is not null and t.agency_id = a.agency_id)
      or (t.target_type = 'country'    and t.country_code is not null and t.country_code = a.country_code)
      or (t.target_type = 'signup_before' and t.signup_cutoff is not null and a.created_at <  t.signup_cutoff)
      or (t.target_type = 'signup_after'  and t.signup_cutoff is not null and a.created_at >= t.signup_cutoff)
      or (t.target_type = 'everyone')
    )
  order by
    cp.priority desc,
    case t.target_type
      when 'user' then 5 when 'agency' then 4 when 'team' then 3
      when 'country' then 2 else 1 end desc,
    cp.created_at desc
  limit 1;
$$;

/**
 * What the agent would pay, and why.
 *
 * "Would" is deliberate: during FREE_LAUNCH nothing is collected, but the
 * number is still computed so SHADOW_BILLING can report projected revenue
 * without any new arithmetic being written later.
 */
create or replace function public.resolve_price(p_user uuid, p_cadence text default 'monthly')
returns table (
  plan_key text,
  plan_name text,
  currency text,
  base_price numeric,
  policy_id uuid,
  policy_name text,
  treatment text,
  effective_price numeric,
  billing_mode text
)
language sql stable security definer set search_path = public as $$
  with pv as (
    select pv.*, p.key as plan_key, p.name as plan_name
    from public.plan_versions pv
    join public.plans p on p.id = pv.plan_id
    where pv.id = public.current_plan_version(p_user)
  ),
  base as (
    select
      pv.plan_key, pv.plan_name, pv.currency,
      coalesce(case when p_cadence = 'annual' then pv.annual_price else pv.monthly_price end, 0) as amount
    from pv
  ),
  pol as (
    select cp.* from public.commercial_policies cp
    where cp.id = public.effective_commercial_policy(p_user)
  )
  select
    base.plan_key,
    base.plan_name,
    base.currency,
    base.amount,
    pol.id,
    pol.name,
    pol.treatment,
    greatest(
      0,
      case
        when pol.treatment is null              then base.amount
        when pol.treatment = 'complimentary'    then 0
        when pol.treatment = 'percent_discount' then round(base.amount * (1 - pol.percent / 100), 2)
        when pol.treatment = 'fixed_discount'   then base.amount - pol.amount
        when pol.treatment = 'fixed_price'      then pol.amount
        else base.amount
      end
    ),
    (select cs.billing_mode from public.commercial_settings cs where cs.id)
  from base
  left join pol on true;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Reading the price book is not sensitive — an agent should see what plans
-- exist. Editing any of it is commercial work and gates on 00060's capability.

alter table public.entitlement_definitions enable row level security;
alter table public.plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.entitlement_grants enable row level security;
alter table public.commercial_policies enable row level security;
alter table public.commercial_policy_targets enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.commercial_settings enable row level security;

create policy "entitlement defs readable" on public.entitlement_definitions
  for select to authenticated using (true);
create policy "plans readable" on public.plans
  for select to authenticated using (true);
create policy "plan versions readable" on public.plan_versions
  for select to authenticated using (true);
create policy "plan entitlements readable" on public.plan_entitlements
  for select to authenticated using (true);
create policy "commercial settings readable" on public.commercial_settings
  for select to authenticated using (true);

-- An agent sees their own grants and their own subscription, and nothing about
-- anyone else. Commercial policies stay admin-only: what another agency
-- negotiated is not an agent's business.
create policy "own grants readable" on public.entitlement_grants
  for select to authenticated
  using (user_id = auth.uid() or public.has_capability('commercial.manage'));

create policy "own subscription readable" on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid() or public.has_capability('commercial.manage'));

create policy "policies admin only" on public.commercial_policies
  for select to authenticated using (public.has_capability('commercial.manage'));
create policy "policy targets admin only" on public.commercial_policy_targets
  for select to authenticated using (public.has_capability('commercial.manage'));
create policy "subscription events admin only" on public.subscription_events
  for select to authenticated using (public.has_capability('commercial.manage'));

-- Writes, everywhere, are commercial.manage. Note what this means for 00060's
-- role matrix: compliance_admin does NOT hold it, so a compliance admin cannot
-- change a price — which is exactly what §7 of the spec says.
create policy "plans managed" on public.plans
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "plan versions managed" on public.plan_versions
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "plan entitlements managed" on public.plan_entitlements
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "entitlement defs managed" on public.entitlement_definitions
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "grants managed" on public.entitlement_grants
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "policies managed" on public.commercial_policies
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "policy targets managed" on public.commercial_policy_targets
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "subscriptions managed" on public.subscriptions
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "subscription events managed" on public.subscription_events
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "commercial settings managed" on public.commercial_settings
  for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));

-- Supabase grants anon everything on new tables by default. Eighth time.
revoke all on public.entitlement_definitions, public.plans, public.plan_versions,
  public.plan_entitlements, public.entitlement_grants, public.commercial_policies,
  public.commercial_policy_targets, public.subscriptions, public.subscription_events,
  public.commercial_settings from anon, authenticated;

grant select on public.entitlement_definitions, public.plans, public.plan_versions,
  public.plan_entitlements, public.commercial_settings to authenticated;
grant select, insert, update, delete on public.entitlement_grants, public.commercial_policies,
  public.commercial_policy_targets, public.subscriptions, public.subscription_events to authenticated;
grant insert, update, delete on public.plans, public.plan_versions, public.plan_entitlements,
  public.entitlement_definitions, public.commercial_settings to authenticated;

revoke all on function public.current_plan_version(uuid) from anon;
revoke all on function public.entitlement_lines(uuid, text) from anon;
revoke all on function public.resolve_entitlement_int(uuid, text) from anon;
revoke all on function public.resolve_entitlement_bool(uuid, text) from anon;
revoke all on function public.resolve_entitlement_tier(uuid, text) from anon;
revoke all on function public.effective_commercial_policy(uuid) from anon;
revoke all on function public.resolve_price(uuid, text) from anon;

grant execute on function public.current_plan_version(uuid) to authenticated;
grant execute on function public.entitlement_lines(uuid, text) to authenticated;
grant execute on function public.resolve_entitlement_int(uuid, text) to authenticated;
grant execute on function public.resolve_entitlement_bool(uuid, text) to authenticated;
grant execute on function public.resolve_entitlement_tier(uuid, text) to authenticated;
grant execute on function public.effective_commercial_policy(uuid) to authenticated;
grant execute on function public.resolve_price(uuid, text) to authenticated;
