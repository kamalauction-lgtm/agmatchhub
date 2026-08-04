-- =============================================================================
-- 00030 — Catalogue: properties and listings
--
-- Master prompt §10 Module 1, §17 (properties and listings domain).
--
-- A *property* is the physical asset. A *listing* is one marketing of that
-- asset by one agent. They are deliberately separate: the same property can be
-- listed for sale and for rent, relisted after expiry, or (later) matched
-- against a MatchHub requirement, without duplicating the asset record.
--
-- property_submissions (00007) is NOT this table. That is a co-broke
-- submission against a private requirement and carries a much stricter
-- confidentiality model. Do not overload one for the other.
--
-- Confidentiality: exact address, unit number, owner identity and minimum
-- acceptable price are class C3/C4 and live in property_private, because RLS
-- filters rows and not columns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- properties — the physical asset
-- -----------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,              -- PRP-2026-000001

  -- The single profiles FK on this table, reserved for the embeddable
  -- relationship. Audit pointers below reference auth.users instead, because a
  -- second FK to profiles would break every PostgREST embed here (see 00028).
  agent_id uuid not null references public.profiles(id),
  agency_id uuid references public.agencies(id),

  country_code text not null references public.countries(code),

  property_category text not null check (property_category in
    ('residential','commercial','industrial','land','other')),
  property_type text not null check (property_type in
    ('rumah','apartemen','ruko','rukan','kondominium','villa','kost','gudang',
     'pabrik','kantor','toko','hotel','tanah','kavling','lainnya')),

  -- Indonesian tenure. Certificate class materially changes value and
  -- financing eligibility, so it is first-class, not a free-text note.
  ownership_type text check (ownership_type in
    ('shm','hgb','hgu','hp','hbg','girik','strata','ppjb','adat','lainnya')),

  -- Deepest known administrative unit. Exactly ONE FK to locations: four
  -- separate province/regency/district/village FKs would reintroduce the
  -- embed-ambiguity failure from 00028. Hierarchy filtering uses ancestor_ids.
  location_id uuid references public.locations(id),
  ancestor_location_ids uuid[] not null default '{}',
  -- Denormalised for display and for filtering without a join.
  province_name text,
  regency_name text,
  district_name text,
  village_name text,
  postal_code text,

  -- Public-safe approximate point. The exact address lives in property_private.
  geom extensions.geography(Point, 4326),
  general_address text,
  building_name text,
  developer_name text,

  land_size numeric(12,2),
  building_size numeric(12,2),
  measurement_unit text not null default 'sqm' check (measurement_unit in ('sqm','sqft')),
  bedrooms int check (bedrooms >= 0),
  bathrooms int check (bathrooms >= 0),
  floors int check (floors >= 0),
  floor_level text,
  parking_spaces int check (parking_spaces >= 0),
  year_built int check (year_built between 1800 and 2200),
  furnishing text check (furnishing in ('unfurnished','partially','fully')),
  property_condition text check (property_condition in
    ('new','excellent','good','needs_renovation','under_construction')),
  facing text,
  electricity_va int,
  water_source text,
  facilities text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  archived_at timestamptz
);

create index idx_properties_agent on public.properties (agent_id) where archived_at is null;
create index idx_properties_location on public.properties (location_id);
create index idx_properties_ancestors on public.properties using gin (ancestor_location_ids);
create index idx_properties_geom on public.properties using gist (geom);

