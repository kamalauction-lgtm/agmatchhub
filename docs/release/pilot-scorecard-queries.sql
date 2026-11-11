-- Pilot adoption scorecard — READ-ONLY. Counts only, no personal data.
-- Run against production only with owner approval, as the migration role, inside a
-- read-only transaction. Replace the roster CTE with the five pilot agents' profile ids.
--
--   set session characteristics as transaction read only;
--
-- Column names verified against migrations 00001, 00005, 00007, 00030, 00033, 00040,
-- 00086, 00087 on 9 Nov 2026.

with roster(agent_id) as (
  values
    ('00000000-0000-0000-0000-000000000001'::uuid),
    ('00000000-0000-0000-0000-000000000002'::uuid),
    ('00000000-0000-0000-0000-000000000003'::uuid),
    ('00000000-0000-0000-0000-000000000004'::uuid),
    ('00000000-0000-0000-0000-000000000005'::uuid)
),
window_bounds as (
  select timestamptz '2026-11-10 00:00+08' as from_ts,   -- pilot day 1 (KL/Jakarta time)
         timestamptz '2026-11-17 00:00+08' as to_ts      -- day 7 end
)

-- 1. Agents onboarded: verified profiles, and days with a sign-in (auth schema).
select 'agents_verified' as metric, count(*)::int as value
from public.profiles p join roster r on r.agent_id = p.id
where p.agent_status = 'verified'

union all
select 'agents_active_3_days',
       count(*) filter (where days >= 3)::int
from (
  select u.id, count(distinct date_trunc('day', u.last_sign_in_at at time zone 'Asia/Jakarta')) as days
  from auth.users u join roster r on r.agent_id = u.id, window_bounds w
  where u.last_sign_in_at >= w.from_ts and u.last_sign_in_at < w.to_ts
  group by u.id
) s
-- Note: auth.users keeps only the LAST sign-in; "3 distinct days" cannot be derived
-- from it alone. Use the daily check-in log as the source of truth for activity and
-- keep this row as a sanity check (it will under-count).

union all
-- 2. Listings managed: created or edited by pilot agents in the window.
select 'listings_managed', count(distinct l.id)::int
from public.listings l join roster r on r.agent_id = l.agent_id, window_bounds w
where (l.created_at >= w.from_ts and l.created_at < w.to_ts)
   or (l.updated_at >= w.from_ts and l.updated_at < w.to_ts)

union all
select 'listings_published_in_window', count(*)::int
from public.listings l join roster r on r.agent_id = l.agent_id, window_bounds w
where l.published_at >= w.from_ts and l.published_at < w.to_ts

union all
-- 3. Leads handled: received vs first response set.
select 'leads_received', count(*)::int
from public.leads ld join roster r on r.agent_id = ld.agent_id, window_bounds w
where ld.created_at >= w.from_ts and ld.created_at < w.to_ts

union all
select 'leads_answered', count(*)::int
from public.leads ld join roster r on r.agent_id = ld.agent_id, window_bounds w
where ld.created_at >= w.from_ts and ld.created_at < w.to_ts
  and ld.first_responded_at is not null

union all
-- 4. MatchHub actions: pickups + requirements + submissions by pilot agents.
select 'pool_pickups', count(*)::int
from public.comarketing_engagements e join roster r on r.agent_id = e.marketing_agent_id, window_bounds w
where e.created_at >= w.from_ts and e.created_at < w.to_ts

union all
select 'requirements_posted', count(*)::int
from public.property_requests q join roster r on r.agent_id = q.requesting_agent_id, window_bounds w
where q.created_at >= w.from_ts and q.created_at < w.to_ts

union all
select 'submissions_made', count(*)::int
from public.property_submissions s join roster r on r.agent_id = s.supply_agent_id, window_bounds w
where s.created_at >= w.from_ts and s.created_at < w.to_ts

union all
-- 5. AI-assisted tasks completed (rule-based in production today).
select 'ai_reply_drafts', count(*)::int
from public.lead_events ev join roster r on r.agent_id = ev.actor_id, window_bounds w
where ev.kind = 'ai.reply_drafted'
  and ev.created_at >= w.from_ts and ev.created_at < w.to_ts

union all
select 'ai_tasks_accepted', count(*)::int
from public.agent_tasks t join roster r on r.agent_id = t.agent_id, window_bounds w
where t.source in ('ai_manager', 'secretary', 'task_extract')
  and t.created_at >= w.from_ts and t.created_at < w.to_ts

union all
select 'lead_qualifications', count(*)::int
from public.lead_intelligence li
join public.leads ld on ld.id = li.lead_id
join roster r on r.agent_id = ld.agent_id
-- lead_intelligence has no timestamp column; this counts all qualifications on
-- pilot agents' leads received in the window.
join window_bounds w on ld.created_at >= w.from_ts and ld.created_at < w.to_ts

order by 1;
