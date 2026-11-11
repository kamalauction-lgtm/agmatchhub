-- =============================================================================
-- 00116 — photos the agent supplies on a change request go through the
-- private processor (P1-b-2)
--
-- Owner decision, 11 Nov 2026: when a moderator asks for an original or
-- replacement photo (00115, kind 'photo_original'), the agent's upload takes
-- the PRIVATE path — the intake bucket, the $0 processor (GPS and EXIF
-- stripped), and publication only by a moderator — not the wizard's public,
-- unprocessed upload.
--
-- agent_attach_request_photo(request, path, hash, size, w, h):
--   · only the listing's agent, only on an open or answered 'photo_original'
--     request, only for a file in their own intake folder for that listing
--     (`<agent>/<listing>/src-<hash16>.<ext>`, which the intake owner-write
--     policy from 00108 already restricts uploads to);
--   · the photo is `pending` and private; its provenance row records that the
--     agent supplied it on this request (`licence_note agent_upload:request:<id>`),
--     which is the rights evidence publication requires (P1-a);
--   · one row per (listing, content hash): re-sending the same file is a no-op;
--   · the request becomes 'answered' (with the agent's note, if any) and the
--     step is audited.
--
-- Rollback: drop the function.
-- =============================================================================

create or replace function public.agent_attach_request_photo(
  p_request uuid,
  p_storage_path text,
  p_content_hash text,
  p_byte_size integer,
  p_width integer,
  p_height integer,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_req record;
  v_existing uuid;
  v_media uuid;
  v_position int;
begin
  select r.id, r.listing_id, r.kind, r.status, r.opened_by into v_req
    from public.listing_change_requests r where r.id = p_request;
  if v_req.id is null or not public.owns_listing(v_req.listing_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.kind <> 'photo_original' then
    return jsonb_build_object('ok', false, 'error', 'not_photo_request');
  end if;
  if v_req.status not in ('open', 'answered') then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if p_storage_path !~ ('^' || auth.uid()::text || '/' || v_req.listing_id::text || '/src-[0-9a-f]{16}\.(jpg|png|webp)$') then
    return jsonb_build_object('ok', false, 'error', 'bad_path');
  end if;
  if p_content_hash !~ '^[0-9a-f]{64}$' or left(p_content_hash, 16) <> substring(p_storage_path from 'src-([0-9a-f]{16})') then
    return jsonb_build_object('ok', false, 'error', 'bad_hash');
  end if;
  if p_note is not null and length(p_note) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'answer_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_req.listing_id::text || p_content_hash, 0));
  select media_id into v_existing from public.listing_media_source
   where listing_id = v_req.listing_id and content_hash = p_content_hash;
  if found then
    return jsonb_build_object('ok', true, 'media_id', v_existing, 'created', false, 'opened_by', v_req.opened_by);
  end if;

  select coalesce(max(position) + 1, 0) into v_position from public.listing_media where listing_id = v_req.listing_id;
  -- The intake insert guard (00110) admits intake rows only from the attach paths.
  perform set_config('propertiguru.attach_import_photo', 'on', true);
  insert into public.listing_media (listing_id, kind, storage_path, position, is_cover, width, height, byte_size, processing_state)
  values (v_req.listing_id, 'image', 'listing-media-intake/' || p_storage_path, v_position,
    not exists (select 1 from public.listing_media m where m.listing_id = v_req.listing_id and m.is_cover and m.processing_state not in ('removed', 'quarantined', 'failed')),
    p_width, p_height, p_byte_size, 'pending')
  returning id into v_media;
  perform set_config('propertiguru.attach_import_photo', 'off', true);

  insert into public.listing_media_source (media_id, listing_id, page_url, image_url, content_hash, licence_note, consent_record_id)
  values (v_media, v_req.listing_id, 'change-request:' || p_request::text, 'agent-upload', p_content_hash,
    'agent_upload:request:' || p_request::text, null);

  update public.listing_change_requests
     set status = 'answered',
         answer = coalesce(nullif(trim(coalesce(p_note, '')), ''), answer, 'Photo supplied.'),
         answered_by = auth.uid(), answered_at = now()
   where id = p_request;

  perform public.log_audit('listing.change_photo_supplied', 'listing', v_req.listing_id::text, null,
    jsonb_build_object('request', p_request, 'media', v_media));
  return jsonb_build_object('ok', true, 'media_id', v_media, 'created', true, 'opened_by', v_req.opened_by);
end;
$$;

revoke all on function public.agent_attach_request_photo(uuid, text, text, integer, integer, integer, text) from public, anon;
grant execute on function public.agent_attach_request_photo(uuid, text, text, integer, integer, integer, text) to authenticated;
