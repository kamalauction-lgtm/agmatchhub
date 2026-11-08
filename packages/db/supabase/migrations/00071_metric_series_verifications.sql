-- =============================================================================
-- 00071 — Count verifications from the verification record, not the audit log
--
-- 00070's series counted `audit_logs.action = 'agent.verified'`. No such action
-- is ever written: the admin action logs `agent.approved`, and the decision
-- itself is recorded in `agent_verifications` with `action = 'approved'`.
--
-- So the verifications line was a flat zero that looked exactly like "nobody
-- verified anyone", which is the failure mode a chart is worst at exposing —
-- an empty series and a genuinely quiet week are the same picture.
--
-- `agent_verifications` is the right source regardless: it is the record of the
-- decision, it survives changes to how audit actions are named, and it holds
-- one row per decision rather than one row per side effect.
-- =============================================================================

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
    (select count(*)::int from public.agent_verifications v
      where v.created_at::date = d.day and v.action = 'approved'),
    (select count(*)::int from first_listing f where f.activated_on = d.day),
    (select count(*)::int from public.listings l
      where l.status = 'published' and l.moderation_state = 'approved'
        and l.published_at::date = d.day),
    (select count(*)::int from public.referrals r
      where r.created_at::date = d.day and r.invalidated_at is null)
  from days d
  order by d.day;
$$;

revoke all on function public.admin_metric_series(int) from anon, authenticated;
grant execute on function public.admin_metric_series(int) to authenticated;
