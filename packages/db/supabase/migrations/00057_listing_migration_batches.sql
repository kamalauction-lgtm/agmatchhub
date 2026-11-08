-- =============================================================================
-- 00057 — Agent listing migration: batches, items, authority declaration
--
-- "I already have listings elsewhere. Bring them here without entering
-- everything again."
--
-- 00055 gave us `property_imports`, one row per source record, written by a
-- command-line script run by an operator. This adds what an AGENT needs to do
-- it themselves: a batch they own, items with individual states, and progress
-- that survives a page refresh because discovery of 128 listings cannot happen
-- inside one web request.
--
-- SHAPE
--   import_batches   one run. Owned by an agent, RLS-scoped to them.
--   import_items     one candidate property. Carries its own status, so a
--                    single broken listing fails alone rather than taking the
--                    batch with it.
--
-- `property_imports` is left exactly as it is: it remains the record of the
-- operator-run Excel import, and its provenance columns already generalise.
-- An item that succeeds writes a normal property + listing and points at them,
-- same as before.
--
-- THE RULE THAT DOES NOT CHANGE (00056)
--   Import is an ORIGIN, not a listing class. Nothing here may gate what the
--   resulting listing can do. verify-import-parity.mjs enforces it.
-- =============================================================================

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,

  source_kind text not null check (source_kind in ('portal_url', 'profile_url', 'excel', 'csv')),
  source_portal text,          -- 'rumah123' | '99co' | 'pinhome' | ... | 'other'
  source_label text,           -- what to show the agent: a filename or a profile URL

  status text not null default 'processing'
    check (status in ('processing', 'ready', 'partial', 'failed', 'completed', 'cancelled')),

  -- Counts are derived from items, but denormalised so the history table does
  -- not need a subquery per row.
  found_count int not null default 0,
  imported_count int not null default 0,
  failed_count int not null default 0,

  -- The authority declaration accepted for THIS batch. Versioned via the
  -- existing framework (00004) rather than a bare boolean: what an agent
  -- confirmed, and the exact wording they confirmed, has to survive a later
  -- change to that wording.
  consent_record_id uuid references public.consent_records(id),

  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_import_batches_agent on public.import_batches (agent_id, created_at desc);

create trigger trg_import_batches_updated
  before update on public.import_batches
  for each row execute function public.set_updated_at();

comment on table public.import_batches is
  'One agent-initiated listing migration run. Progress lives here because discovering 128 listings cannot happen inside a single web request.';

-- -----------------------------------------------------------------------------

create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,

  -- Provenance. source_url is the natural key for a portal import: re-running
  -- discovery must update an item, not clone it.
  source_url text,
  source_external_id text,

  status text not null default 'found' check (status in (
    'found',        -- discovered, not yet fetched
    'processing',   -- being fetched/parsed
    'ready',        -- parsed cleanly, agent may import it
    'needs_review', -- parsed, but something material is missing
    'duplicate',    -- looks like something the agent already has
    'imported',     -- became a normal property + listing
    'failed',       -- could not be fetched or parsed
    'skipped'       -- agent chose not to import it
  )),

  -- What was extracted, exactly as extracted. Never merged into the draft
  -- silently: the review screen shows the agent what came from the source and
  -- what they have changed.
  extracted jsonb not null default '{}'::jsonb,
  -- Agent's edits, applied over `extracted` at import time.
  overrides jsonb not null default '{}'::jsonb,

  warnings text[] not null default '{}',
  error text,

  -- Set once the item becomes real. Both null until then.
  property_id uuid references public.properties(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  duplicate_of_listing_id uuid references public.listings(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_import_items_batch on public.import_items (batch_id, status);
create unique index idx_import_items_url on public.import_items (batch_id, source_url)
  where source_url is not null;

create trigger trg_import_items_updated
  before update on public.import_items
  for each row execute function public.set_updated_at();

comment on column public.import_items.extracted is
  'Exactly what the source yielded. Kept separate from `overrides` so the review screen can show the agent which values came from the portal and which are their own.';

-- -----------------------------------------------------------------------------
-- Keep the batch counters honest without the application having to remember.
-- -----------------------------------------------------------------------------
create or replace function public.sync_import_batch_counts()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_batch uuid := coalesce(new.batch_id, old.batch_id);
begin
  update public.import_batches b set
    found_count    = (select count(*) from public.import_items i where i.batch_id = v_batch),
    imported_count = (select count(*) from public.import_items i where i.batch_id = v_batch and i.status = 'imported'),
    failed_count   = (select count(*) from public.import_items i where i.batch_id = v_batch and i.status = 'failed')
  where b.id = v_batch;
  return null;
end;
$$;

create trigger trg_sync_import_batch_counts
  after insert or update of status or delete on public.import_items
  for each row execute function public.sync_import_batch_counts();

-- -----------------------------------------------------------------------------
-- The authority declaration
-- -----------------------------------------------------------------------------
-- Required before anything is imported. Versioned through the existing
-- framework so the wording an agent accepted is recoverable years later, which
-- a checkbox column cannot do.

insert into public.declarations (key, name)
values ('listing_import_authority', 'Listing import authority and accuracy')
on conflict (key) do nothing;

insert into public.declaration_versions (declaration_id, version_number, locale, body, active)
select d.id, 1, v.locale, v.body, true
from public.declarations d
cross join (values
  ('en', 'I confirm that I am authorised to market the properties I am importing and that the information submitted is accurate to the best of my knowledge.'),
  ('ms', 'Saya mengesahkan bahawa saya diberi kuasa untuk memasarkan hartanah yang saya import dan bahawa maklumat yang dihantar adalah tepat sepanjang pengetahuan saya.'),
  ('id', 'Saya menyatakan bahwa saya berwenang memasarkan properti yang saya impor dan bahwa informasi yang dikirimkan akurat sepanjang pengetahuan saya.')
) as v(locale, body)
where d.key = 'listing_import_authority'
on conflict do nothing;

-- consent_records already carries request_ref/submission_ref/etc. Add the
-- equivalent for a batch rather than overloading one of those.
alter table public.consent_records
  add column if not exists import_batch_ref uuid references public.import_batches(id) on delete set null;

-- -----------------------------------------------------------------------------
-- RLS — an agent sees only their own batches, and nothing else does
-- -----------------------------------------------------------------------------
alter table public.import_batches enable row level security;
alter table public.import_items enable row level security;

create policy "import batches own" on public.import_batches
  for all to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

create policy "import batches admin" on public.import_batches
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

/**
 * Items are reached through their batch. SECURITY DEFINER and does NOT read
 * import_items — the rule four 42P17 incidents taught us.
 */
create or replace function public.owns_import_batch(p_batch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.import_batches b
    where b.id = p_batch_id and b.agent_id = auth.uid()
  );
$$;

create policy "import items own" on public.import_items
  for all to authenticated
  using (public.owns_import_batch(batch_id))
  with check (public.owns_import_batch(batch_id));

create policy "import items admin" on public.import_items
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Supabase's defaults hand anon ALL on new tables. Seventh time.
revoke all on public.import_batches from anon, authenticated;
revoke all on public.import_items from anon, authenticated;
grant select, insert, update, delete on public.import_batches to authenticated;
grant select, insert, update, delete on public.import_items to authenticated;
