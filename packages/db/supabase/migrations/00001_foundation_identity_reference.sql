-- =============================================================================
-- 00001 — Foundation: identity, roles, audit, brand, reference data
-- IQI AG MatchHub · master spec §3–7, §35–36, §41–43, §52, §70
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Per-entity, per-year human-readable ID sequences (§41): REQ-2026-000001 etc.
create table public.id_sequences (
  prefix text not null,
  year int not null,
  last_value bigint not null default 0,
  primary key (prefix, year)
);
alter table public.id_sequences enable row level security; -- no policies: service-role only

create or replace function public.next_human_id(p_prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from now())::int;
  v_next bigint;
begin
  insert into public.id_sequences (prefix, year, last_value)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year)
  do update set last_value = public.id_sequences.last_value + 1
  returning last_value into v_next;
  return p_prefix || '-' || v_year || '-' || lpad(v_next::text, 6, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Roles (§3): platform roles only. Requesting/Supply are transaction-derived,
-- never account types. No hard-coded roles in app code (§64) — read this table.
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,          -- super_admin | admin | country_admin | compliance_admin | agent
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into public.roles (key, name, description) values
  ('super_admin',      'Super Admin',      'Full global access (§4)'),
  ('admin',            'Admin',            'Operational admin, may be country/market scoped (§5)'),
  ('country_admin',    'Country Admin',    'Access limited to assigned countries (§6)'),
  ('compliance_admin', 'Compliance Admin', 'Compliance review; no commercial edits (§7)'),
  ('agent',            'Agent',            'Verified agent; requesting/supply role is per-transaction (§8)');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  country_codes text[] not null default '{}',   -- scope for country_admin / scoped admin; empty = global
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (user_id, role_id)
);

-- Authorisation helpers (SECURITY DEFINER so RLS policies can use them
-- without recursive policy evaluation). Roles live server-side only (§42).
create or replace function public.has_role(p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.key = p_role
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.key in ('super_admin','admin','country_admin','compliance_admin')
  );
$$;

create or replace function public.admin_country_scope()
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when public.has_role('super_admin') then null            -- null = unrestricted
    else coalesce(
      (select array_agg(distinct c) from public.user_roles ur
         join public.roles r on r.id = ur.role_id,
         unnest(ur.country_codes) c
       where ur.user_id = auth.uid()
         and r.key in ('admin','country_admin','compliance_admin')),
      '{}')
  end;
$$;

alter table public.roles enable row level security;
alter table public.user_roles enable row level security;

create policy "roles readable by authenticated" on public.roles
  for select to authenticated using (true);
create policy "user_roles self read" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
-- writes: service role only (role grants go through server code + audit)

