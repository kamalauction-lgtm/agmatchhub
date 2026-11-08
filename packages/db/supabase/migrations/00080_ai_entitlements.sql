-- =============================================================================
-- 00080 — AI entitlements and the admin capability (Stage B, E1 · 7 Nov 2026)
--
-- Owner decisions of 7 Nov 2026 in data form:
--   D3  Hero members: 50 standard AI text tasks / month, 10 poster exports /
--       month, premium image/video/bulk credit-metered separately
--   D4  the free tier KEEPS its 10 AI uses; Basic/Silver/Gold/Platinum rows
--       stay intact and product packages map onto them
--
-- `ai.monthly_usage` already exists ("AI generations per month", 10/50/200/500)
-- and IS the standard-text-task counter; it is renamed in description only so
-- nothing that resolves it changes. Two counters are added for the things D3
-- meters separately, plus the access tier the directory reads.
-- =============================================================================

update public.entitlement_definitions
   set name = 'Standard AI text tasks', description = 'Standard AI text tasks per month (drafts, copy, scores, briefs)', unit = 'tasks/month'
 where key = 'ai.monthly_usage';

insert into public.entitlement_definitions (key, name, description, value_type, combine, unit) values
  ('ai.poster_exports_monthly', 'Poster exports',       'Template-based marketing poster exports per month', 'int',    'sum', 'exports/month'),
  ('ai.credits_monthly',        'Monthly AI credits',   'Premium AI credits granted each month (image, video, bulk, large documents)', 'credit', 'sum', 'credits'),
  ('ai.roles',                  'AI Workforce access',  'none | core | workforce',                           'tier',   'max', null)
on conflict (key) do nothing;

-- The tier ladder is a CASE inside the resolver; the two new words must rank
-- or `max` would pick arbitrarily between them. Same body as 00062 with
-- 'workforce' and 'core' added.
create or replace function public.resolve_entitlement_tier(p_user uuid, p_key text)
returns text language sql stable security definer set search_path = public as $$
  select l.tier_value
  from public.entitlement_lines(p_user, p_key) l
  where l.tier_value is not null
  order by case l.tier_value
    when 'dedicated' then 4
    when 'advanced'  then 3 when 'priority' then 3 when 'workforce' then 3
    when 'basic'     then 2 when 'standard' then 2 when 'core'      then 2
    when 'none'      then 1
    else 0 end desc
  limit 1;
$$;

-- Per current plan version. Basic keeps its 10 tasks (D4) and gets core access
-- so the free tier can actually use what it is allowed; posters start at
-- Silver. Premium credits are not granted by any plan — they are bought or
-- granted (Hero welcome credits, E8).
insert into public.plan_entitlements (plan_version_id, entitlement_key, int_value, bool_value, tier_value)
select pv.id, e.key, e.int_value, e.bool_value, e.tier_value
from public.plan_versions pv
join public.plans p on p.id = pv.plan_id
join (values
  ('basic',    'ai.poster_exports_monthly', 0,  null::boolean, null::text),
  ('basic',    'ai.roles',                  null, null, 'core'),
  ('silver',   'ai.poster_exports_monthly', 5,  null, null),
  ('silver',   'ai.roles',                  null, null, 'core'),
  ('gold',     'ai.poster_exports_monthly', 20, null, null),
  ('gold',     'ai.roles',                  null, null, 'workforce'),
  ('platinum', 'ai.poster_exports_monthly', 50, null, null),
  ('platinum', 'ai.roles',                  null, null, 'workforce')
) as e(plan_key, key, int_value, bool_value, tier_value) on e.plan_key = p.key
where pv.is_current
on conflict do nothing;

-- Who runs the AI: a capability, granted to the platform roles that already
-- configure the platform. Compliance and country admins read the ledger
-- through the audit trail, not through this.
insert into public.capabilities (key, description) values
  ('ai.manage', 'Configure AI models, prompts, caps and the Workforce catalogue; read the AI ledger')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_key)
select r.id, 'ai.manage' from public.roles r where r.key in ('super_admin', 'admin')
on conflict do nothing;
