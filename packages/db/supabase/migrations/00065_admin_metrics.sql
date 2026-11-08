-- =============================================================================
-- 00065 — Metrics for the Command Center
--
-- The North Star for Phase 1 is ACTIVATED AGENTS WITH PUBLISHED INVENTORY, not
-- registrations and not revenue. These functions compute exactly that, in the
-- database, so the admin home does not assemble it from six queries whose
-- definitions can quietly diverge.
--
-- "Activated" here matches the referral engine's definition — verified AND at
-- least one approved published listing — because a growth dashboard that
-- counts activation differently from the reward engine is worse than no
-- dashboard: two numbers, both called activated, neither trustworthy.
-- =============================================================================

create or replace function public.admin_growth_metrics()
returns table (
  agents_total int,
  agents_verified int,
  agents_activated int,
  agents_new_today int,
  agents_new_week int,
  listings_published int,
  listings_week int,
  listings_per_activated numeric,
  referrals_total int,
  referrals_activated int,
  referral_listings int,
  rewards_granted int,
  rewards_pending int
)
language sql stable security definer set search_path = public as $$
  with activated as (
    select distinct p.id
    from public.profiles p
    join public.listings l on l.agent_id = p.id
    where p.agent_status = 'verified'
      and l.status = 'published' and l.moderation_state = 'approved'
  )
  select
    (select count(*)::int from public.profiles),
    (select count(*)::int from public.profiles where agent_status = 'verified'),
    (select count(*)::int from activated),
    (select count(*)::int from public.profiles where created_at >= current_date),
    (select count(*)::int from public.profiles where created_at >= current_date - 7),
    (select count(*)::int from public.listings where status = 'published' and moderation_state = 'approved'),
    (select count(*)::int from public.listings
      where status = 'published' and moderation_state = 'approved' and published_at >= current_date - 7),
    (select case when (select count(*) from activated) = 0 then 0
       else round(
         (select count(*)::numeric from public.listings where status = 'published' and moderation_state = 'approved')
         / (select count(*) from activated), 1)
     end),
    (select count(*)::int from public.referrals where invalidated_at is null),
    (select count(*)::int from public.referrals where stage = 'ACTIVATED' and invalidated_at is null),
    (select count(*)::int
       from public.referrals r
       join public.listings l on l.agent_id = r.referred_id
       where r.invalidated_at is null and l.status = 'published' and l.moderation_state = 'approved'),
    (select count(*)::int from public.referral_rewards where status = 'GRANTED'),
    (select count(*)::int from public.referral_rewards where status in ('PENDING', 'QUALIFIED'));
$$;

/** The queues on the admin home. Every number links to something actionable. */
create or replace function public.admin_action_queues()
returns table (
  listings_in_review int,
  agents_awaiting int,
  requests_to_approve int,
  open_reports int,
  failed_imports int,
  rewards_to_review int,
  expiring_policies int
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from public.listings where moderation_state = 'pending'),
    (select count(*)::int from public.profiles where agent_status = 'submitted'),
    (select count(*)::int from public.property_requests where status = 'pending_approval'),
    (select count(*)::int from public.violation_reports where status in ('open', 'reviewing')),
    (select count(*)::int from public.import_batches where status = 'failed'),
    (select count(*)::int from public.referral_rewards where status = 'QUALIFIED'),
    (select count(*)::int from public.commercial_policies
      where is_active and effective_until is not null
        and effective_until between now() and now() + interval '30 days');
$$;

/**
 * Signals worth a human look, never an automatic ban (§45).
 *
 * Each row is a referrer with something odd about their network. The platform
 * flags; an admin decides.
 */
create or replace function public.admin_referral_signals()
returns table (
  referrer_id uuid,
  display_name text,
  total int,
  activated int,
  same_day int,
  never_published int
)
language sql stable security definer set search_path = public as $$
  select
    r.referrer_id,
    p.display_name,
    count(*)::int,
    count(*) filter (where r.stage = 'ACTIVATED')::int,
    -- Many signups on one day from one referrer is the cheapest farming tell.
    count(*) filter (where r.created_at::date = current_date)::int,
    count(*) filter (
      where not exists (
        select 1 from public.listings l
        where l.agent_id = r.referred_id and l.status = 'published'
      )
    )::int
  from public.referrals r
  join public.profiles p on p.id = r.referrer_id
  where r.invalidated_at is null
  group by r.referrer_id, p.display_name
  having count(*) filter (where r.created_at::date = current_date) >= 5
      or (count(*) >= 5 and count(*) filter (where r.stage = 'ACTIVATED') = 0)
  order by count(*) desc
  limit 50;
$$;

/** Top growth partners, ranked by activation and inventory — never by signups. */
create or replace function public.admin_top_referrers(p_limit int default 20)
returns table (
  referrer_id uuid,
  display_name text,
  activated int,
  network_listings int,
  rewards int
)
language sql stable security definer set search_path = public as $$
  select
    r.referrer_id,
    p.display_name,
    count(*) filter (where r.stage = 'ACTIVATED')::int as activated,
    (select count(*)::int from public.referrals r2
      join public.listings l on l.agent_id = r2.referred_id
      where r2.referrer_id = r.referrer_id and r2.invalidated_at is null
        and l.status = 'published' and l.moderation_state = 'approved'),
    (select count(*)::int from public.referral_rewards rw
      where rw.user_id = r.referrer_id and rw.status = 'GRANTED')
  from public.referrals r
  join public.profiles p on p.id = r.referrer_id
  where r.invalidated_at is null
  group by r.referrer_id, p.display_name
  order by activated desc, 4 desc
  limit p_limit;
$$;

-- Metrics are admin-only: agent counts and reward totals are operating data.
revoke all on function public.admin_growth_metrics() from anon, authenticated;
revoke all on function public.admin_action_queues() from anon, authenticated;
revoke all on function public.admin_referral_signals() from anon, authenticated;
revoke all on function public.admin_top_referrers(int) from anon, authenticated;

-- Granted to authenticated, then gated in the function body's callers by
-- requireAdmin/requireCapability. SECURITY DEFINER functions cannot check RLS
-- for us, so the route is the gate — same pattern as the rest of the admin.
grant execute on function public.admin_growth_metrics() to authenticated;
grant execute on function public.admin_action_queues() to authenticated;
grant execute on function public.admin_referral_signals() to authenticated;
grant execute on function public.admin_top_referrers(int) to authenticated;
