-- =============================================================================
-- 00108 — Imported photos, slice P0-e-1a: private intake with provenance
--
-- Owner decision (10 Nov 2026): build and validate on staging behind the
-- `import_photos` flag, on only for named staging test accounts. Photos stay
-- PRIVATE and `pending`; nothing becomes public in this slice. Turning the flag
-- on for real agents waits for counsel (photo rights, P0-c); making photos
-- public waits for P0-e-2 (EXIF/GPS strip, resize, thumbnails).
--
-- WHY A NEW BUCKET
--   listing-media-public is public with no read policy: an object there is
--   downloadable by anyone with its URL regardless of processing_state.
--   Imported originals can carry GPS in EXIF, so they are kept in a private
--   bucket until processing exists.
--
-- THE FLOW (after the agent's commit, never inside it)
--   The commit marks an item media_state = 'pending'. The agent's batch page
--   then attaches photos one item at a time: the hub fetches each URL with the
--   SSRF-safe fetcher, checks it is really an image, uploads it to
--   listing-media-intake/<agent>/<listing>/src-<sha256 prefix>.<ext> in the
--   agent's own session, and calls attach_import_photo(), which records it.
--   A photo can therefore never fail the listing import.
--
-- RETRIES
--   The storage key comes from the bytes and (listing_id, content_hash) is
--   unique, so a retry — or the same photo from two URLs — adds nothing.
--
-- Depends on 00055 (listing_media_source), 00057 (import tables),
-- 00066/00069 (feature flags), 00105 (admin_sees_*), 00107 (D15 ownership).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The flag: targeted, with no targets — off for everyone until someone is
--    added on the flags page (staging test accounts only, by owner decision).
-- -----------------------------------------------------------------------------

insert into public.feature_flags (key, name, description, enabled, targeted) values
  ('import_photos', 'Imported listing photos',
   'Copy photos found during a listing import into private intake storage, pending processing. Staging test accounts only until counsel approves photo rights (P0-c).',
   true, true)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Private intake bucket
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-media-intake', 'listing-media-intake', false, 10 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

/** May the caller review files in this agent's intake folder? listing.moderate for the agent's country. */
create or replace function public.can_moderate_agent_folder(p_owner text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_capability_in(
    'listing.moderate',
    (select p.country_code from public.profiles p where p.id::text = p_owner)
  );
$$;
revoke all on function public.can_moderate_agent_folder(text) from public, anon;
grant execute on function public.can_moderate_agent_folder(text) to authenticated;

create policy "listing intake owner write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-media-intake'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "listing intake read own or moderator" on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-media-intake'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.can_moderate_agent_folder((storage.foldername(name))[1])));
-- No update or delete for client roles: an intake object is evidence.

-- -----------------------------------------------------------------------------
-- 3. Provenance: one row per photo per listing, with the consent behind it
-- -----------------------------------------------------------------------------

alter table public.listing_media_source
  add column if not exists listing_id uuid references public.listings(id) on delete cascade,
  add column if not exists consent_record_id uuid references public.consent_records(id);

update public.listing_media_source s
   set listing_id = m.listing_id
  from public.listing_media m
 where m.id = s.media_id and s.listing_id is null;

create unique index if not exists idx_listing_media_source_listing_hash
  on public.listing_media_source (listing_id, content_hash)
  where listing_id is not null and content_hash is not null;

comment on column public.listing_media_source.consent_record_id is
  'The acceptance this copy relied on (00108). Today the agent''s listing_import_authority for the batch; whether that suffices for photos is for counsel (P0-c).';

-- -----------------------------------------------------------------------------
-- 4. Per-item photo progress
-- -----------------------------------------------------------------------------

alter table public.import_items
  add column if not exists media_state text not null default 'none'
    check (media_state in ('none', 'pending', 'done', 'partial', 'failed')),
  add column if not exists media_total int not null default 0,
  add column if not exists media_saved int not null default 0,
  add column if not exists media_attempts int not null default 0,
  -- [{ "u": <first 16 hex of sha256(url)>, "s": "saved" | <reason> }] — never the URL itself.
  add column if not exists media_results jsonb not null default '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- 5. The one door for recording an imported photo
-- -----------------------------------------------------------------------------

create or replace function public.attach_import_photo(
  p_item uuid,
  p_storage_path text,
  p_content_hash text,
  p_image_url text,
  p_byte_size bigint default null,
  p_width int default null,
  p_height int default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item public.import_items;
  v_batch public.import_batches;
  v_listing uuid;
  v_media uuid;
  v_existing uuid;
  v_position int;
begin
  if auth.uid() is null or not public.is_feature_enabled('import_photos', auth.uid()) then
    raise exception 'imported photos are not enabled for this account' using errcode = '42501';
  end if;

  select * into v_item from public.import_items where id = p_item;
  select * into v_batch from public.import_batches where id = v_item.batch_id;
  v_listing := v_item.listing_id;

  -- Ownership: the batch's own agent, and a listing they own (the D15 rule).
  if v_item.id is null or v_listing is null
     or v_batch.agent_id is distinct from auth.uid()
     or not exists (select 1 from public.listings l where l.id = v_listing and l.agent_id = auth.uid()) then
    raise exception 'not permitted to attach photos to this item' using errcode = '42501';
  end if;

  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'content_hash must be sha256 hex' using errcode = '22023';
  end if;
  -- The object must be in the caller's own intake folder, for this listing.
  if p_storage_path !~ ('^' || auth.uid()::text || '/' || v_listing::text || '/src-[0-9a-f]{16}\.(jpg|png|webp)$') then
    raise exception 'unexpected storage path' using errcode = '22023';
  end if;

  -- One photo per (listing, content), even under concurrent retries.
  perform pg_advisory_xact_lock(hashtextextended(v_listing::text || p_content_hash, 0));
  select media_id into v_existing from public.listing_media_source
   where listing_id = v_listing and content_hash = p_content_hash;
  if v_existing is not null then
    return jsonb_build_object('media_id', v_existing, 'created', false);
  end if;

  select coalesce(max(position) + 1, 0) into v_position from public.listing_media where listing_id = v_listing;

  insert into public.listing_media (listing_id, kind, storage_path, position, is_cover,
    width, height, byte_size, processing_state)
  values (v_listing, 'image', 'listing-media-intake/' || p_storage_path, v_position,
    not exists (select 1 from public.listing_media m where m.listing_id = v_listing and m.is_cover),
    p_width, p_height, p_byte_size, 'pending')
  returning id into v_media;

  insert into public.listing_media_source (media_id, listing_id, page_url, image_url,
    content_hash, licence_note, consent_record_id)
  values (v_media, v_listing, coalesce(v_item.source_url, ''), p_image_url, p_content_hash,
    'listing_import_authority', v_batch.consent_record_id);

  return jsonb_build_object('media_id', v_media, 'created', true);
end;
$$;

revoke all on function public.attach_import_photo(uuid, text, text, text, bigint, int, int) from public, anon;
grant execute on function public.attach_import_photo(uuid, text, text, text, bigint, int, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. An intake photo becomes ready only through processing (P0-e-2)
-- -----------------------------------------------------------------------------
-- The owner policy on listing_media lets an agent update their own rows. An
-- imported original must not be marked ready (or re-pointed) from a client
-- session: that is the processor's job, which runs without a JWT.

create or replace function public.guard_intake_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if old.storage_path like 'listing-media-intake/%'
     and (new.processing_state is distinct from old.processing_state
          or new.storage_path is distinct from old.storage_path
          or new.processed_path is distinct from old.processed_path
          or new.thumbnail_path is distinct from old.thumbnail_path) then
    raise exception 'an imported photo is made ready only by processing' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_listing_media_intake_guard
  before update on public.listing_media
  for each row execute function public.guard_intake_media();