create trigger trg_properties_updated before update on public.properties
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- property_private — C3/C4 companion. Never joined into a public view.
-- -----------------------------------------------------------------------------
create table public.property_private (
  property_id uuid primary key references public.properties(id) on delete cascade,

  exact_address text,
  unit_number text,
  block_number text,

  owner_name text,
  owner_phone text,
  owner_email text,
  owner_relationship text check (owner_relationship in
    ('owner','family','company','representative','unknown')),
  owner_authorisation_status text not null default 'not_obtained'
    check (owner_authorisation_status in ('obtained','pending','not_obtained')),
  owner_authorisation_ref text,
  owner_authorisation_expires date,

  minimum_price numeric(14,2) check (minimum_price >= 0),
  internal_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_property_private_updated before update on public.property_private
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- listings — one marketing of one property by one agent
-- -----------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,              -- LST-2026-000001

  property_id uuid not null references public.properties(id) on delete cascade,
  agent_id uuid not null references public.profiles(id),
  agency_id uuid references public.agencies(id),

  listing_type text not null check (listing_type in ('sale','rent')),

  status text not null default 'draft' check (status in
    ('draft','pending_review','published','rejected','paused',
     'expired','sold','rented','withdrawn','archived')),

  moderation_state text not null default 'pending' check (moderation_state in
    ('pending','approved','rejected','flagged')),
  moderated_by uuid references auth.users(id),
  moderated_at timestamptz,
  moderation_reason text,

  currency text not null references public.currencies(code),
  price numeric(14,2) check (price >= 0),
  -- Matches the rent_period convention introduced in 00026.
  rent_period text check (rent_period in ('monthly','yearly')),
  price_negotiable boolean not null default true,
  deposit numeric(14,2) check (deposit >= 0),
  service_charge numeric(14,2) check (service_charge >= 0),

  -- Bahasa Indonesia is the primary content; English is optional and
  -- generated. Never hard-code either as "the" description.
  language text not null default 'id' references public.languages(code),
  title text not null,
  description text,
  title_en text,
  description_en text,
  key_selling_points text[],
  slug text not null unique,

  available_from date,
  published_at timestamptz,
  expires_at timestamptz,
  renewed_at timestamptz,
  last_verified_at timestamptz,

  is_verified boolean not null default false,
  is_featured boolean not null default false,
  featured_until timestamptz,

  -- Denormalised so ranking can be a plain indexed ORDER BY rather than a
  -- join-and-sort on every search. Both are written by jobs, never by request
  -- handlers, and both are recomputable from source.
  quality_score int not null default 0 check (quality_score between 0 and 100),
  ranking_score numeric(8,4) not null default 0,

  view_count int not null default 0,
  save_count int not null default 0,
  inquiry_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  archived_at timestamptz,

  -- A sale listing has no rent period; a rent listing must have one.
  constraint listings_rent_period_matches_type check (
    (listing_type = 'rent' and rent_period is not null)
    or (listing_type = 'sale' and rent_period is null)
  )
);

create index idx_listings_agent on public.listings (agent_id, status);
create index idx_listings_property on public.listings (property_id);
create index idx_listings_moderation on public.listings (moderation_state, created_at)
  where moderation_state in ('pending','flagged');

-- The dominant public search path: published rows only, which are a small
-- fraction of the table, so every public index is partial.
create index idx_listings_search on public.listings
  (listing_type, currency, price, ranking_score desc)
  where status = 'published' and moderation_state = 'approved';
create index idx_listings_published_recent on public.listings (published_at desc)
  where status = 'published' and moderation_state = 'approved';
create index idx_listings_expiry on public.listings (expires_at)
  where status = 'published';

create trigger trg_listings_updated before update on public.listings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- listing_media
-- -----------------------------------------------------------------------------
create table public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,

  kind text not null default 'image' check (kind in ('image','video','floor_plan','tour_360')),
  storage_path text not null,
  -- Set once the file has been stripped of EXIF, compressed and thumbnailed.
  processed_path text,
  thumbnail_path text,

  position int not null default 0,
  is_cover boolean not null default false,
  alt_text text,
  width int,
  height int,
  byte_size bigint,
  -- Perceptual hash, for cross-listing duplicate-photo detection.
  phash text,

  processing_state text not null default 'pending' check (processing_state in
    ('pending','processing','ready','failed','quarantined')),

  created_at timestamptz not null default now()
);

create index idx_listing_media on public.listing_media (listing_id, position);
create index idx_listing_media_phash on public.listing_media (phash) where phash is not null;
create unique index idx_listing_media_one_cover on public.listing_media (listing_id)
  where is_cover;

-- -----------------------------------------------------------------------------
-- History, quality and statistics
-- -----------------------------------------------------------------------------
create table public.listing_price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  previous_price numeric(14,2),
  new_price numeric(14,2) not null,
  currency text not null references public.currencies(code),
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_listing_price_history on public.listing_price_history
  (listing_id, created_at desc);

create table public.listing_status_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  previous_status text,
  new_status text not null,
  reason text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_listing_status_history on public.listing_status_history
  (listing_id, created_at desc);

create table public.listing_quality_scores (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  total_score int not null default 0 check (total_score between 0 and 100),
  completeness int not null default 0,
  photo_quality int not null default 0,
  title_quality int not null default 0,
  description_quality int not null default 0,
  price_competitiveness int not null default 0,
  location_accuracy int not null default 0,
  verification int not null default 0,
  freshness int not null default 0,
  duplicate_risk int not null default 0,
  agent_responsiveness int not null default 0,
  -- Actionable, ordered, localised recommendation keys plus their parameters.
  recommendations jsonb not null default '[]',
  computed_at timestamptz not null default now()
);

create table public.listing_statistics (
  listing_id uuid not null references public.listings(id) on delete cascade,
  stat_date date not null,
  views int not null default 0,
  unique_views int not null default 0,
  saves int not null default 0,
  shares int not null default 0,
  inquiries int not null default 0,
  whatsapp_clicks int not null default 0,
  primary key (listing_id, stat_date)
);
create index idx_listing_statistics_date on public.listing_statistics (stat_date);

-- Generated once per listing version and cached. Never generated per search.
create table public.listing_embeddings (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  embedding extensions.vector(1536) not null,
  model text not null,
  source_hash text not null,
  created_at timestamptz not null default now()
);
-- HNSW is built in a later migration, once there are rows worth indexing.

