-- =============================================================================
-- 00056 — Import provenance, generalised beyond Excel
--
-- Kamal, 10 Aug 2026: the import method is the ORIGIN of a listing, never a
-- class of listing. An imported listing must behave exactly like one created
-- by hand — editable, publishable, co-marketable, usable in MatchHub, eligible
-- for an agent page, able to generate leads — with no technical distinction
-- anywhere.
--
-- That is already true and this migration does not change it: no application
-- code reads `property_imports`. Every listing query, page and action treats
-- an imported row identically because it IS a normal row in `listings`, with a
-- normal `properties` parent. The import tables are a side-record, not a
-- parallel catalogue.
--
-- What this adds is the ability to record WHERE a listing came from when the
-- source is not a spreadsheet — a Rumah123 URL, a 99.co listing id, a CSV, an
-- API. 00055 modelled provenance as file/sheet/row, which is Excel's shape and
-- nothing else's.
--
-- CRITICAL: every column here is descriptive. Nothing in the schema may read
-- these to decide what a listing can do. If a future feature ever branches on
-- `creation_source`, that is the bug — not the data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Generalised source description
-- -----------------------------------------------------------------------------

alter table public.property_imports
  add column if not exists source_kind text
    check (source_kind in ('excel', 'csv', 'portal_url', 'api', 'manual_paste')),
  add column if not exists source_portal text,      -- 'rumah123', '99co', 'pinhome', 'lamudi', 'olx', 'brighton'
  add column if not exists source_url text,         -- the listing page it came from
  add column if not exists source_external_id text; -- the portal's own id, where exposed

comment on column public.property_imports.source_kind is
  'How the record arrived. Descriptive only — nothing may branch on it to decide what the resulting listing can do.';
comment on column public.property_imports.source_portal is
  'Which portal, when source_kind = portal_url. Provenance for audit and for de-duplicating a re-import.';

-- Existing rows came from the IFCA workbook.
update public.property_imports set source_kind = 'excel' where source_kind is null;

-- The Excel-shaped columns become optional: a URL import has no sheet or row.
alter table public.property_imports
  alter column source_sheet drop not null,
  alter column source_property_no drop not null;

-- The old key (file, sheet, no) cannot identify a URL import. Replace it with
-- one partial unique index per source shape, so a re-import of the same thing
-- updates rather than duplicates — whatever "the same thing" means for that
-- source.
alter table public.property_imports
  drop constraint if exists property_imports_source_file_source_sheet_source_property__key;

create unique index if not exists idx_property_imports_excel
  on public.property_imports (source_file, source_sheet, source_property_no)
  where source_kind in ('excel', 'csv');

create unique index if not exists idx_property_imports_url
  on public.property_imports (source_url)
  where source_url is not null;

-- -----------------------------------------------------------------------------
-- creation_source on the listing itself
-- -----------------------------------------------------------------------------
-- Kamal asked that the platform MAY record `creation_source = import`. It is
-- recorded, and it is inert: no policy, view, trigger or index reads it. It
-- exists so "where did this come from" is answerable from the listing without
-- a join, and for nothing else.
--
-- Default 'manual' so every existing and future hand-made listing is correctly
-- described without touching the wizard.

alter table public.listings
  add column if not exists creation_source text not null default 'manual'
    check (creation_source in ('manual', 'import', 'api', 'developer_feed'));

comment on column public.listings.creation_source is
  'How this listing was first created. PROVENANCE ONLY. It must never gate a capability: an imported listing has exactly the rights of a manual one. If anything ever branches on this column, that is a bug.';

-- Backfill the IFCA import.
update public.listings l
set creation_source = 'import'
from public.property_imports pi
where pi.listing_id = l.id and l.creation_source = 'manual';

-- -----------------------------------------------------------------------------
-- The public view is rebuilt only to stay in step with the base table; it does
-- NOT expose creation_source. A buyer has no business knowing, and exposing it
-- would invite a UI that treats the two differently — the exact outcome this
-- migration exists to prevent.
-- -----------------------------------------------------------------------------
-- (public_listings selects named columns, so no change is required. Asserted
--  here rather than assumed:)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'public_listings'
      and column_name = 'creation_source'
  ) then
    raise exception 'public_listings exposes creation_source — buyers must not see how a listing was created';
  end if;
end $$;
