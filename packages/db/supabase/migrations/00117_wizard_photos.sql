-- =============================================================================
-- 00117 — the listing wizard's photos go through the private processor (P1-b-3)
--
-- Owner decision, 11 Nov 2026 ("Yes, route them"): the wizard's own uploads
-- take the same private path as change-request photos (00116) — the intake
-- bucket, the $0 processor (GPS and EXIF stripped), and publication only after
-- a moderator approves the listing. Until now the wizard wrote the agent's
-- original files straight to the public bucket and marked them 'ready'.
--
-- agent_attach_listing_photo(listing, path, hash, size, w, h):
--   · only the listing's agent (owns_listing), only while the listing is a
--     draft or awaiting review — never on a live listing, so nothing reaches
--     buyers without a moderator;
--   · only a file in their own intake folder for that listing whose name
--     carries the content hash (`<agent>/<listing>/src-<hash16>.<ext>`; the
--     00108 owner-write policy already restricts uploads to that folder);
--   · at most 15 photos per listing (the wizard's limit);
--   · the photo is `pending` and private; its provenance row records that the
--     agent uploaded it themself (`licence_note agent_upload:wizard`), the
--     rights evidence publication requires (P1-a, lib/media/rights.ts);
--   · one row per (listing, content hash): the same file twice is one photo.
-- Not audited per photo: the wizard's `listing.submitted` audit records the
-- count, and nothing becomes public here.
--
-- Existing wizard photos (public, 'ready') are left as they are.
--
-- Rollback: drop the function.
-- =============================================================================

create or replace function public.agent_attach_listing_photo(
  p_listing uuid,
  p_storage_path text,
  p_content_hash text,
  p_byte_size integer,
  p_width integer,
  p_height integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_existing uuid;
  v_media uuid;
  v_position int;
begin
  select l.status into v_status from public.listings l where l.id = p_listing;
  if v_status is null or not public.owns_listing(p_listing) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_status not in ('draft', 'pending_review') then
    return jsonb_build_object('ok', false, 'error', 'not_editable');
  end if;
  if p_storage_path !~ ('^' || auth.uid()::text || '/' || p_listing::text || '/src-[0-9a-f]{16}\.(jpg|png|webp)$') then
    return jsonb_build_object('ok', false, 'error', 'bad_path');
  end if;
  if p_content_hash !~ '^[0-9a-f]{64}$' or left(p_content_hash, 16) <> substring(p_storage_path from 'src-([0-9a-f]{16})') then
    return jsonb_build_object('ok', false, 'error', 'bad_hash');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_listing::text || p_content_hash, 0));
  select media_id into v_existing from public.listing_media_source
   where listing_id = p_listing and content_hash = p_content_hash;
  if found then
    return jsonb_build_object('ok', true, 'media_id', v_existing, 'created', false);
  end if;
  if (select count(*) from public.listing_media m
       where m.listing_id = p_listing and m.processing_state <> 'removed') >= 15 then
    return jsonb_build_object('ok', false, 'error', 'too_many_photos');
  end if;

  select coalesce(max(position) + 1, 0) into v_position from public.listing_media where listing_id = p_listing;
  -- The intake insert guard (00110) admits intake rows only from the attach paths.
  perform set_config('propertiguru.attach_import_photo', 'on', true);
  insert into public.listing_media (listing_id, kind, storage_path, position, is_cover, width, height, byte_size, processing_state)
  values (p_listing, 'image', 'listing-media-intake/' || p_storage_path, v_position,
    not exists (select 1 from public.listing_media m where m.listing_id = p_listing and m.is_cover and m.processing_state not in ('removed', 'quarantined', 'failed')),
    p_width, p_height, p_byte_size, 'pending')
  returning id into v_media;
  perform set_config('propertiguru.attach_import_photo', 'off', true);

  insert into public.listing_media_source (media_id, listing_id, page_url, image_url, content_hash, licence_note, consent_record_id)
  values (v_media, p_listing, 'wizard', 'agent-upload', p_content_hash, 'agent_upload:wizard', null);

  return jsonb_build_object('ok', true, 'media_id', v_media, 'created', true);
end;
$$;

revoke all on function public.agent_attach_listing_photo(uuid, text, text, integer, integer, integer) from public, anon;
grant execute on function public.agent_attach_listing_photo(uuid, text, text, integer, integer, integer) to authenticated;
