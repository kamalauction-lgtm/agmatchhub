-- =============================================================================
-- 00061 — Plans, entitlements, commercial policy, subscriptions
--
-- WHAT THIS REPLACES
--   src/config/quotas.ts:  export const MAX_ACTIVE_LISTINGS = 20;
--   Its own comment says an entitlements engine should replace it. Every
--   listing limit in the application imports that constant, so it is the one
--   thing blocking configurable plans.
--
-- THE THREE THINGS KEPT SEPARATE
--   Conflating them is how commercial systems become unexplainable:
--
--     ENTITLEMENT  what you may do        (300 listings, website enabled)
--     PRICE        what you would pay     (base price minus treatments)
--     GRANT        why you have extra     (referral bonus, admin gift)
--
--   A 100% discount changes PRICE and nothing else. A referral reward changes
--   ENTITLEMENT and nothing else. Keeping them in separate tables is what lets
--   the admin answer "why does this agent have this?" from data rather than
--   from someone's memory.
--
-- NO HARD-CODED COMMERCIAL TREATMENT
--   There is no IQI branch anywhere in this file. IQI Indonesia is one row in
--   `commercial_policies` targeting one agency, and changing it to 80% is an
--   UPDATE, not a deploy.
--
-- REUSE, NOT REPLACE
--   `agencies` is the organisation model and already exists (agent_profiles
--   .agency_id points at it). `credit_wallets` / `credit_transactions` remain
--   the only wallet. This migration adds no second authorization system: every
--   policy below gates on the capabilities from 00060.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Entitlement vocabulary
-- -----------------------------------------------------------------------------

create table public.entitlement_definitions (
  key text primary key,
  name text not null,
  description text,
  -- int    a quota that adds up (listing slots)
  -- bool   a feature that is on or off (custom domain)
  -- tier   an enum level (analytics: none|basic|advanced)
  -- credit a spendable balance topped up periodically (boost credits)
  value_type text not null check (value_type in ('int', 'bool', 'tier', 'credit')),
  -- How several sources combine. `sum` for quotas, `max` for tiers, `or` for
  -- booleans. Written down because "plan says 100, referral says +20" has to
  -- resolve the same way every time.
  combine text not null default 'sum' check (combine in ('sum', 'max', 'or', 'min')),
  unit text,
  created_at timestamptz not null default now()
);

insert into public.entitlement_definitions (key, name, description, value_type, combine, unit) values
  ('listing.active_limit',   'Active listing capacity', 'How many listings may be published at once', 'int',    'sum', 'listings'),
  ('listing.import_limit',   'Listing import allowance', 'Listings importable per month',             'int',    'sum', 'listings/month'),
  ('boost.monthly_credits',  'Monthly boost credits',   'Boost credits granted each month',           'credit', 'sum', 'credits'),
  ('featured.vouchers',      'Featured property vouchers', 'Vouchers redeemable for featured placement', 'credit', 'sum', 'vouchers'),
  ('ai.monthly_usage',       'AI allowance',            'AI generations per month',                   'int',    'sum', 'generations'),
  ('website.enabled',        'Agent website',           'Personal website is available',              'bool',   'or',  null),
  ('website.custom_domain',  'Custom domain',           'Own domain on the agent website',            'bool',   'or',  null),
  ('analytics.level',        'Analytics level',         'none | basic | advanced',                    'tier',   'max', null),
  ('content_studio.level',   'Content Studio level',    'none | basic | advanced',                    'tier',   'max', null),
  ('comarketing.enabled',    'Co-marketing',            'May offer and pick up co-marketing',         'bool',   'or',  null),
  ('matchhub.enabled',       'MatchHub',                'May use the co-broke module',                'bool',   'or',  null),
  ('support.level',          'Support level',           'standard | priority | dedicated',            'tier',   'max', null);

-- -----------------------------------------------------------------------------
-- 2. Plans, versioned
-- -----------------------------------------------------------------------------
-- Prices are NEVER overwritten (§14). A price change is a new version row, and
-- a subscription keeps the version it was sold on.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  rank int not null default 0,              -- display order, low → high
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_plans_updated before update on public.plans
  for each row execute function public.set_updated_at();

create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  version int not null,
  currency text not null default 'IDR' references public.currencies(code),
  -- numeric, never float (rule 7). Null means "not sold at this cadence".
  monthly_price numeric(12,2),
  annual_price numeric(12,2),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  is_current boolean not null default true,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (plan_id, version)
);

create index idx_plan_versions_current on public.plan_versions (plan_id, is_current);

create table public.plan_entitlements (
  plan_version_id uuid not null references public.plan_versions(id) on delete cascade,
  entitlement_key text not null references public.entitlement_definitions(key) on delete cascade,
  int_value int,
  bool_value boolean,
  tier_value text,
  primary key (plan_version_id, entitlement_key)
);

-- -----------------------------------------------------------------------------
-- 3. Grants — the "why do they have extra" table
-- -----------------------------------------------------------------------------
-- Referral rewards, admin gifts and campaign bonuses all land here, each with
-- its own source and expiry, so the explanation view can name every line.

