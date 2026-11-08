-- =============================================================================
-- 00078 — AI foundation (Stage B, E1 · 7 Nov 2026)
--
-- The tables every AI capability writes through, created BEFORE any capability
-- so that metering, cost and governance exist from the first call rather than
-- being retrofitted onto a feature that already ships.
--
--   ai_settings   one row: on/off, platform caps, circuit breaker state
--   ai_models     per FEATURE: which provider + model, costs, premium flag
--   ai_prompts    versioned prompt text per feature and locale; one current
--   ai_jobs       append-only ledger — every call, including denied ones
--   ai_briefs     the AI Manager's cached daily brief per agent (E2 fills it)
--
-- GOVERNANCE CARRIED INTO THE SCHEMA (docs/module-ai-agent-dashboard.md §2)
--   · quota is checked BEFORE a provider call: ai_quota_status() answers it
--   · every call is recorded: ai_record_job() is the only insert path
--   · the ledger holds references and hashes, never the agent's text or the
--     enquirer's phone number — PII stays in the tables that already hold it
--   · a model is a row an admin changes, never a constant in a bundle
--   · "premium" (image, video, bulk) is a per-feature tier so it can be
--     credit-metered separately, as Decision 3 (7 Nov 2026) requires
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings — a single row, so there is exactly one place to turn AI off.
-- ---------------------------------------------------------------------------
create table public.ai_settings (
  id                          boolean primary key default true check (id),
  enabled                     boolean not null default true,
  -- Caps are in micro-USD (1 USD = 1,000,000) so every provider's price list
  -- converts without floats. Defaults are deliberately modest for a pilot.
  daily_platform_cap_micros   bigint  not null default 20000000,   -- US$20 / day
  monthly_platform_cap_micros bigint  not null default 300000000,  -- US$300 / month
  per_user_daily_cap          integer not null default 40,         -- jobs per agent per day
  circuit_error_threshold     integer not null default 5,          -- consecutive provider errors
  circuit_open_until          timestamptz,                         -- set by the engine when tripped
  updated_by                  uuid references auth.users(id) on delete set null,
  updated_at                  timestamptz not null default now()
);
insert into public.ai_settings default values;

-- ---------------------------------------------------------------------------
-- Model routing per feature.
-- ---------------------------------------------------------------------------
create table public.ai_models (
  feature                    text primary key,
  description                text not null,
  provider                   text not null check (provider in ('gemini', 'anthropic', 'none')),
  model                      text not null,
  fallback_provider          text check (fallback_provider in ('gemini', 'anthropic')),
  fallback_model             text,
  max_output_tokens          integer not null default 1024,
  -- Price per 1,000 tokens in micro-USD; 0 until an admin enters the list price.
  input_cost_micros_per_1k   integer not null default 0,
  output_cost_micros_per_1k  integer not null default 0,
  -- 'standard' draws on the monthly allowance (ai.monthly_usage);
  -- 'premium' is credit-metered separately (Decision 3).
  tier                       text not null default 'standard' check (tier in ('standard', 'premium')),
  enabled                    boolean not null default true,
  updated_by                 uuid references auth.users(id) on delete set null,
  updated_at                 timestamptz not null default now()
);