-- ---------------------------------------------------------------------------
-- Profiles: public-ish profile vs private identity (§42, §53 class C4)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  country_code text,                 -- FK added after countries table below
  preferred_language text not null default 'en',
  preferred_currency text not null default 'MYR',
  agent_status text not null default 'draft' check (agent_status in (
    'draft','email_verification_pending','mobile_verification_pending',
    'documents_pending','under_review','additional_information_required',
    'verified','rejected','suspended','temporarily_restricted','banned',
    'expired_licence','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_legal_name text,
  email text,
  mobile_number text,
  whatsapp_number text,
  identification_number text,        -- where legally permitted (§12)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_users_private_updated before update on public.users_private
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.users_private enable row level security;

create policy "profiles self read" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_platform_admin());
create policy "profiles self update" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and agent_status = (select p.agent_status from public.profiles p where p.id = auth.uid()));
create policy "users_private self read" on public.users_private
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
create policy "users_private self update" on public.users_private
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Auto-provision profile rows on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  insert into public.users_private (user_id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Audit log: append-only (§52). Inserts only via definer function.
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_values jsonb,
  new_values jsonb,
  reason text,
  ip inet,
  session_ref text,
  country_code text,
  result text not null default 'success',
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
create policy "audit read admin" on public.audit_logs
  for select to authenticated using (public.is_platform_admin());
-- No insert/update/delete policies: mutations impossible for normal roles.
revoke update, delete on public.audit_logs from authenticated, anon;

create or replace function public.log_audit(
  p_action text, p_entity_type text, p_entity_id text default null,
  p_previous jsonb default null, p_new jsonb default null,
  p_reason text default null, p_result text default 'success'
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id,
    previous_values, new_values, reason, result)
  values (auth.uid(), p_action, p_entity_type, p_entity_id,
    p_previous, p_new, p_reason, p_result);
end $$;

-- ---------------------------------------------------------------------------
-- Reference data: languages, currencies, countries (§34–36)
-- ---------------------------------------------------------------------------

create table public.languages (
  code text primary key,             -- en, ms, id, ar
  name text not null,
  native_name text not null,
  rtl boolean not null default false,
  active boolean not null default true
);

insert into public.languages (code, name, native_name, rtl, active) values
  ('en', 'English', 'English', false, true),
  ('ms', 'Bahasa Malaysia', 'Bahasa Malaysia', false, true),
  ('id', 'Bahasa Indonesia', 'Bahasa Indonesia', false, true),
  ('ar', 'Arabic', 'العربية', true, false);

create table public.currencies (
  code text primary key,             -- ISO 4217
  name text not null,
  symbol text not null,
  decimal_precision int not null default 2,
  thousand_separator text not null default ',',
  decimal_separator text not null default '.',
  active boolean not null default true
);

insert into public.currencies (code, name, symbol, decimal_precision, active) values
  ('MYR', 'Malaysian Ringgit', 'RM', 2, true),
  ('IDR', 'Indonesian Rupiah', 'Rp', 0, true),
  ('AED', 'UAE Dirham', 'AED', 2, true),
  ('USD', 'US Dollar', '$', 2, true),
  ('SGD', 'Singapore Dollar', 'S$', 2, true);

create table public.countries (
  code text primary key,             -- ISO 3166-1 alpha-2
  name text not null,
  active boolean not null default false,
  default_language text not null references public.languages(code) default 'en',
  supported_languages text[] not null default '{en}',
  default_currency text not null references public.currencies(code) default 'MYR',
  measurement_unit text not null default 'sqft' check (measurement_unit in ('sqft','sqm')),
  phone_code text,
  timezone text,
  date_format text not null default 'DD/MM/YYYY',
  terminology jsonb not null default '{}'::jsonb,   -- agent/buyer/tenant/owner labels (§35)
  settings jsonb not null default '{}'::jsonb,      -- retention, contact-release policy, licence fields
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_countries_updated before update on public.countries
  for each row execute function public.set_updated_at();

insert into public.countries (code, name, active, default_language, supported_languages,
  default_currency, measurement_unit, phone_code, timezone, terminology) values
  ('MY', 'Malaysia', true, 'en', '{en,ms}', 'MYR', 'sqft', '+60', 'Asia/Kuala_Lumpur',
   '{"agent":"Real Estate Negotiator","licence_fields":["REN","REA"]}'),
  ('ID', 'Indonesia', true, 'id', '{id,en}', 'IDR', 'sqm', '+62', 'Asia/Jakarta',
   '{"agent":"Agen Properti","owner":"Pemilik","tenant":"Penyewa"}'),
  ('AE', 'United Arab Emirates', false, 'en', '{en}', 'AED', 'sqft', '+971', 'Asia/Dubai',
   '{"agent":"Real Estate Broker","owner":"Landlord","tenant":"Tenant"}');

alter table public.profiles
  add constraint profiles_country_fk foreign key (country_code) references public.countries(code);

alter table public.languages enable row level security;
alter table public.currencies enable row level security;
alter table public.countries enable row level security;

-- Reference data must be readable pre-login (login page language/branding).
create policy "languages public read" on public.languages for select to anon, authenticated using (true);
create policy "currencies public read" on public.currencies for select to anon, authenticated using (true);
create policy "countries public read" on public.countries for select to anon, authenticated using (true);
-- writes: service role only (admin server actions, audited)

-- ---------------------------------------------------------------------------
-- Brand settings & assets (§70): central config, Super Admin managed
-- ---------------------------------------------------------------------------

create table public.brand_settings (
  id int primary key default 1 check (id = 1),   -- singleton
  app_name text not null default 'IQI AG MatchHub',
  app_short_name text not null default 'MatchHub',
  tagline text not null default 'One Requirement. Multiple Opportunities. Controlled Collaboration.',
  company_name text not null default 'IQI AG',
  support_email text,
  support_phone text,
  website_url text,
  colors jsonb not null default '{"crimson":"#B11226","charcoal":"#1F1F1F","silver":"#C0C0C0","white":"#FFFFFF"}',
  social_links jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.brand_settings (id) values (1);

create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'iqi_logo','ag_team_logo','app_icon','favicon',
    'login_branding','email_header','presentation_branding','pdf_branding')),
  variant text not null default 'default' check (variant in ('default','light_bg','dark_bg','transparent')),
  storage_path text,                 -- null = labelled placeholder in use (§70)
  is_placeholder boolean not null default true,
  active boolean not null default true,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_brand_settings_updated before update on public.brand_settings
  for each row execute function public.set_updated_at();
create trigger trg_brand_assets_updated before update on public.brand_assets
  for each row execute function public.set_updated_at();

alter table public.brand_settings enable row level security;
alter table public.brand_assets enable row level security;

create policy "brand public read" on public.brand_settings for select to anon, authenticated using (true);
create policy "brand assets public read" on public.brand_assets
  for select to anon, authenticated using (active = true);
create policy "brand super admin write" on public.brand_settings
  for update to authenticated using (public.has_role('super_admin')) with check (public.has_role('super_admin'));
create policy "brand assets super admin write" on public.brand_assets
  for all to authenticated using (public.has_role('super_admin')) with check (public.has_role('super_admin'));