create table public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete cascade,
  entitlement_key text not null references public.entitlement_definitions(key) on delete cascade,

  int_value int,
  bool_value boolean,
  tier_value text,

  source text not null check (source in ('admin_grant', 'referral_reward', 'campaign', 'plan_bonus', 'compensation')),
  source_ref uuid,                          -- the reward / campaign row behind it
  reason text not null,

  effective_from timestamptz not null default now(),
  effective_until timestamptz,              -- null = permanent
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoke_reason text,

  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  -- Aimed at a person or an organisation, never neither and never both.
  constraint grant_has_one_target check ((user_id is null) <> (agency_id is null))
);

create index idx_grants_user on public.entitlement_grants (user_id, entitlement_key)
  where revoked_at is null;
create index idx_grants_agency on public.entitlement_grants (agency_id, entitlement_key)
  where revoked_at is null;

comment on table public.entitlement_grants is
  'Additive entitlements from outside the plan. Never edited in place — revoke and re-grant, so history survives.';

-- -----------------------------------------------------------------------------
-- 4. Commercial policy — price treatment, nothing else
-- -----------------------------------------------------------------------------

create table public.commercial_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,

  treatment text not null check (treatment in
    ('percent_discount', 'fixed_discount', 'fixed_price', 'complimentary')),
  percent numeric(5,2) check (percent >= 0 and percent <= 100),
  amount numeric(12,2),
  currency text references public.currencies(code),

  -- Higher wins. The precedence model of §9 expressed as a number so overlaps
  -- resolve deterministically instead of by insertion order.
  priority int not null default 100,

  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  is_active boolean not null default true,

  reason text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A treatment must carry the number it needs, or it means nothing.
  constraint treatment_has_value check (
    (treatment = 'complimentary')
    or (treatment = 'percent_discount' and percent is not null)
    or (treatment in ('fixed_discount', 'fixed_price') and amount is not null)
  )
);

create trigger trg_commercial_policies_updated before update on public.commercial_policies
  for each row execute function public.set_updated_at();

/**
 * Who a policy applies to.
 *
 * One policy, many targets — so "IQI Indonesia plus these three individuals"
 * is one row in `commercial_policies` and four here, rather than four policies
 * that can drift apart.
 *
 * `team` is accepted deliberately even though no teams table exists yet: the
 * targeting vocabulary is settled now so adding teams later is a data change,
 * not a schema rewrite. A team target simply matches nobody until then.
 */
create table public.commercial_policy_targets (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.commercial_policies(id) on delete cascade,
  target_type text not null check (target_type in
    ('user', 'agency', 'team', 'country', 'campaign', 'signup_before', 'signup_after', 'everyone')),
  user_id uuid references public.profiles(id) on delete cascade,
  agency_id uuid references public.agencies(id) on delete cascade,
  team_id uuid,
  country_code text references public.countries(code),
  campaign_id uuid,
  signup_cutoff timestamptz,
  created_at timestamptz not null default now()
);

create index idx_policy_targets_user on public.commercial_policy_targets (user_id);
create index idx_policy_targets_agency on public.commercial_policy_targets (agency_id);
create index idx_policy_targets_policy on public.commercial_policy_targets (policy_id);

-- -----------------------------------------------------------------------------
-- 5. Subscriptions
-- -----------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_version_id uuid not null references public.plan_versions(id),

  status text not null default 'complimentary' check (status in
    ('trial', 'active', 'complimentary', 'paused', 'cancelled', 'expired', 'scheduled', 'grace')),
  cadence text not null default 'monthly' check (cadence in ('monthly', 'annual')),

  started_at timestamptz not null default now(),
  renews_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,

  -- Human-readable answer to "why is this person on this plan", e.g.
  -- 'Indonesia Free Launch' or 'IQI Indonesia organisation policy'.
  source_label text,
  source_policy_id uuid references public.commercial_policies(id),

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_subscription_one_live_per_user on public.subscriptions (user_id)
  where status in ('trial', 'active', 'complimentary', 'grace');
create trigger trg_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  event text not null,
  previous jsonb,
  next jsonb,
  reason text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6. Platform commercial settings — billing mode lives in data, not code
-- -----------------------------------------------------------------------------

