-- =============================================================================
-- 00094 — Payments scaffold (Stage B, E11 · 8 Nov 2026)
--
-- OWNER DECISION 8 (7 Nov 2026): Billplz (FPX) for Malaysia, Midtrans
-- (QRIS / virtual account) for Indonesia, Stripe for USD — behind ONE billing
-- system with provider adapters. Live charging stays disabled until it is
-- approved separately; FREE_LAUNCH (00061) is untouched by this file.
--
-- WHAT THIS IS
--   payment_providers   the registry: which gateway serves which currency and
--                       in which MODE — off (default) · sandbox · live. A row
--                       can only be set to 'live' while billing_mode is
--                       LIVE_BILLING, enforced by trigger, so no sequence of
--                       admin clicks reaches a live charge under FREE_LAUNCH.
--   credit_packs        what a top-up buys (so many credits of one kind) and
--   credit_pack_prices  what it costs per currency — one list per currency,
--                       like plans (Decision 4). Seeded WITHOUT prices: the
--                       owner has not priced credits; an unpriced pack is not
--                       offered.
--   payment_intents     one row per attempt to pay: who, for what (a plan
--                       version + cadence, or a pack), how much in which
--                       currency, with which provider, in which mode. Created
--                       ONLY through payment_intent_create() — the agent never
--                       writes the amount. Human id PAY-2026-000001.
--   payment_events      every webhook the gateway sent, verified or not,
--                       append-only, idempotent on the provider's event id.
--                       Service-only.
--   payment_intent_settle()  the ONE place money becomes entitlement: a paid
--                       intent cancels the live agent-family subscription and
--                       starts the bought one (subscription_events written), or
--                       grants the pack's credits through credit_grant()
--                       (00090). Idempotent: a webhook delivered twice settles
--                       once. Amount and currency must match the intent.
--
-- WHAT THIS IS NOT
--   Nothing here calls a gateway; the adapters in apps/hub/src/lib/payments
--   do, and only when the provider row's mode says so and the matching keys
--   are present as Worker secrets. No key is stored in the database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Provider registry
-- -----------------------------------------------------------------------------
create table public.payment_providers (
  key         text primary key check (key in ('billplz', 'midtrans', 'stripe')),
  name        text not null,
  currency    text not null,                      -- the ONE currency this provider collects for us
  countries   text[] not null default '{}',
  methods     text[] not null default '{}',       -- fpx · qris · va · card — display only
  mode        text not null default 'off' check (mode in ('off', 'sandbox', 'live')),
  is_active   boolean not null default true,
  settings    jsonb not null default '{}'::jsonb, -- non-secret knobs only (e.g. Midtrans enabled_payments)
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create unique index idx_payment_providers_currency on public.payment_providers (currency) where is_active;

insert into public.payment_providers (key, name, currency, countries, methods) values
  ('billplz',  'Billplz',  'MYR', '{MY}', '{fpx}'),
  ('midtrans', 'Midtrans', 'IDR', '{ID}', '{qris,va}'),
  ('stripe',   'Stripe',   'USD', '{}',   '{card}');

/**
 * A live gateway and a free launch cannot both be true. The admin screen
 * refuses it too, but the database is the thing that cannot be bypassed.
 */
create or replace function public.payment_provider_mode_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_mode text;
begin
  if new.mode = 'live' then
    select billing_mode into v_mode from public.commercial_settings where id;
    if coalesce(v_mode, 'FREE_LAUNCH') <> 'LIVE_BILLING' then
      raise exception 'a provider can only go live while billing mode is LIVE_BILLING (it is %)', coalesce(v_mode, 'FREE_LAUNCH')
        using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_payment_provider_mode before insert or update on public.payment_providers
  for each row execute function public.payment_provider_mode_guard();

alter table public.payment_providers enable row level security;
-- Agents may read the registry (no secrets in it): /plan needs to know whether
-- a gateway serves their currency at all.
create policy "payment providers readable" on public.payment_providers
  for select to authenticated using (true);
create policy "payment providers managed" on public.payment_providers
  for update to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
revoke all on public.payment_providers from anon, authenticated;
grant select, update on public.payment_providers to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Credit packs and their per-currency prices
-- -----------------------------------------------------------------------------
create table public.credit_packs (
  key        text primary key,
  kind       text not null check (kind in ('boost', 'ai')),
  credits    integer not null check (credits > 0),
  name       text not null,
  rank       integer not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.credit_pack_prices (
  pack_key   text not null references public.credit_packs(key) on delete cascade,
  currency   text not null,
  price      numeric(14,2) not null check (price >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (pack_key, currency)
);

insert into public.credit_packs (key, kind, credits, name, rank) values
  ('ai_25',    'ai',    25,  'AI credits ×25',    10),
  ('ai_100',   'ai',    100, 'AI credits ×100',   20),
  ('boost_10', 'boost', 10,  'Boost credits ×10', 30),
  ('boost_30', 'boost', 30,  'Boost credits ×30', 40);
-- No prices seeded on purpose: the owner has not priced credits (Decision 3
-- names what is credit-metered, not what a credit costs). /admin/commercial
-- prices a pack per currency; until then the pack is not offered.

alter table public.credit_packs enable row level security;
alter table public.credit_pack_prices enable row level security;
create policy "credit packs readable" on public.credit_packs for select to authenticated using (true);
create policy "credit pack prices readable" on public.credit_pack_prices for select to authenticated using (true);
create policy "credit packs managed" on public.credit_packs for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
create policy "credit pack prices managed" on public.credit_pack_prices for all to authenticated
  using (public.has_capability('commercial.manage')) with check (public.has_capability('commercial.manage'));
revoke all on public.credit_packs, public.credit_pack_prices from anon, authenticated;
grant select, insert, update, delete on public.credit_packs, public.credit_pack_prices to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Intents
-- -----------------------------------------------------------------------------
create table public.payment_intents (
  id                uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique default public.next_human_id('PAY'),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  provider_key      text not null references public.payment_providers(key),
  mode              text not null check (mode in ('sandbox', 'live')),
  kind              text not null check (kind in ('subscription', 'topup')),
  plan_version_id   uuid references public.plan_versions(id),
  cadence           text check (cadence in ('monthly', 'annual')),
  pack_key          text references public.credit_packs(key),
  currency          text not null,
  amount            numeric(14,2) not null check (amount > 0),
  status            text not null default 'created'
    check (status in ('created', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
  provider_ref      text,                 -- bill id / order id / session id at the gateway
  checkout_url      text,
  failure_reason    text,
  expires_at        timestamptz not null default now() + interval '24 hours',
  paid_at           timestamptz,
  fulfilled_at      timestamptz,
  subscription_id   uuid references public.subscriptions(id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((kind = 'subscription' and plan_version_id is not null and cadence is not null and pack_key is null)
      or (kind = 'topup' and pack_key is not null and plan_version_id is null))
);
create unique index idx_payment_intents_provider_ref on public.payment_intents (provider_key, provider_ref) where provider_ref is not null;
create index idx_payment_intents_user on public.payment_intents (user_id, created_at desc);
create index idx_payment_intents_open on public.payment_intents (expires_at) where status in ('created', 'pending');
create trigger payment_intents_updated_at before update on public.payment_intents
  for each row execute function public.set_updated_at();

alter table public.payment_intents enable row level security;
create policy "payment intents own read" on public.payment_intents
  for select to authenticated using (user_id = auth.uid());
create policy "payment intents admin read" on public.payment_intents
  for select to authenticated using (public.has_capability('commercial.manage'));
-- No insert/update policy for anyone: every write goes through the functions below.
revoke all on public.payment_intents from anon, authenticated;
grant select on public.payment_intents to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Webhook events — append-only, service-only
-- -----------------------------------------------------------------------------
create table public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  provider_key      text not null references public.payment_providers(key),
  provider_event_id text,                 -- the gateway's own id for this delivery, when it has one
  intent_id         uuid references public.payment_intents(id) on delete set null,
  event_type        text not null,
  signature_valid   boolean not null,
  amount            numeric(14,2),
  currency          text,
  payload           jsonb,                -- as received, minus anything the adapter redacts
  outcome           text not null,        -- what settle() said, or why nothing happened
  received_at       timestamptz not null default now()
);
create unique index idx_payment_events_provider_event on public.payment_events (provider_key, provider_event_id)
  where provider_event_id is not null;
create index idx_payment_events_intent on public.payment_events (intent_id, received_at desc);

alter table public.payment_events enable row level security;
create policy "payment events admin read" on public.payment_events
  for select to authenticated using (public.has_capability('commercial.manage'));
revoke all on public.payment_events from anon, authenticated;
grant select on public.payment_events to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Functions
-- -----------------------------------------------------------------------------

/** The gateway that collects in this person's currency, if any is switched on. */
create or replace function public.payment_provider_for(p_user uuid)
returns table (key text, name text, mode text, methods text[], currency text)
language sql stable security definer set search_path = public as $$
  select pp.key, pp.name, pp.mode, pp.methods, pp.currency
  from public.payment_providers pp
  where pp.is_active and pp.mode <> 'off'
    and pp.currency = public.price_currency_for(p_user)
  limit 1;
$$;

/**
 * The agent asks to pay for something. The function decides the amount from
 * the price lists; the caller only names WHAT. Refused when: payments flag off
 * for this person; no switched-on gateway for their currency; the plan version
 * is not a current agent plan in their currency; the pack has no price in
 * their currency; the amount is zero (nothing to pay — during the free launch
 * the policy, not this function, is what makes things free); a live gateway
 * while billing is not LIVE_BILLING.
 */
create or replace function public.payment_intent_create(
  p_kind text, p_plan_version_id uuid default null, p_cadence text default 'monthly', p_pack_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_prov public.payment_providers%rowtype;
  v_billing text;
  v_currency text;
  v_amount numeric(14,2);
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not public.is_feature_enabled('payments', v_user) then
    raise exception 'payments are not enabled for this account' using errcode = 'P0001';
  end if;

  v_currency := public.price_currency_for(v_user);
  select * into v_prov from public.payment_providers pp
   where pp.is_active and pp.mode <> 'off' and pp.currency = v_currency;
  if v_prov.key is null then
    raise exception 'no payment provider for %', v_currency using errcode = 'P0001';
  end if;
  select billing_mode into v_billing from public.commercial_settings where id;
  if v_prov.mode = 'live' and coalesce(v_billing, 'FREE_LAUNCH') <> 'LIVE_BILLING' then
    raise exception 'live payments need LIVE_BILLING' using errcode = 'P0001';
  end if;

  if p_kind = 'subscription' then
    if p_cadence not in ('monthly', 'annual') then raise exception 'bad cadence'; end if;
    select case when p_cadence = 'annual' then pv.annual_price else pv.monthly_price end
      into v_amount
    from public.plan_versions pv join public.plans p on p.id = pv.plan_id
    where pv.id = p_plan_version_id and pv.is_current and pv.currency = v_currency
      and p.is_active and p.family = 'agent';
    if v_amount is null then
      raise exception 'not a current agent plan in %', v_currency using errcode = 'P0001';
    end if;
  elsif p_kind = 'topup' then
    select cpp.price into v_amount
    from public.credit_packs cp join public.credit_pack_prices cpp on cpp.pack_key = cp.key
    where cp.key = p_pack_key and cp.is_active and cpp.currency = v_currency;
    if v_amount is null then
      raise exception 'pack % is not priced in %', p_pack_key, v_currency using errcode = 'P0001';
    end if;
  else
    raise exception 'bad kind %', p_kind;
  end if;

  if v_amount <= 0 then raise exception 'nothing to pay' using errcode = 'P0001'; end if;

  insert into public.payment_intents (user_id, provider_key, mode, kind, plan_version_id, cadence, pack_key, currency, amount)
  values (v_user, v_prov.key, v_prov.mode, p_kind,
          case when p_kind = 'subscription' then p_plan_version_id end,
          case when p_kind = 'subscription' then p_cadence end,
          case when p_kind = 'topup' then p_pack_key end,
          v_currency, v_amount)
  returning id into v_id;

  perform public.log_audit('payment.intent_created', 'payment_intent', v_id::text, null,
    jsonb_build_object('kind', p_kind, 'provider', v_prov.key, 'mode', v_prov.mode, 'currency', v_currency, 'amount', v_amount,
                       'plan_version', p_plan_version_id, 'cadence', p_cadence, 'pack', p_pack_key), null, 'success');
  return v_id;
end $$;

/** The owner abandons an attempt that has not been paid. */
create or replace function public.payment_intent_cancel(p_intent uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.payment_intents
     set status = 'cancelled'
   where id = p_intent and user_id = auth.uid() and status in ('created', 'pending');
  get diagnostics n = row_count;
  return n > 0;
end $$;

/** Service only: the adapter created the checkout at the gateway (or could not). */
create or replace function public.payment_intent_checkout(
  p_intent uuid, p_provider_ref text, p_checkout_url text, p_failure text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'service only' using errcode = '42501'; end if;
  if p_failure is not null then
    update public.payment_intents set status = 'failed', failure_reason = left(p_failure, 200)
     where id = p_intent and status in ('created', 'pending');
  else
    update public.payment_intents set status = 'pending', provider_ref = p_provider_ref, checkout_url = p_checkout_url
     where id = p_intent and status = 'created';
  end if;
end $$;

/**
 * Service only — the webhook's verdict. Returns what happened:
 *   paid · already_paid · amount_mismatch · failed · expired · refunded ·
 *   cancelled · not_pending (a terminal row told something new) · unknown
 * 'paid' is the only outcome that changes entitlements, and it happens once.
 */
create or replace function public.payment_intent_settle(
  p_intent uuid, p_status text, p_amount numeric, p_currency text, p_provider_ref text default null, p_paid_at timestamptz default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  i public.payment_intents%rowtype;
  v_pack public.credit_packs%rowtype;
  v_sub uuid;
  v_old record;
  v_label text;
begin
  if auth.uid() is not null then raise exception 'service only' using errcode = '42501'; end if;
  select * into i from public.payment_intents where id = p_intent for update;
  if i.id is null then return 'unknown'; end if;

  if p_status = 'paid' then
    if i.status = 'paid' then return 'already_paid'; end if;
    if i.status not in ('created', 'pending') then return 'not_pending'; end if;
    if p_amount is distinct from i.amount or upper(coalesce(p_currency, '')) <> i.currency then
      update public.payment_intents set failure_reason = format('amount mismatch: %s %s vs %s %s', p_currency, p_amount, i.currency, i.amount)
       where id = i.id;
      perform public.log_audit('payment.amount_mismatch', 'payment_intent', i.id::text, null,
        jsonb_build_object('expected', i.amount, 'currency', i.currency, 'got', p_amount, 'got_currency', p_currency), null, 'failure');
      return 'amount_mismatch';
    end if;

    v_label := 'Paid via ' || i.provider_key || case when i.mode = 'sandbox' then ' (sandbox)' else '' end
               || ' · ' || i.human_readable_id;

    if i.kind = 'subscription' then
      -- One live agent-family subscription per person (00091): close what is
      -- there, start the bought one, write both events.
      for v_old in
        select s.id, s.plan_version_id, s.status from public.subscriptions s
        where s.user_id = i.user_id and s.family = 'agent' and s.status in ('trial', 'active', 'complimentary', 'grace')
      loop
        update public.subscriptions set status = 'cancelled', cancelled_at = now() where id = v_old.id;
        insert into public.subscription_events (subscription_id, event, previous, next, reason, actor_id)
        values (v_old.id, 'replaced', jsonb_build_object('status', v_old.status, 'plan_version_id', v_old.plan_version_id),
                jsonb_build_object('status', 'cancelled'), 'replaced by ' || i.human_readable_id, null);
      end loop;
      insert into public.subscriptions (user_id, plan_version_id, status, cadence, started_at, renews_at, source_label, created_by)
      values (i.user_id, i.plan_version_id, 'active', i.cadence, coalesce(p_paid_at, now()),
              coalesce(p_paid_at, now()) + case when i.cadence = 'annual' then interval '1 year' else interval '1 month' end,
              v_label, null)
      returning id into v_sub;
      insert into public.subscription_events (subscription_id, event, next, reason, actor_id)
      values (v_sub, 'created', jsonb_build_object('status', 'active', 'plan_version_id', i.plan_version_id, 'cadence', i.cadence,
                                                   'intent', i.id, 'amount', i.amount, 'currency', i.currency, 'mode', i.mode),
              v_label, null);
    else
      select * into v_pack from public.credit_packs where key = i.pack_key;
      perform public.credit_grant(i.user_id, v_pack.kind, v_pack.credits, 'topup', v_label, 'payment_intent', i.id);
    end if;

    update public.payment_intents
       set status = 'paid', paid_at = coalesce(p_paid_at, now()), fulfilled_at = now(),
           provider_ref = coalesce(provider_ref, p_provider_ref), subscription_id = v_sub, failure_reason = null
     where id = i.id;
    perform public.log_audit('payment.settled', 'payment_intent', i.id::text, null,
      jsonb_build_object('kind', i.kind, 'provider', i.provider_key, 'mode', i.mode, 'amount', i.amount, 'currency', i.currency,
                         'subscription', v_sub, 'pack', i.pack_key), null, 'success');
    return 'paid';
  end if;

  if p_status in ('failed', 'expired', 'cancelled') then
    if i.status not in ('created', 'pending') then return 'not_pending'; end if;
    update public.payment_intents set status = p_status, failure_reason = coalesce(failure_reason, 'gateway: ' || p_status),
           provider_ref = coalesce(provider_ref, p_provider_ref)
     where id = i.id;
    return p_status;
  end if;

  if p_status = 'refunded' then
    -- Recorded, not reversed: taking credits or a plan back is a human decision
    -- with the ledger in front of them (credit_spend 'adjustment' / revoke).
    if i.status <> 'paid' then return 'not_pending'; end if;
    update public.payment_intents set status = 'refunded' where id = i.id;
    perform public.log_audit('payment.refunded', 'payment_intent', i.id::text, null,
      jsonb_build_object('amount', i.amount, 'currency', i.currency), null, 'success');
    return 'refunded';
  end if;

  return 'unknown';
end $$;

/** Service only (cron): an attempt nobody finished is closed after its window. */
create or replace function public.payment_intents_expire()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null then raise exception 'service only' using errcode = '42501'; end if;
  update public.payment_intents set status = 'expired', failure_reason = coalesce(failure_reason, 'not completed in time')
   where status in ('created', 'pending') and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Who may call what. Supabase's default privileges grant EXECUTE to anon,
-- authenticated and service_role on every new function; what is revoked here
-- is what remains forbidden. The service role keeps its grant.
revoke all on function public.payment_provider_for(uuid) from public, anon;
revoke all on function public.payment_intent_create(text, uuid, text, text) from public, anon;
revoke all on function public.payment_intent_cancel(uuid) from public, anon;
revoke all on function public.payment_intent_checkout(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.payment_intent_settle(uuid, text, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.payment_intents_expire() from public, anon, authenticated;

comment on table public.payment_intents is
  'One row per attempt to pay. Written only by payment_intent_create/checkout/settle; the amount comes from the price lists, never from the client.';
comment on table public.payment_events is
  'Every gateway webhook as received, verified or not. Append-only, service-only, unique per provider event id.';
comment on column public.payment_providers.mode is
  'off (default) · sandbox · live. live is refused by trigger unless commercial_settings.billing_mode = LIVE_BILLING.';
