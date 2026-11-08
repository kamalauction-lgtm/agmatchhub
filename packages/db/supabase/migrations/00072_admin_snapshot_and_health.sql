-- =============================================================================
-- 00072 — Commercial snapshot and system health for the Command Center
--
-- Two panels the redesigned dashboard asks for. Both are written to report
-- what is actually true rather than to fill a shape.
--
-- SHADOW MRR IS A PROJECTION, AND SAYS SO
--   Billing mode is FREE_LAUNCH: nobody is charged, and `resolve_price` returns
--   an effective price of zero for everyone under the launch policy. The number
--   worth showing is therefore the BASE price of what each subscriber is
--   holding — what the platform would bill if the free launch ended today.
--   Returned alongside the discounted total so the gap between them is visible,
--   because the gap is the actual size of the giveaway and somebody will ask.
--
-- HEALTH CHECKS MUST BE ABLE TO FAIL
--   A status panel where every tile is hard-coded green is worse than no panel:
--   it trains people to stop looking. Every check here is derived from data and
--   can genuinely go amber or red, and each carries the count that made it do
--   so, so "degraded" is never a mystery.
-- =============================================================================

create or replace function public.admin_commercial_snapshot()
returns table (
  billing_mode text,
  currency text,
  shadow_mrr numeric,
  charged_mrr numeric,
  active_subscriptions int,
  complimentary_subscriptions int,
  organisations_with_policy int,
  active_policies int
)
language sql stable security definer set search_path = public as $$
  with live as (
    select s.user_id, pv.currency, pv.monthly_price, s.status
    from public.subscriptions s
    join public.plan_versions pv on pv.id = s.plan_version_id
    where s.status in ('trial', 'active', 'complimentary', 'grace')
  )
  select
    (select cs.billing_mode from public.commercial_settings cs limit 1),
    -- One currency per snapshot. Mixing IDR and MYR into one total would be
    -- arithmetic that means nothing; the majority currency is reported and the
    -- day a second one matters this grows a GROUP BY rather than lying now.
    coalesce((select l.currency from live l group by l.currency order by count(*) desc limit 1), 'IDR'),
    coalesce((select sum(l.monthly_price) from live l), 0),
    -- What is actually being charged today, after every policy.
    coalesce((
      select sum(rp.effective_price)
      from live l
      cross join lateral public.resolve_price(l.user_id, 'monthly') rp
    ), 0),
    (select count(*)::int from live),
    (select count(*)::int from live where status = 'complimentary'),
    (select count(distinct t.agency_id)::int
       from public.commercial_policy_targets t
       join public.commercial_policies p on p.id = t.policy_id
      where t.agency_id is not null and p.is_active),
    (select count(*)::int from public.commercial_policies where is_active);
$$;

/**
 * Operational health, derived from real signals.
 *
 * `status` is one of ok / warn / down. The thresholds are deliberately in SQL
 * rather than in the page: an operator asking "why is this amber" should be
 * able to read the answer, and a threshold that lives in a component gets
 * copied and drifts.
 */
create or replace function public.admin_system_health()
returns table (
  check_key text,
  status text,
  detail_count int
)
language sql stable security definer set search_path = public as $$
  -- Imports: a failed batch means an agent is waiting for properties that
  -- never arrived. Any failure in the last day is worth a colour.
  select 'importer',
    case when c = 0 then 'ok' when c < 5 then 'warn' else 'down' end,
    c
  from (select count(*)::int as c from public.import_batches
        where status = 'failed' and created_at > now() - interval '1 day') x
  union all
  -- Moderation: age of the oldest thing waiting, in hours. An agent cannot
  -- earn while their listing sits here.
  select 'moderation',
    case when h is null then 'ok' when h < 24 then 'ok' when h < 72 then 'warn' else 'down' end,
    coalesce(h, 0)
  from (select extract(epoch from (now() - min(created_at)))::int / 3600 as h
        from public.listings where moderation_state = 'pending') x
  union all
  -- Verification queue, same idea: a person cannot work until this clears.
  select 'verification',
    case when h is null then 'ok' when h < 48 then 'ok' when h < 120 then 'warn' else 'down' end,
    coalesce(h, 0)
  from (select extract(epoch from (now() - min(created_at)))::int / 3600 as h
        from public.profiles where agent_status = 'submitted') x
  union all
  -- Published listings with no photograph. A marketplace listing without an
  -- image is barely a listing, and this is currently a known gap rather than a
  -- hypothetical one — which is exactly why it belongs on the dashboard.
  select 'media',
    case when c = 0 then 'ok' when c < 10 then 'warn' else 'down' end,
    c
  from (select count(*)::int as c from public.listings l
        where l.status = 'published'
          and not exists (select 1 from public.listing_media m where m.listing_id = l.id)) x
  union all
  -- Trust: open reports age badly, and nothing else on the dashboard surfaces
  -- how long they have been open.
  select 'trust',
    case when h is null then 'ok' when h < 48 then 'ok' when h < 168 then 'warn' else 'down' end,
    coalesce(h, 0)
  from (select extract(epoch from (now() - min(created_at)))::int / 3600 as h
        from public.violation_reports where status in ('open', 'reviewing')) x
  union all
  -- Growth: rewards that qualified and are waiting on a human.
  select 'rewards',
    case when c = 0 then 'ok' when c < 10 then 'warn' else 'down' end,
    c
  from (select count(*)::int as c from public.referral_rewards where status = 'QUALIFIED') x;
$$;

revoke all on function public.admin_commercial_snapshot() from anon, authenticated;
revoke all on function public.admin_system_health() from anon, authenticated;
grant execute on function public.admin_commercial_snapshot() to authenticated;
grant execute on function public.admin_system_health() to authenticated;