create table public.commercial_settings (
  id boolean primary key default true check (id),         -- exactly one row
  billing_mode text not null default 'FREE_LAUNCH'
    check (billing_mode in ('FREE_LAUNCH', 'SHADOW_BILLING', 'LIVE_BILLING')),
  default_plan_key text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.commercial_settings (id, billing_mode, default_plan_key)
values (true, 'FREE_LAUNCH', 'platinum');

comment on table public.commercial_settings is
  'One row. FREE_LAUNCH means prices are computed and nobody is charged; LIVE_BILLING is never set by a migration.';

-- =============================================================================
-- 7. Seed: the four plans
--
-- Platinum keeps a REAL base price. The Rp0 that agents see comes from a
-- commercial policy on top, never from pricing the plan at zero — otherwise
-- turning monetisation on later means re-pricing every plan and losing the
-- record of what was given away.
-- =============================================================================

insert into public.plans (key, name, description, rank) values
  ('basic',    'Basic',    'Getting started',                    10),
  ('silver',   'Silver',   'For a working agent',                20),
  ('gold',     'Gold',     'For a busy agent',                   30),
  ('platinum', 'Platinum', 'Full platform, for top producers',   40);

insert into public.plan_versions (plan_id, version, currency, monthly_price, annual_price, note)
select p.id, 1, 'IDR', v.monthly, v.annual, 'Initial price book'
from public.plans p
join (values
  ('basic',     0.00,        0.00),
  ('silver',    149000.00,  1490000.00),
  ('gold',      299000.00,  2990000.00),
  ('platinum',  599000.00,  5990000.00)
) as v(key, monthly, annual) on v.key = p.key;

-- Entitlements per plan
insert into public.plan_entitlements (plan_version_id, entitlement_key, int_value, bool_value, tier_value)
select pv.id, e.key, e.int_value, e.bool_value, e.tier_value
from public.plan_versions pv
join public.plans p on p.id = pv.plan_id
join (values
  -- key,        entitlement,                int,  bool,  tier
  ('basic',    'listing.active_limit',        20,   null, null),
  ('basic',    'listing.import_limit',        20,   null, null),
  ('basic',    'boost.monthly_credits',        0,   null, null),
  ('basic',    'featured.vouchers',            0,   null, null),
  ('basic',    'ai.monthly_usage',            10,   null, null),
  ('basic',    'website.enabled',           null,  false, null),
  ('basic',    'analytics.level',           null,   null, 'basic'),
  ('basic',    'content_studio.level',      null,   null, 'basic'),
  ('basic',    'comarketing.enabled',       null,  false, null),
  ('basic',    'matchhub.enabled',          null,  false, null),
  ('basic',    'support.level',             null,   null, 'standard'),

  ('silver',   'listing.active_limit',        60,   null, null),
  ('silver',   'listing.import_limit',        60,   null, null),
  ('silver',   'boost.monthly_credits',        2,   null, null),
  ('silver',   'featured.vouchers',            0,   null, null),
  ('silver',   'ai.monthly_usage',            50,   null, null),
  ('silver',   'website.enabled',           null,   true, null),
  ('silver',   'analytics.level',           null,   null, 'basic'),
  ('silver',   'content_studio.level',      null,   null, 'basic'),
  ('silver',   'comarketing.enabled',       null,   true, null),
  ('silver',   'matchhub.enabled',          null,  false, null),
  ('silver',   'support.level',             null,   null, 'standard'),

  ('gold',     'listing.active_limit',       150,   null, null),
  ('gold',     'listing.import_limit',       150,   null, null),
  ('gold',     'boost.monthly_credits',        5,   null, null),
  ('gold',     'featured.vouchers',            1,   null, null),
  ('gold',     'ai.monthly_usage',           200,   null, null),
  ('gold',     'website.enabled',           null,   true, null),
  ('gold',     'website.custom_domain',     null,  false, null),
  ('gold',     'analytics.level',           null,   null, 'advanced'),
  ('gold',     'content_studio.level',      null,   null, 'advanced'),
  ('gold',     'comarketing.enabled',       null,   true, null),
  ('gold',     'matchhub.enabled',          null,   true, null),
  ('gold',     'support.level',             null,   null, 'priority'),

  ('platinum', 'listing.active_limit',       300,   null, null),
  ('platinum', 'listing.import_limit',       300,   null, null),
  ('platinum', 'boost.monthly_credits',       10,   null, null),
  ('platinum', 'featured.vouchers',            3,   null, null),
  ('platinum', 'ai.monthly_usage',           500,   null, null),
  ('platinum', 'website.enabled',           null,   true, null),
  ('platinum', 'website.custom_domain',     null,   true, null),
  ('platinum', 'analytics.level',           null,   null, 'advanced'),
  ('platinum', 'content_studio.level',      null,   null, 'advanced'),
  ('platinum', 'comarketing.enabled',       null,   true, null),
  ('platinum', 'matchhub.enabled',          null,   true, null),
  ('platinum', 'support.level',             null,   null, 'dedicated')
) as e(plan_key, key, int_value, bool_value, tier_value) on e.plan_key = p.key
where pv.is_current;

-- The launch treatment: Platinum for everyone, at zero, without zeroing the plan.
insert into public.commercial_policies (name, description, treatment, priority, reason)
values (
  'Indonesia Free Launch',
  'Phase 1 growth: every eligible agent gets Platinum at no charge while the platform builds inventory.',
  'complimentary',
  50,
  'Approved growth phase — acquisition before revenue'
);

insert into public.commercial_policy_targets (policy_id, target_type)
select id, 'everyone' from public.commercial_policies where name = 'Indonesia Free Launch';
