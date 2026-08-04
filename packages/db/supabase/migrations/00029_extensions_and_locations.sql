-- =============================================================================
-- 00029 — Extensions + Indonesian location hierarchy
--
-- Master prompt §16 (Indonesian administrative hierarchy), §12 (semantic
-- search), §14 (geospatial ranking).
--
-- Extensions go in the `extensions` schema, matching how pgcrypto / uuid-ossp
-- were installed on this project, so every type and operator class below is
-- schema-qualified. Do not rely on search_path.
--
-- locations, location_aliases and landmarks are class C0 (public reference
-- data): no PII, no confidential columns, so anonymous SELECT is granted
-- directly. Every table that has even one non-public column must instead be
-- reached through a `public_*` view — see 00031.
-- =============================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- locations — provinsi / kabupaten-kota / kecamatan / kelurahan-desa
-- -----------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),

  level text not null check (level in ('province','regency','district','village')),
  parent_id uuid references public.locations(id),

  -- Official statistics code (BPS in Indonesia). Not unique across countries.
  code text,
  name text not null,
  -- Lowercased, punctuation-stripped. Trigram-indexed so "jaksel" and
  -- "Jakarta Selatan" both resolve.
  name_normalised text not null,
  slug text not null,

  -- Denormalised ancestry. path_names drives breadcrumb display without a
  -- recursive query; ancestor_ids drives "everything under this province"
  -- filtering with a single GIN index instead of a recursive CTE per search.
  path_names text[] not null default '{}',
  ancestor_ids uuid[] not null default '{}',

  centroid extensions.geography(Point, 4326),

  is_active boolean not null default true,
  -- Refreshed by a scheduled job, never written by request handlers.
  listing_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (country_code, level, slug)
);

create index idx_locations_parent on public.locations (parent_id);
create index idx_locations_level on public.locations (country_code, level) where is_active;
create index idx_locations_ancestors on public.locations using gin (ancestor_ids);
create index idx_locations_name_trgm on public.locations
  using gin (name_normalised extensions.gin_trgm_ops);
create index idx_locations_centroid on public.locations using gist (centroid);

create trigger trg_locations_updated before update on public.locations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- location_aliases — colloquial names, abbreviations, historical names
-- -----------------------------------------------------------------------------
create table public.location_aliases (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  alias text not null,
  alias_normalised text not null,
  source text not null default 'manual' check (source in ('manual','import','search_log')),
  created_at timestamptz not null default now(),
  unique (location_id, alias_normalised)
);

create index idx_location_aliases_trgm on public.location_aliases
  using gin (alias_normalised extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- landmarks — what "dekat MRT" actually resolves against (§12)
-- -----------------------------------------------------------------------------
create table public.landmarks (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  location_id uuid references public.locations(id),

  kind text not null check (kind in
    ('mrt_station','lrt_station','krl_station','transjakarta_stop','bus_terminal',
     'airport','toll_gate','mall','market','school','university','hospital',
     'park','beach','business_district','other')),

  name text not null,
  name_normalised text not null,
  slug text not null,
  geom extensions.geography(Point, 4326) not null,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (country_code, kind, slug)
);

create index idx_landmarks_geom on public.landmarks using gist (geom);
create index idx_landmarks_kind on public.landmarks (country_code, kind) where is_active;
create index idx_landmarks_name_trgm on public.landmarks
  using gin (name_normalised extensions.gin_trgm_ops);

create trigger trg_landmarks_updated before update on public.landmarks
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — public reference data: everyone reads, only admins write.
-- -----------------------------------------------------------------------------
alter table public.locations enable row level security;
alter table public.location_aliases enable row level security;
alter table public.landmarks enable row level security;

create policy "locations public read" on public.locations
  for select to anon, authenticated using (is_active);
create policy "locations admin write" on public.locations
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "location aliases public read" on public.location_aliases
  for select to anon, authenticated using (true);
create policy "location aliases admin write" on public.location_aliases
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "landmarks public read" on public.landmarks
  for select to anon, authenticated using (is_active);
create policy "landmarks admin write" on public.landmarks
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- Helper: normalise a place name for trigram matching. Immutable so it can be
-- used in generated columns and index expressions later if needed.
-- -----------------------------------------------------------------------------
create or replace function public.normalise_place_name(p_name text)
returns text language sql immutable set search_path = public as $$
  select trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g'));
$$;
