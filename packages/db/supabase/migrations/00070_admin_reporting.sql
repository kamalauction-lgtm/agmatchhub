-- =============================================================================
-- 00070 — Reporting for the Command Center
--
-- 00065 answers "what is true now". That is enough to run a queue and useless
-- for running a business: 41 activated agents is not a fact until you know
-- whether it was 12 or 60 last month. This adds the three shapes a reporting
-- dashboard actually needs, and nothing else:
--
--   1. A SERIES        — one row per day, so a trend can be drawn.
--   2. A COMPARISON    — this period against the one immediately before it,
--                        computed here rather than in the page, so every
--                        caller gets the same arithmetic.
--   3. A BREAKDOWN     — the same totals split by country, organisation or
--                        plan, because "which segment moved" is the first
--                        question after "did it move".
--
-- ONE DEFINITION OF ACTIVATED, STILL
--   `public.is_activated_agent()` is extracted here and used by every function
--   below AND by the existing metrics. Before this, the activation rule was
--   written out four times across 00063 and 00065; a dashboard whose activation
--   count disagrees with the rewards engine is worse than no dashboard, and
--   four copies is four chances for that to happen quietly.
--
-- DATES ARE GENERATED, NOT DERIVED FROM THE DATA
--   Each series left-joins onto generate_series. A day with no signups must
--   appear as a zero, not be missing: a chart that silently drops empty days
--   compresses a flat week into a rising line.
-- =============================================================================

/** The single definition of an activated agent: verified, with live inventory. */
create or replace function public.is_activated_agent(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles p
    join public.listings l on l.agent_id = p.id
    where p.id = p_user
      and p.agent_status = 'verified'
      and l.status = 'published'
      and l.moderation_state = 'approved'
  );
$$;

/**
 * Daily series for the dashboard chart.
 *
 * `activated_on` is the day an agent's FIRST qualifying listing went live,
 * which is the day they became activated. Counting agents who are activated
 * *today* against the day they registered would draw a curve that changes
 * shape retroactively every time somebody publishes.
 */
create or replace function public.admin_metric_series(p_days int default 30)
returns table (
  day date,
  signups int,
  verifications int,
  activations int,
  listings_published int,
  referrals int
)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(
      current_date - (greatest(p_days, 1) - 1),
      current_date,
      interval '1 day'
    )::date as day
  ),
  first_listing as (
    select l.agent_id, min(l.published_at)::date as activated_on
    from public.listings l
    join public.profiles p on p.id = l.agent_id
    where l.status = 'published'
      and l.moderation_state = 'approved'
      and l.published_at is not null
      and p.agent_status = 'verified'
    group by l.agent_id
  )
  select
    d.day,
    (select count(*)::int from public.profiles p where p.created_at::date = d.day),
    -- Verification has no dedicated timestamp; the audit trail is the only
    -- record of WHEN it happened, so it is the honest source here.
    (select count(*)::int from public.audit_logs a
      where a.created_at::date = d.day and a.action = 'agent.verified'),
    (select count(*)::int from first_listing f where f.activated_on = d.day),
    (select count(*)::int from public.listings l
      where l.status = 'published' and l.moderation_state = 'approved'
        and l.published_at::date = d.day),
    (select count(*)::int from public.referrals r
      where r.created_at::date = d.day and r.invalidated_at is null)
  from days d
  order by d.day;
$$;

/**
 * This period against the one immediately before it.
 *
 * Returns both absolute numbers, so the page can render "41 (+12)" without
 * doing arithmetic that would then differ from whatever the next screen does.
 * Percentage change is deliberately NOT returned: growth from 0 to 3 has no
 * meaningful percentage, and every dashboard that computes one ends up showing
 * an infinity symbol on its first week.
 */
create or replace function public.admin_period_comparison(p_days int default 30)
returns table (
  metric text,
  current_value int,
  previous_value int
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select
      current_date - (greatest(p_days, 1) - 1) as cur_from,
      current_date                              as cur_to,
      current_date - (greatest(p_days, 1) * 2 - 1) as prev_from,
      current_date - greatest(p_days, 1)        as prev_to
  ),
  first_listing as (
    select l.agent_id, min(l.published_at)::date as activated_on
    from public.listings l
    join public.profiles p on p.id = l.agent_id
    where l.status = 'published' and l.moderation_state = 'approved'
      and l.published_at is not null and p.agent_status = 'verified'
    group by l.agent_id
  )
  select 'signups',
    (select count(*)::int from public.profiles p, bounds b where p.created_at::date between b.cur_from and b.cur_to),
    (select count(*)::int from public.profiles p, bounds b where p.created_at::date between b.prev_from and b.prev_to)
  union all
  select 'activations',
    (select count(*)::int from first_listing f, bounds b where f.activated_on between b.cur_from and b.cur_to),
    (select count(*)::int from first_listing f, bounds b where f.activated_on between b.prev_from and b.prev_to)
  union all
  select 'listings',
    (select count(*)::int from public.listings l, bounds b
      where l.status = 'published' and l.moderation_state = 'approved'
        and l.published_at::date between b.cur_from and b.cur_to),
    (select count(*)::int from public.listings l, bounds b
      where l.status = 'published' and l.moderation_state = 'approved'
        and l.published_at::date between b.prev_from and b.prev_to)
  union all
  select 'referrals',
    (select count(*)::int from public.referrals r, bounds b
      where r.invalidated_at is null and r.created_at::date between b.cur_from and b.cur_to),
    (select count(*)::int from public.referrals r, bounds b
      where r.invalidated_at is null and r.created_at::date between b.prev_from and b.prev_to);