-- =============================================================================
-- RLS
--
-- No anonymous policy appears anywhere below. The public marketplace never
-- touches these tables directly — it reads the views created in 00031. See
-- that migration for the grant revocations that make this structural rather
-- than merely conventional.
-- =============================================================================

alter table public.properties enable row level security;
alter table public.property_private enable row level security;
alter table public.listings enable row level security;
alter table public.listing_media enable row level security;
alter table public.listing_price_history enable row level security;
alter table public.listing_status_history enable row level security;
alter table public.listing_quality_scores enable row level security;
alter table public.listing_statistics enable row level security;
alter table public.listing_embeddings enable row level security;

-- Ownership helpers. These exist so no policy below ever subqueries the table
-- it protects, directly or transitively — the cause of four separate 42P17
-- production incidents (00020, 00021, 00022).
create or replace function public.owns_property(p_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.properties p
                 where p.id = p_property_id and p.agent_id = auth.uid());
$$;

create or replace function public.owns_listing(p_listing_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listings l
                 where l.id = p_listing_id and l.agent_id = auth.uid());
$$;

-- properties -----------------------------------------------------------------
create policy "properties owner read" on public.properties
  for select to authenticated
  using (agent_id = auth.uid() or public.is_platform_admin());

create policy "properties agent insert" on public.properties
  for insert to authenticated
  with check (
    agent_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.agent_status = 'verified')
  );

create policy "properties owner update" on public.properties
  for update to authenticated
  using (agent_id = auth.uid()) with check (agent_id = auth.uid());

create policy "properties admin all" on public.properties
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- property_private -----------------------------------------------------------
create policy "property private owner" on public.property_private
  for all to authenticated
  using (public.owns_property(property_id) or public.is_platform_admin())
  with check (public.owns_property(property_id) or public.is_platform_admin());

-- listings -------------------------------------------------------------------
create policy "listings owner read" on public.listings
  for select to authenticated
  using (agent_id = auth.uid() or public.is_platform_admin());

create policy "listings agent insert" on public.listings
  for insert to authenticated
  with check (
    agent_id = auth.uid()
    and public.owns_property(property_id)
    and status in ('draft','pending_review')
    and moderation_state = 'pending'
  );

-- An agent may edit their own listing but may never approve it. Moderation
-- columns are guarded by a trigger rather than a policy, because a trigger can
-- see OLD without re-entering this table's own policy.
create policy "listings owner update" on public.listings
  for update to authenticated
  using (agent_id = auth.uid() and status <> 'archived')
  with check (agent_id = auth.uid());

create policy "listings admin all" on public.listings
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.guard_listing_moderation_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_platform_admin() then
    return new;
  end if;
  if new.moderation_state is distinct from old.moderation_state
     or new.moderated_by is distinct from old.moderated_by
     or new.moderated_at is distinct from old.moderated_at
     or new.moderation_reason is distinct from old.moderation_reason
     or new.is_verified is distinct from old.is_verified
     or new.is_featured is distinct from old.is_featured
     or new.featured_until is distinct from old.featured_until
     or new.quality_score is distinct from old.quality_score
     or new.ranking_score is distinct from old.ranking_score
     or new.human_readable_id is distinct from old.human_readable_id then
    raise exception 'moderation and ranking fields are not agent-editable';
  end if;
  -- An agent cannot self-publish. Publication is the moderator's act.
  if new.status = 'published' and old.status <> 'published' then
    raise exception 'listings are published by moderation, not by the agent';
  end if;
  return new;
end;
$$;

create trigger trg_listings_guard_moderation
  before update on public.listings
  for each row execute function public.guard_listing_moderation_fields();

-- child tables ---------------------------------------------------------------
create policy "listing media owner" on public.listing_media
  for all to authenticated
  using (public.owns_listing(listing_id) or public.is_platform_admin())
  with check (public.owns_listing(listing_id) or public.is_platform_admin());

create policy "listing price history read" on public.listing_price_history
  for select to authenticated
  using (public.owns_listing(listing_id) or public.is_platform_admin());

create policy "listing status history read" on public.listing_status_history
  for select to authenticated
  using (public.owns_listing(listing_id) or public.is_platform_admin());

create policy "listing quality read" on public.listing_quality_scores
  for select to authenticated
  using (public.owns_listing(listing_id) or public.is_platform_admin());

create policy "listing statistics read" on public.listing_statistics
  for select to authenticated
  using (public.owns_listing(listing_id) or public.is_platform_admin());

create policy "listing embeddings admin read" on public.listing_embeddings
  for select to authenticated using (public.is_platform_admin());

-- History, scores, statistics and embeddings are written by jobs holding the
-- service role. No INSERT or UPDATE policy is granted to authenticated on
-- purpose: an agent must not be able to fabricate their own price history,
-- quality score or view counts.
