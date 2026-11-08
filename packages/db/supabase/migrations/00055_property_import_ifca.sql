-- =============================================================================
-- 00055 — Corporate property import: internal finance, provenance, audit
--
-- Built for the IFCA workbook (P365 + PICI, August 2026), but nothing here is
-- specific to that file — any bulk import of owned stock needs the same three
-- things: somewhere for the accounting figures that must never reach a buyer,
-- a record of where each row came from, and provenance for imported media.
--
-- =============================================================================
-- 1. INTERNAL FINANCE  ->  property_private
-- =============================================================================
-- property_private already exists as the confidential companion (00030) and is
-- already excluded from every public_* view, so the accounting figures belong
-- there rather than in a new table with its own policies to get wrong.
--
-- The distinction that matters, and the one the brief is emphatic about:
--
--   purchase_price   what the company PAID. Internal. Never a listing price.
--   fair_value       an accounting assessment. Internal.
--   marketing_price  what the property is offered at -> listings.price, public.
--
-- Publishing an acquisition price as an asking price would misrepresent the
-- property and expose the owner's cost base to every buyer. They are separate
-- columns in separate tables on purpose.

alter table public.property_private
  add column if not exists purchase_price numeric(16,2),
  add column if not exists purchase_date date,
  add column if not exists maintenance_fee_monthly numeric(14,2),
  add column if not exists fair_value numeric(16,2),
  add column if not exists fair_value_as_at text,
  -- Verbatim source strings, kept because they could NOT be mapped safely.
  --
  -- The workbook states tenure as "Freehold"/"Leasehold". properties.ownership_type
  -- is the Indonesian certificate vocabulary (shm, hgb, strata, ppjb…). Those are
  -- different systems: a "Freehold" apartment could be SHM or strata title, and
  -- choosing one would be inventing a legal fact about somebody's property. Same
  -- for condition — "Empty" is not the same claim as "unfurnished".
  --
  -- So the structured columns stay NULL and the original wording is preserved
  -- here for a human to map deliberately.
  add column if not exists source_tenure_raw text,
  add column if not exists source_condition_raw text;

comment on column public.property_private.purchase_price is
  'What the owner paid. INTERNAL — never a customer-facing price. See listings.price for the marketing figure.';
comment on column public.property_private.source_tenure_raw is
  'Tenure exactly as the source stated it. Deliberately not mapped onto ownership_type: Freehold/Leasehold and the Indonesian certificate classes are different vocabularies.';

-- =============================================================================
-- 2. IMPORT AUDIT  ->  property_imports
-- =============================================================================
-- One row per source record, whether or not it produced a property. "Where did
-- this listing come from" must be answerable months later, including for the
-- rows that were REFUSED — those are the ones somebody asks about.

create table public.property_imports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,

  -- Provenance, enough to find the original cell by hand.
  source_file text not null,
  source_sheet text not null,
  source_property_no int not null,
  source_company text not null,
  source_rows int[],

  -- What it became. Null property_id means nothing was created.
  property_id uuid references public.properties(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,

  validation_status text not null check (validation_status in (
    'VALID', 'REQUIRES_REVIEW', 'MISSING_PRICE', 'NO_VERIFIED_IMAGES',
    'INVALID_SOURCE_URL', 'DUPLICATE_SUSPECTED', 'DATA_CONFLICT',
    'REQUIRES_PRICE_REVIEW', 'LEGAL_ENCUMBRANCE', 'NOT_FOR_SALE'
  )),
  -- Several reasons can apply at once; validation_status carries the most
  -- serious, this carries all of them.
  warnings text[] not null default '{}',

  normalized jsonb not null,        -- exactly what was parsed, for re-runs
  urls_seen int not null default 0,
  images_stored int not null default 0,

  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id),

  unique (source_file, source_sheet, source_property_no)
);

create index idx_property_imports_batch on public.property_imports (batch_id);
create index idx_property_imports_status on public.property_imports (validation_status);

comment on table public.property_imports is
  'Provenance and validation for bulk-imported properties, including records that were deliberately NOT imported.';

-- =============================================================================
-- 3. MEDIA PROVENANCE  ->  listing_media_source
-- =============================================================================
-- Imported photographs come from third-party pages. Where an image came from,
-- when it was taken and what it hashes to has to survive, because "can we use
-- this picture" is a question that gets asked after publication, not before.
--
-- A companion table rather than columns on listing_media: this applies only to
-- imported media, and listing_media is on the hot path for every public read.

create table public.listing_media_source (
  media_id uuid primary key references public.listing_media(id) on delete cascade,
  page_url text not null,           -- the listing page the image was found on
  image_url text not null,          -- the image file itself
  content_hash text,                -- sha256, for dedupe across sources
  downloaded_at timestamptz not null default now(),
  licence_note text                 -- how its use was judged permissible
);

create index idx_listing_media_source_hash on public.listing_media_source (content_hash);

comment on table public.listing_media_source is
  'Where an imported image came from. Third-party photographs carry third-party rights; this is what makes that auditable after the fact.';

-- =============================================================================
-- RLS — admin only, both tables
-- =============================================================================
-- Neither is agent-facing. Import provenance and media rights are operator
-- concerns, and property_imports.normalized holds the raw accounting figures.

alter table public.property_imports enable row level security;
alter table public.listing_media_source enable row level security;

create policy "property imports admin" on public.property_imports
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "listing media source admin" on public.listing_media_source
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Supabase's defaults hand anon ALL on new tables. Sixth time.
revoke all on public.property_imports from anon, authenticated;
revoke all on public.listing_media_source from anon, authenticated;
grant select, insert, update, delete on public.property_imports to authenticated;
grant select, insert, update, delete on public.listing_media_source to authenticated;