$$;

/**
 * The acquisition funnel, as counts of PEOPLE at each stage.
 *
 * Cumulative and nested on purpose: every activated agent is also verified and
 * also registered. A funnel whose stages are disjoint cannot show drop-off,
 * which is the only reason to draw one.
 */
create or replace function public.admin_funnel()
returns table (
  stage text,
  people int,
  -- `step`, not `position`: POSITION is a reserved function name in Postgres
  -- and a column called that is a syntax error in the RETURNS TABLE clause.
  step int
)
language sql stable security definer set search_path = public as $$
  select 'registered', (select count(*)::int from public.profiles), 1
  union all
  select 'verified',
    (select count(*)::int from public.profiles where agent_status = 'verified'), 2
  union all
  select 'has_listing',
    (select count(distinct l.agent_id)::int
       from public.listings l join public.profiles p on p.id = l.agent_id
      where p.agent_status = 'verified'), 3
  union all
  select 'activated',
    (select count(distinct l.agent_id)::int
       from public.listings l join public.profiles p on p.id = l.agent_id
      where p.agent_status = 'verified'
        and l.status = 'published' and l.moderation_state = 'approved'), 4
  order by 3;
$$;

/**
 * Totals split by one dimension.
 *
 * Country and organisation both read the AGENT record first — the same
 * coalesce 00069 had to introduce, for the same reason: the country on
 * `profiles` is populated on almost nobody, so a country breakdown built on it
 * would report one row of real data and file everyone else under "unknown".
 */
create or replace function public.admin_breakdown(p_dimension text default 'country')
returns table (
  label text,
  agents int,
  activated int,
  listings int
)
language sql stable security definer set search_path = public as $$
  with agent AS (
    select
      p.id,
      p.agent_status,
      case p_dimension
        when 'country' then coalesce(
          (select c.name from public.countries c
            where c.code = coalesce(ap.country_code, p.country_code)),
          'Unknown')
        when 'organisation' then coalesce(
          (select a.name from public.agencies a where a.id = ap.agency_id),
          nullif(btrim(ap.agency_name), ''),
          'Unaffiliated')
        when 'status' then p.agent_status
        else 'All'
      end as label
    from public.profiles p
    left join public.agent_profiles ap on ap.user_id = p.id
  )
  select
    a.label,
    count(*)::int,
    count(*) filter (where public.is_activated_agent(a.id))::int,
    coalesce(sum((
      select count(*) from public.listings l
      where l.agent_id = a.id and l.status = 'published' and l.moderation_state = 'approved'
    )), 0)::int
  from agent a
  group by a.label
  order by 2 desc, 1;
$$;

/**
 * The agents carrying the platform, by live inventory.
 *
 * Ranked on published listings rather than total listings: a hundred drafts is
 * not supply. Included because "who is actually working" is the question the
 * queues cannot answer.
 */
create or replace function public.admin_top_agents(p_limit int default 10)
returns table (
  agent_id uuid,
  display_name text,
  organisation text,
  published int,
  last_published timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    coalesce(p.display_name, '—'),
    coalesce(
      (select a.name from public.agencies a where a.id = ap.agency_id),
      nullif(btrim(ap.agency_name), ''),
      '—'),
    count(l.id)::int as published,
    max(l.published_at)
  from public.profiles p
  left join public.agent_profiles ap on ap.user_id = p.id
  join public.listings l on l.agent_id = p.id
   and l.status = 'published' and l.moderation_state = 'approved'
  group by p.id, p.display_name, ap.agency_id, ap.agency_name
  order by published desc, max(l.published_at) desc nulls last
  limit p_limit;
$$;

-- Operating data: admin-only, gated at the route like every other admin RPC.
revoke all on function public.is_activated_agent(uuid) from anon;
revoke all on function public.admin_metric_series(int) from anon, authenticated;
revoke all on function public.admin_period_comparison(int) from anon, authenticated;
revoke all on function public.admin_funnel() from anon, authenticated;
revoke all on function public.admin_breakdown(text) from anon, authenticated;
revoke all on function public.admin_top_agents(int) from anon, authenticated;

grant execute on function public.is_activated_agent(uuid) to authenticated;
grant execute on function public.admin_metric_series(int) to authenticated;
grant execute on function public.admin_period_comparison(int) to authenticated;
grant execute on function public.admin_funnel() to authenticated;
grant execute on function public.admin_breakdown(text) to authenticated;
grant execute on function public.admin_top_agents(int) to authenticated;
