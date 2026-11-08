-- 00092 · plan_version_inherit_entitlements() copied from the NEWEST current
-- version of the plan. In a multi-row insert the AFTER ROW triggers run once
-- all rows exist, so every new version copied from a sibling that was itself
-- still empty — 00091's MYR/USD/IDR-v2 versions landed with zero entitlements
-- and the default plan resolved to nothing on staging. The source is now the
-- version that HAS entitlements (same currency preferred), and the empty
-- versions are backfilled here.

create or replace function public.plan_version_inherit_entitlements()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from uuid;
begin
  select pv.id into v_from
  from public.plan_versions pv
  where pv.plan_id = new.plan_id and pv.id <> new.id
    and exists (select 1 from public.plan_entitlements pe where pe.plan_version_id = pv.id)
  order by pv.is_current desc, (pv.currency = new.currency) desc, pv.created_at desc
  limit 1;
  if v_from is null then return new; end if;
  insert into public.plan_entitlements (plan_version_id, entitlement_key, int_value, bool_value, tier_value)
  select new.id, pe.entitlement_key, pe.int_value, pe.bool_value, pe.tier_value
  from public.plan_entitlements pe where pe.plan_version_id = v_from
  on conflict (plan_version_id, entitlement_key) do nothing;
  return new;
end $$;

-- Backfill every version that has no entitlements from its plan's best source.
insert into public.plan_entitlements (plan_version_id, entitlement_key, int_value, bool_value, tier_value)
select empty.id, pe.entitlement_key, pe.int_value, pe.bool_value, pe.tier_value
from public.plan_versions empty
join lateral (
  select pv.id
  from public.plan_versions pv
  where pv.plan_id = empty.plan_id and pv.id <> empty.id
    and exists (select 1 from public.plan_entitlements x where x.plan_version_id = pv.id)
  order by pv.is_current desc, (pv.currency = empty.currency) desc, pv.created_at desc
  limit 1
) src on true
join public.plan_entitlements pe on pe.plan_version_id = src.id
where not exists (select 1 from public.plan_entitlements e where e.plan_version_id = empty.id)
on conflict (plan_version_id, entitlement_key) do nothing;
