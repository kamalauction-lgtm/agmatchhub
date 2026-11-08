-- =============================================================================
-- 00091 — Plan families, product names, three price lists (Decision 4)
--
-- OWNER DECISION 4 (7 Nov 2026), applied as data:
--   · three INDEPENDENT price lists — MYR, IDR, USD — no live FX
--   · default display by VERIFIED country: MY → MYR, ID → IDR, otherwise USD
--   · product names Free / Starter / Pro / Agency mapped onto the existing
--     basic / silver / gold / platinum records — the records are kept
--   · the free tier keeps its 10 AI uses
--   · FREE_LAUNCH stays until production billing is approved separately
--
-- STRUCTURE
--   plans.family       agent (default) · ai · agency · developer · enterprise
--                      — one person may hold one live subscription PER FAMILY
--   plans.product_key  the name sold (free/starter/pro/agency); the plan key
--                      stays the record's identity
--   plan_versions      now one CURRENT version per plan PER CURRENCY; version
--                      numbers count within (plan, currency); a new version
--                      inherits the plan's entitlements automatically, so a
--                      price change can never silently empty a plan
--
-- PRICES SEEDED (monthly; annual = 10 × monthly, the existing convention)
--   Free     RM 0    · Rp 0        · $ 0
--   Starter  RM 39   · Rp 149,000  · $ 10
--   Pro      RM 99   · Rp 349,000  · $ 25
--   Agency   RM 299  · Rp 999,000  · $ 79
--   IDR Pro and Agency are NEW versions (v2); v1 stays as history.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plans: family + product name
-- -----------------------------------------------------------------------------
alter table public.plans
  add column if not exists family text not null default 'agent'
    check (family in ('agent', 'ai', 'agency', 'developer', 'enterprise')),
  add column if not exists product_key text,
  add column if not exists product_name text;

create unique index if not exists idx_plans_family_product
  on public.plans (family, product_key) where product_key is not null;

update public.plans set product_key = v.pk, product_name = v.pn
from (values ('basic', 'free', 'Free'), ('silver', 'starter', 'Starter'),
             ('gold', 'pro', 'Pro'), ('platinum', 'agency', 'Agency')) as v(key, pk, pn)
where plans.key = v.key;

comment on column public.plans.product_key is
  'What the plan is SOLD as (free/starter/pro/agency). plans.key is the record identity and never changes.';

-- -----------------------------------------------------------------------------
-- 2. Plan versions: one current per plan per currency
-- -----------------------------------------------------------------------------
alter table public.plan_versions drop constraint if exists plan_versions_plan_id_version_key;
alter table public.plan_versions add constraint plan_versions_plan_currency_version_key
  unique (plan_id, currency, version);

create unique index if not exists idx_plan_versions_one_current_per_currency
  on public.plan_versions (plan_id, currency) where is_current;

/**
 * A new version inherits the entitlements of the plan's current version in
 * the same currency, else of any current version of the plan. Before this,
 * repricing through the admin screen produced a version with NO entitlements
 * — every agent on the default plan would have resolved to zero of everything.
 */
create or replace function public.plan_version_inherit_entitlements()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_from uuid;
begin
  select pv.id into v_from
  from public.plan_versions pv
  where pv.plan_id = new.plan_id and pv.id <> new.id and pv.is_current
  order by (pv.currency = new.currency) desc, pv.created_at desc
  limit 1;
  if v_from is null then return new; end if;
  insert into public.plan_entitlements (plan_version_id, entitlement_key, int_value, bool_value, tier_value)
  select new.id, pe.entitlement_key, pe.int_value, pe.bool_value, pe.tier_value
  from public.plan_entitlements pe where pe.plan_version_id = v_from
  on conflict (plan_version_id, entitlement_key) do nothing;
  return new;
end $$;

drop trigger if exists trg_plan_version_inherit on public.plan_versions;
create trigger trg_plan_version_inherit after insert on public.plan_versions
  for each row execute function public.plan_version_inherit_entitlements();

-- -----------------------------------------------------------------------------
-- 3. Seed the MYR and USD lists, and the IDR v2 for Pro and Agency
-- -----------------------------------------------------------------------------
insert into public.plan_versions (plan_id, version, currency, monthly_price, annual_price, note)
select p.id, 1, v.currency, v.monthly, v.monthly * 10, 'Owner decision D4, 7 Nov 2026'
from public.plans p
join (values
  ('basic',    'MYR',   0.00), ('silver', 'MYR',  39.00), ('gold', 'MYR',  99.00), ('platinum', 'MYR', 299.00),
  ('basic',    'USD',   0.00), ('silver', 'USD',  10.00), ('gold', 'USD',  25.00), ('platinum', 'USD',  79.00)
) as v(key, currency, monthly) on v.key = p.key
on conflict (plan_id, currency, version) do nothing;