-- Working defaults. Gemini first because the owner's existing AI billing is
-- Hero's Google account (Decision 1); Anthropic as the configured fallback.
-- Model names are data: change them here, not in code.
insert into public.ai_models (feature, description, provider, model, fallback_provider, fallback_model, max_output_tokens, tier) values
  ('brief',           'AI Manager daily brief (prose over the rules-only action list)', 'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-haiku-5-5',  700,  'standard'),
  ('listing_copy',    'Listing titles, description and selling points',                'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 1200, 'standard'),
  ('studio_copy',     'Marketing Studio: social captions, WhatsApp broadcast, brochure text', 'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 1400, 'standard'),
  ('secretary_reply', 'Communication Secretary: WhatsApp / e-mail reply drafts',       'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 600,  'standard'),
  ('lead_qualify',    'Lead intent score with stated reason',                          'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-haiku-5-5',  400,  'standard'),
  ('task_extract',    'Tasks and appointments proposed from a message or brief',       'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-haiku-5-5',  500,  'standard'),
  ('match_rationale', 'One-line reason a listing matches a requirement',               'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-haiku-5-5',  200,  'standard'),
  ('embedding',       'Listing embeddings for matching (once per listing version)',    'gemini', 'gemini-embedding-001', null, null, 0, 'standard'),
  ('poster_image',    'Generative poster artwork',                                     'none',   'disabled',          null, null, 0, 'premium'),
  ('video_script',    'Video script and storyboard',                                   'none',   'disabled',          null, null, 0, 'premium');

-- ---------------------------------------------------------------------------
-- Prompts — versioned rows. The engine reads the CURRENT row for a feature
-- and locale ('any' when one text serves every language), and records the
-- version number on the job so an answer can always be traced to its prompt.
-- ---------------------------------------------------------------------------
create table public.ai_prompts (
  id             uuid primary key default gen_random_uuid(),
  feature        text not null references public.ai_models(feature) on delete cascade,
  locale         text not null default 'any' check (locale in ('any', 'id', 'en', 'ms')),
  version        integer not null check (version > 0),
  system_text    text not null,
  template_text  text not null,
  output_schema  jsonb,
  is_current     boolean not null default false,
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (feature, locale, version)
);
create unique index ai_prompts_one_current
  on public.ai_prompts (feature, locale) where is_current;

-- ---------------------------------------------------------------------------
-- The ledger. Append-only for everyone — including administrators and the
-- service role — except a purge that sets the session flag below, which only
-- a data-retention job will ever do.
-- ---------------------------------------------------------------------------
create table public.ai_jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  feature         text not null,
  provider        text,
  model           text,
  prompt_version  integer,
  status          text not null check (status in ('ok', 'degraded', 'error', 'denied')),
  denied_reason   text check (denied_reason in ('disabled', 'quota', 'daily_cap', 'platform_cap', 'circuit_open', 'unverified', 'feature_off', 'no_provider')),
  input_ref_type  text,          -- 'listing' | 'lead' | 'request' | 'brief' …
  input_ref_id    uuid,
  input_hash      text,          -- sha256 of the normalised input, for caching and dedupe
  tokens_in       integer not null default 0,
  tokens_out      integer not null default 0,
  cost_micros     bigint  not null default 0,
  latency_ms      integer,
  error           text,          -- provider error class, never the prompt
  created_at      timestamptz not null default now()
);
create index ai_jobs_user_month on public.ai_jobs (user_id, created_at desc);
create index ai_jobs_created   on public.ai_jobs (created_at desc);
create index ai_jobs_feature   on public.ai_jobs (feature, created_at desc);

create or replace function public.ai_jobs_append_only()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('ai.allow_purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'ai_jobs is append-only' using errcode = '42501';
end $$;
create trigger ai_jobs_no_update before update on public.ai_jobs
  for each row execute function public.ai_jobs_append_only();
create trigger ai_jobs_no_delete before delete on public.ai_jobs
  for each row execute function public.ai_jobs_append_only();

-- ---------------------------------------------------------------------------
-- The AI Manager's daily brief, one per agent per day. E2 writes it; the
-- table exists now so the ledger and the brief ship in the same migration
-- set and the admin page can report on both.
-- ---------------------------------------------------------------------------
create table public.ai_briefs (
  user_id      uuid not null references auth.users(id) on delete cascade,
  brief_date   date not null,
  locale       text not null,
  source       text not null check (source in ('ai', 'rules')),
  paragraph    text,
  actions      jsonb not null default '[]'::jsonb,
  counts_hash  text,
  model        text,
  created_at   timestamptz not null default now(),
  primary key (user_id, brief_date)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.ai_settings enable row level security;
alter table public.ai_models   enable row level security;
alter table public.ai_prompts  enable row level security;
alter table public.ai_jobs     enable row level security;
alter table public.ai_briefs   enable row level security;

-- Anyone signed in may read routing and settings (the engine runs as the user);
-- only `ai.manage` may change them. Prompts are admin-only even to read — a
-- prompt is part of the product's behaviour, not something an agent needs.
create policy "ai settings read"  on public.ai_settings for select to authenticated using (true);
create policy "ai settings admin" on public.ai_settings for update to authenticated
  using (public.has_capability('ai.manage')) with check (public.has_capability('ai.manage'));

create policy "ai models read"  on public.ai_models for select to authenticated using (true);
create policy "ai models admin" on public.ai_models for all to authenticated
  using (public.has_capability('ai.manage')) with check (public.has_capability('ai.manage'));

create policy "ai prompts admin" on public.ai_prompts for all to authenticated
  using (public.has_capability('ai.manage')) with check (public.has_capability('ai.manage'));

-- Jobs: own rows, or any row for the AI admin. No insert policy on purpose —
-- the only way in is ai_record_job() below.
create policy "ai jobs own read"   on public.ai_jobs for select to authenticated using (user_id = auth.uid());
create policy "ai jobs admin read" on public.ai_jobs for select to authenticated using (public.has_capability('ai.manage'));

create policy "ai briefs own read" on public.ai_briefs for select to authenticated using (user_id = auth.uid());

revoke all on public.ai_settings, public.ai_models, public.ai_prompts, public.ai_jobs, public.ai_briefs from anon;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Who may ask about / write for p_user: the user themself, an AI admin, or a
-- server-side caller without a session (the service role from a cron).
create or replace function public.ai_may_act_for(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or auth.uid() = p_user or public.has_capability('ai.manage');
$$;
revoke execute on function public.ai_may_act_for(uuid) from public, anon;

/**
 * Everything the engine needs to decide BEFORE calling a provider, in one
 * round trip. Allowance comes from the same resolver that explains it to an
 * admin (resolve_entitlement_int), so the number an agent is held to is the
 * number the admin screen shows.
 */
create or replace function public.ai_quota_status(p_user uuid)
returns table (
  enabled            boolean,
  monthly_allowance  integer,
  used_this_month    integer,
  remaining          integer,
  per_user_daily_cap integer,
  used_today         integer,
  platform_open      boolean,
  circuit_open       boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  s public.ai_settings%rowtype;
  v_allow int;
  v_month int;
  v_today int;
  v_spend_today bigint;
  v_spend_month bigint;
begin
  if not public.ai_may_act_for(p_user) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.ai_settings limit 1;
  v_allow := coalesce(public.resolve_entitlement_int(p_user, 'ai.monthly_usage'), 0);
  select count(*) into v_month from public.ai_jobs j
    where j.user_id = p_user and j.status in ('ok', 'degraded')
      and j.created_at >= date_trunc('month', now());
  select count(*) into v_today from public.ai_jobs j
    where j.user_id = p_user and j.status in ('ok', 'degraded', 'error')
      and j.created_at >= date_trunc('day', now());
  select coalesce(sum(cost_micros), 0) into v_spend_today from public.ai_jobs
    where created_at >= date_trunc('day', now());
  select coalesce(sum(cost_micros), 0) into v_spend_month from public.ai_jobs
    where created_at >= date_trunc('month', now());

  return query select
    s.enabled,
    v_allow,
    v_month,
    greatest(v_allow - v_month, 0),
    s.per_user_daily_cap,
    v_today,
    (v_spend_today < s.daily_platform_cap_micros and v_spend_month < s.monthly_platform_cap_micros),
    (s.circuit_open_until is not null and s.circuit_open_until > now());
end $$;
revoke execute on function public.ai_quota_status(uuid) from public, anon;

/** The only write path into the ledger. */
create or replace function public.ai_record_job(
  p_user uuid, p_feature text, p_provider text, p_model text, p_prompt_version integer,
  p_status text, p_denied_reason text, p_ref_type text, p_ref_id uuid, p_input_hash text,
  p_tokens_in integer, p_tokens_out integer, p_cost_micros bigint, p_latency_ms integer, p_error text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.ai_may_act_for(p_user) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.ai_jobs (user_id, feature, provider, model, prompt_version, status, denied_reason,
    input_ref_type, input_ref_id, input_hash, tokens_in, tokens_out, cost_micros, latency_ms, error)
  values (p_user, p_feature, p_provider, p_model, p_prompt_version, p_status, p_denied_reason,
    p_ref_type, p_ref_id, p_input_hash, coalesce(p_tokens_in, 0), coalesce(p_tokens_out, 0),
    coalesce(p_cost_micros, 0), p_latency_ms, left(p_error, 200))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.ai_record_job(uuid, text, text, text, integer, text, text, text, uuid, text, integer, integer, bigint, integer, text) from public, anon;

/** Circuit breaker: the engine calls this after a provider failure. */
create or replace function public.ai_note_provider_failure()
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.ai_settings%rowtype; v_recent int;
begin
  select * into s from public.ai_settings limit 1;
  select count(*) into v_recent from (
    select status from public.ai_jobs order by created_at desc limit s.circuit_error_threshold
  ) r where r.status = 'error';
  if v_recent >= s.circuit_error_threshold then
    update public.ai_settings set circuit_open_until = now() + interval '10 minutes';
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.ai_note_provider_failure() from public, anon;

/** Spend and volume per day for the admin page. */
create or replace function public.ai_admin_daily(p_days integer default 30)
returns table (day date, jobs bigint, ok bigint, denied bigint, errors bigint, cost_micros bigint, tokens bigint)
language sql stable security definer set search_path = public as $$
  select d::date,
         count(j.id),
         count(j.id) filter (where j.status = 'ok'),
         count(j.id) filter (where j.status = 'denied'),
         count(j.id) filter (where j.status = 'error'),
         coalesce(sum(j.cost_micros), 0),
         coalesce(sum(j.tokens_in + j.tokens_out), 0)
  from generate_series(date_trunc('day', now()) - (greatest(p_days, 1) - 1) * interval '1 day', date_trunc('day', now()), interval '1 day') d
  left join public.ai_jobs j on j.created_at >= d and j.created_at < d + interval '1 day'
  where public.has_capability('ai.manage')
  group by d order by d;
$$;
revoke execute on function public.ai_admin_daily(integer) from public, anon;

/** Jobs per feature this month, with cost — the "where does the money go" table. */
create or replace function public.ai_admin_by_feature(p_days integer default 30)
returns table (feature text, jobs bigint, ok bigint, denied bigint, errors bigint, cost_micros bigint, avg_latency_ms integer, users bigint)
language sql stable security definer set search_path = public as $$
  select j.feature, count(*), count(*) filter (where status = 'ok'), count(*) filter (where status = 'denied'),
         count(*) filter (where status = 'error'), coalesce(sum(cost_micros), 0),
         avg(latency_ms)::int, count(distinct user_id)
  from public.ai_jobs j
  where public.has_capability('ai.manage')
    and j.created_at >= now() - greatest(p_days, 1) * interval '1 day'
  group by j.feature order by 6 desc;
$$;
revoke execute on function public.ai_admin_by_feature(integer) from public, anon;

comment on table public.ai_jobs is 'Append-only AI call ledger. Holds references and hashes, never prompt text or PII. Insert only via ai_record_job().';
