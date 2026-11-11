-- =============================================================================
-- 00113 — partner-feed photos go through private intake (D6, P0-e-3b)
--
-- api/listings/ingest (the Hero partner feed) stored each photo straight into
-- the PUBLIC bucket as `ready`: fetched with a raw fetch, never processed
-- (GPS and EXIF intact), with no bucket prefix on storage_path — so the photo
-- never displayed, and nothing recorded where it came from or on what basis.
--
-- Owner decision, 11 Nov 2026: partner photos are used under the WRITTEN
-- PARTNER AGREEMENT. That reference is configured per country
-- (countries.settings.ingest.agreement_ref, edited on /admin/countries) and
-- recorded on every partner photo's provenance row. No reference configured
-- means the route stores no partner photos at all.
--
-- attach_partner_photo() is the partner equivalent of attach_import_photo():
--   · SERVICE ROLE ONLY — the ingest route runs server-to-server after its
--     shared-secret check; no user, agent or anon may call it;
--   · only for an `api`-created listing, and only for a file in that
--     listing's agent's own intake folder (`<agent>/<listing>/src-…`);
--   · the photo is `pending` in the private intake bucket, so the existing
--     processor makes the clean derivatives and moderation publishes them;
--   · one provenance row per (listing, content hash): a re-sent photo, or one
--     the agent removed (00112), is reported and not stored again;
--   · the first stored photo becomes the cover when the listing has none.
--
-- Rollback: drop the function. Rows it wrote are ordinary intake photos.
-- =============================================================================

create or replace function public.attach_partner_photo(
  p_listing uuid,
  p_storage_path text,
  p_content_hash text,
  p_image_url text,
  p_page_url text,
  p_agreement_ref text,
  p_byte_size integer,
  p_width integer,
  p_height integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_listing record;
  v_existing uuid;
  v_media uuid;
  v_position int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'partner photos are attached by the ingest service only' using errcode = '42501';
  end if;
  select l.id, l.agent_id, l.creation_source into v_listing from public.listings l where l.id = p_listing;
  if v_listing.id is null or v_listing.creation_source <> 'api' then
    raise exception 'not a partner-feed listing' using errcode = '22023';
  end if;
  if p_storage_path !~ ('^' || v_listing.agent_id::text || '/' || p_listing::text || '/src-[0-9a-f]{16}\.(jpg|png|webp)$') then
    raise exception 'storage path must be the listing agent''s own intake folder' using errcode = '22023';
  end if;
  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'content_hash must be sha256 hex' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_agreement_ref)), 0) = 0 or length(p_agreement_ref) > 200 then
    raise exception 'a partner agreement reference is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_listing::text || p_content_hash, 0));
  select media_id into v_existing from public.listing_media_source
   where listing_id = p_listing and content_hash = p_content_hash;
  if found then
    return jsonb_build_object('media_id', v_existing, 'created', false);
  end if;

  select coalesce(max(position) + 1, 0) into v_position from public.listing_media where listing_id = p_listing;
  insert into public.listing_media (listing_id, kind, storage_path, position, is_cover,
    width, height, byte_size, processing_state)
  values (p_listing, 'image', 'listing-media-intake/' || p_storage_path, v_position,
    not exists (select 1 from public.listing_media m where m.listing_id = p_listing and m.is_cover),
    p_width, p_height, p_byte_size, 'pending')
  returning id into v_media;

  insert into public.listing_media_source (media_id, listing_id, page_url, image_url,
    content_hash, licence_note, consent_record_id)
  values (v_media, p_listing, coalesce(nullif(p_page_url, ''), p_image_url), p_image_url, p_content_hash,
    'partner_agreement:' || trim(p_agreement_ref), null);

  return jsonb_build_object('media_id', v_media, 'created', true);
end;
$$;

revoke all on function public.attach_partner_photo(uuid, text, text, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.attach_partner_photo(uuid, text, text, text, text, text, integer, integer, integer) to service_role;