-- IDR: Pro 299,000 → 349,000 and Agency 599,000 → 999,000 as a new version each.
with cur as (
  select pv.id, pv.plan_id, pv.version, p.key
  from public.plan_versions pv join public.plans p on p.id = pv.plan_id
  where pv.currency = 'IDR' and pv.is_current and p.key in ('gold', 'platinum')
), ins as (
  insert into public.plan_versions (plan_id, version, currency, monthly_price, annual_price, note)
  select c.plan_id, c.version + 1, 'IDR',
         case c.key when 'gold' then 349000.00 else 999000.00 end,
         case c.key when 'gold' then 3490000.00 else 9990000.00 end,
         'Owner decision D4, 7 Nov 2026'
  from cur c
  returning plan_id
)
update public.plan_versions pv set is_current = false, effective_until = now()
from cur c where pv.id = c.id;

-- -----------------------------------------------------------------------------
-- 4. Which price list a person sees
-- -----------------------------------------------------------------------------
/**
 * Decision 4: the verified country's currency when that country has a price
 * list; USD otherwise. "Verified" is the agent's status, so an unverified or
 * unknown country never picks a local list by guesswork.
 */
create or replace function public.price_currency_for(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select c.default_currency
      from public.profiles pr
      join public.countries c on c.code = pr.country_code
      where pr.id = p_user
        and pr.agent_status = 'verified'
        and exists (select 1 from public.plan_versions pv where pv.currency = c.default_currency and pv.is_current)
    ),
    'USD');
$$;

/** The plan version in force: the subscription's, else the default plan in the person's currency. */
create or replace function public.current_plan_version(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select s.plan_version_id
      from public.subscriptions s
      join public.plan_versions pv on pv.id = s.plan_version_id
      join public.plans p on p.id = pv.plan_id
      where s.user_id = p_user
        and p.family = 'agent'
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
      order by (pv.currency = public.price_currency_for(p_user)) desc,
               (pv.currency = 'USD') desc
      limit 1
    )
  );
$$;

/**
 * The catalogue one person sees: every active agent-family plan in one
 * currency, with the entitlements the current version carries — what the
 * `/plan` page and a future checkout render. No price arithmetic here; the
 * policy treatment belongs to resolve_price().
 */
create or replace function public.plan_catalogue(p_currency text)
returns table (
  plan_key text, product_key text, product_name text, name text, description text, family text, rank int,
  plan_version_id uuid, version int, currency text, monthly_price numeric, annual_price numeric,
  entitlements jsonb
) language sql stable security definer set search_path = public as $$
  select p.key, p.product_key, p.product_name, p.name, p.description, p.family, p.rank,
         pv.id, pv.version, pv.currency, pv.monthly_price, pv.annual_price,
         coalesce((
           select jsonb_object_agg(pe.entitlement_key,
                    coalesce(to_jsonb(pe.int_value), to_jsonb(pe.bool_value), to_jsonb(pe.tier_value)))
           from public.plan_entitlements pe where pe.plan_version_id = pv.id
         ), '{}'::jsonb)
  from public.plans p
  join public.plan_versions pv on pv.plan_id = p.id and pv.is_current and pv.currency = p_currency
  where p.is_active and p.family = 'agent'
  order by p.rank;
$$;

revoke all on function public.price_currency_for(uuid) from public, anon;
revoke all on function public.plan_catalogue(text) from public, anon;
grant execute on function public.price_currency_for(uuid) to authenticated;
grant execute on function public.plan_catalogue(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Subscriptions: one live subscription per person PER FAMILY
-- -----------------------------------------------------------------------------
alter table public.subscriptions add column if not exists family text not null default 'agent';

create or replace function public.subscription_set_family()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select p.family into new.family
  from public.plan_versions pv join public.plans p on p.id = pv.plan_id
  where pv.id = new.plan_version_id;
  return new;
end $$;

drop trigger if exists trg_subscription_family on public.subscriptions;
create trigger trg_subscription_family before insert or update of plan_version_id on public.subscriptions
  for each row execute function public.subscription_set_family();

update public.subscriptions s set family = p.family
from public.plan_versions pv join public.plans p on p.id = pv.plan_id
where pv.id = s.plan_version_id and s.family <> p.family;

drop index if exists public.idx_subscription_one_live_per_user;
create unique index idx_subscription_one_live_per_user_family on public.subscriptions (user_id, family)
  where status in ('trial', 'active', 'complimentary', 'grace');

comment on column public.subscriptions.family is
  'Copied from the plan by trigger. An agent plan and an AI Workforce plan may coexist; two agent plans may not.';
