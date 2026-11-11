-- =============================================================================
-- 00110 — Intake guard covers the processor's columns too
--
-- Found while writing the 00109 tests: the 00108 guard stops a client session
-- changing an intake photo's processing_state and storage/processed/thumbnail
-- paths, but not the columns 00109 added. An agent could set derived_path on
-- their own photo after the processor marked it `processed` — pointing it at
-- the original, which may carry GPS — and moderation approval would then copy
-- that file to the public bucket. The hub's publish step now also checks the
-- derivative's exact name; this closes it at the database.
-- =============================================================================

create or replace function public.guard_intake_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;                                  -- operator path (the processor)
  end if;
  if old.storage_path like 'listing-media-intake/%'
     and (new.processing_state is distinct from old.processing_state
          or new.storage_path is distinct from old.storage_path
          or new.processed_path is distinct from old.processed_path
          or new.thumbnail_path is distinct from old.thumbnail_path
          or new.derived_path is distinct from old.derived_path
          or new.derived_thumb_path is distinct from old.derived_thumb_path
          or new.processing_attempts is distinct from old.processing_attempts
          or new.processing_error is distinct from old.processing_error
          or new.processing_started_at is distinct from old.processing_started_at
          or new.processing_next_at is distinct from old.processing_next_at) then
    raise exception 'an imported photo is changed only by processing and moderation' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A client cannot insert an intake row directly either (attach_import_photo
-- is the door, and it writes `pending` with no derived paths).
create or replace function public.guard_intake_media_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.storage_path like 'listing-media-intake/%'
     and current_setting('propertiguru.attach_import_photo', true) is distinct from 'on' then
    raise exception 'imported photos are recorded only through attach_import_photo' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_listing_media_intake_insert_guard
  before insert on public.listing_media
  for each row execute function public.guard_intake_media_insert();

-- attach_import_photo marks its own insert.
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

  if v_item.id is null or v_listing is null
     or v_batch.agent_id is distinct from auth.uid()
     or not exists (select 1 from public.listings l where l.id = v_listing and l.agent_id = auth.uid()) then
    raise exception 'not permitted to attach photos to this item' using errcode = '42501';
  end if;

  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'content_hash must be sha256 hex' using errcode = '22023';
  end if;
  if p_storage_path !~ ('^' || auth.uid()::text || '/' || v_listing::text || '/src-[0-9a-f]{16}\.(jpg|png|webp)$') then
    raise exception 'unexpected storage path' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_listing::text || p_content_hash, 0));
  select media_id into v_existing from public.listing_media_source
   where listing_id = v_listing and content_hash = p_content_hash;
  if v_existing is not null then
    return jsonb_build_object('media_id', v_existing, 'created', false);
  end if;

  select coalesce(max(position) + 1, 0) into v_position from public.listing_media where listing_id = v_listing;

  perform set_config('propertiguru.attach_import_photo', 'on', true);
  insert into public.listing_media (listing_id, kind, storage_path, position, is_cover,
    width, height, byte_size, processing_state)
  values (v_listing, 'image', 'listing-media-intake/' || p_storage_path, v_position,
    not exists (select 1 from public.listing_media m where m.listing_id = v_listing and m.is_cover),
    p_width, p_height, p_byte_size, 'pending')
  returning id into v_media;
  perform set_config('propertiguru.attach_import_photo', 'off', true);

  insert into public.listing_media_source (media_id, listing_id, page_url, image_url,
    content_hash, licence_note, consent_record_id)
  values (v_media, v_listing, coalesce(v_item.source_url, ''), p_image_url, p_content_hash,
    'listing_import_authority', v_batch.consent_record_id);

  return jsonb_build_object('media_id', v_media, 'created', true);
end;
$$;
