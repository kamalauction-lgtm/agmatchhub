-- =============================================================================
-- 00112 — the agent's gallery editor: cover, order, remove (P0-e-3a)
--
-- The approved P0-e plan includes "a gallery editor (reorder, cover, delete)"
-- on the agent's own listing. Until now an agent could only add photos; the
-- cover was whichever came first and nothing could be taken back out.
--
-- Three functions, each one transaction, each OWNER-ONLY (owns_listing: the
-- listing's agent_id is the caller; admins moderate, they do not curate
-- someone else's gallery), each audited through log_audit:
--
--   listing_media_set_cover(media)        exactly one cover per listing
--   listing_media_reorder(listing, ids)   ids must be exactly the listing's photos
--   listing_media_remove(media)           returns the public files to delete
--
-- RULES, CHOSEN CONSERVATIVELY
--   · A failed, kept-out (quarantined) or removed photo is never the cover.
--   · On a PUBLISHED listing the cover must already be public ('ready'), so a
--     buyer never sees a listing whose cover is still being processed.
--   · Removing an IMPORTED photo (private intake original) moves it to the new
--     state 'removed' instead of deleting the row. Its provenance row
--     (listing_media_source, keyed by media_id) stays as evidence (00108), and
--     attach_import_photo still sees the hash, so it is not re-imported. The
--     public views show only 'ready' photos and the processor claims only
--     'pending'/'processing', so a removed photo is never shown or processed.
--   · Removing a WIZARD photo (public upload, no provenance) deletes the row.
--   · Either way, public copies (wizard files, published derivatives) are
--     returned for the Hub to delete with the agent's own session.
--   · Removing the cover makes the next eligible photo the cover.
--   · None of this sends a published listing back to review: nothing new
--     becomes public. Adding photos is unchanged.
--
-- Rollback: drop the three functions; restore guard_intake_media from 00110
-- and compute_listing_quality from its previous definition; move 'removed'
-- rows back (or delete them) and restore the processing_state check.
-- =============================================================================

alter table public.listing_media drop constraint if exists listing_media_processing_state_check;
alter table public.listing_media add constraint listing_media_processing_state_check check (
  processing_state = any (array['pending', 'processing', 'processed', 'ready', 'failed', 'quarantined', 'removed'])
);

create or replace function public.listing_media_set_cover(p_media uuid)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_media record;
  v_status text;
  v_prev uuid;
begin
  select m.id, m.listing_id, m.processing_state, m.is_cover into v_media
    from public.listing_media m where m.id = p_media;
  if v_media.id is null or not public.owns_listing(v_media.listing_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_media.processing_state in ('failed', 'quarantined', 'removed') then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;
  select l.status into v_status from public.listings l where l.id = v_media.listing_id;
  if v_status = 'published' and v_media.processing_state <> 'ready' then
    return jsonb_build_object('ok', false, 'error', 'not_public_yet');
  end if;
  if v_media.is_cover then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  select m.id into v_prev from public.listing_media m where m.listing_id = v_media.listing_id and m.is_cover;
  update public.listing_media set is_cover = false where listing_id = v_media.listing_id and is_cover;
  update public.listing_media set is_cover = true where id = p_media;

  perform public.log_audit('listing_media.cover_set', 'listing', v_media.listing_id::text,
    jsonb_build_object('cover', v_prev), jsonb_build_object('cover', p_media));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.listing_media_reorder(p_listing uuid, p_ids uuid[])
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_have uuid[];
  v_before uuid[];
begin
  if not public.owns_listing(p_listing) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select array_agg(id order by position, created_at), array_agg(id order by id)
    into v_before, v_have
    from public.listing_media where listing_id = p_listing and processing_state <> 'removed';
  -- The new order must name every (not removed) photo of this listing exactly once.
  if p_ids is null or cardinality(p_ids) <> coalesce(cardinality(v_have), 0)
     or (select array_agg(x order by x) from unnest(p_ids) x) is distinct from v_have then
    return jsonb_build_object('ok', false, 'error', 'bad_order');
  end if;

  update public.listing_media m set position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where m.id = o.id and m.listing_id = p_listing;

  perform public.log_audit('listing_media.reordered', 'listing', p_listing::text,
    jsonb_build_object('order', v_before), jsonb_build_object('order', p_ids));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.listing_media_remove(p_media uuid)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_media record;
  v_next uuid;
  v_imported boolean;
  v_public text[] := array[]::text[];
begin
  select m.* into v_media from public.listing_media m where m.id = p_media;
  if v_media.id is null or not public.owns_listing(v_media.listing_id) or v_media.processing_state = 'removed' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_imported := v_media.storage_path like 'listing-media-intake/%';

  -- Public copies the Hub should delete (bucket-qualified paths, de-duplicated).
  select coalesce(array_agg(distinct p), array[]::text[]) into v_public
    from unnest(array[v_media.storage_path, v_media.processed_path, v_media.thumbnail_path]) p
   where p like 'listing-media-public/%';

  if v_imported then
    perform set_config('propertiguru.listing_media_remove', 'on', true);
    update public.listing_media
       set processing_state = 'removed', is_cover = false,
           processed_path = null, thumbnail_path = null
     where id = p_media;
    perform set_config('propertiguru.listing_media_remove', 'off', true);
  else
    delete from public.listing_media where id = p_media;
  end if;

  if v_media.is_cover then
    select m.id into v_next from public.listing_media m
     where m.listing_id = v_media.listing_id and m.processing_state not in ('failed', 'quarantined', 'removed')
     order by (m.processing_state = 'ready') desc, m.position, m.created_at
     limit 1;
    if v_next is not null then
      update public.listing_media set is_cover = true where id = v_next;
    end if;
  end if;

  perform public.log_audit('listing_media.removed', 'listing', v_media.listing_id::text,
    jsonb_build_object('media', p_media, 'state', v_media.processing_state, 'was_cover', v_media.is_cover, 'imported', v_imported),
    jsonb_build_object('new_cover', v_next, 'kept_as_evidence', v_imported, 'public_files_to_delete', to_jsonb(v_public)));
  return jsonb_build_object('ok', true, 'public_paths', to_jsonb(v_public), 'new_cover', v_next, 'kept_as_evidence', v_imported);
end;
$$;

revoke all on function public.listing_media_set_cover(uuid) from public, anon;
revoke all on function public.listing_media_reorder(uuid, uuid[]) from public, anon;
revoke all on function public.listing_media_remove(uuid) from public, anon;
grant execute on function public.listing_media_set_cover(uuid) to authenticated;
grant execute on function public.listing_media_reorder(uuid, uuid[]) to authenticated;
grant execute on function public.listing_media_remove(uuid) to authenticated;

-- guard_intake_media: the live staging definition (00110) with one addition at
-- the top of the intake check: the remove function may set 'removed'.
CREATE OR REPLACE FUNCTION public.guard_intake_media()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return new;                                  -- operator path (the processor)
  end if;
  -- 00112: the owner's gallery removal (listing_media_remove) may move an
  -- imported photo to 'removed' and nothing else.
  if current_setting('propertiguru.listing_media_remove', true) = 'on'
     and new.processing_state = 'removed' and new.is_cover = false
     and new.storage_path is not distinct from old.storage_path
     and new.derived_path is not distinct from old.derived_path
     and new.derived_thumb_path is not distinct from old.derived_thumb_path then
    return new;
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
$function$;

-- compute_listing_quality: the live staging definition with one change: a
-- removed photo no longer counts towards the photo score.
CREATE OR REPLACE FUNCTION public.compute_listing_quality(p_listing_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l record; p record;
  v_media int; v_depth int; v_verified boolean; v_comp record;
  v_apartment boolean; v_residential boolean;
  v_total_fields int := 0; v_filled int := 0;
  s_complete int; s_photo int; s_title int; s_desc int; s_price int := 60; s_loc int;
  s_verif int; s_fresh int; s_dup int := 0; s_resp int;
  v_total int; v_place text; v_size numeric; v_ratio numeric;
  v_leads int; v_on_time int;
  recs jsonb := '[]'::jsonb;
  missing text[] := '{}';
begin
  select * into l from public.listings where id = p_listing_id;
  if not found then return null; end if;
  if not (auth.uid() is null or public.owns_listing(p_listing_id) or public.is_platform_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into p from public.properties where id = l.property_id;

  v_residential := p.property_category = 'residential';
  v_apartment := p.property_type in ('apartemen', 'kondominium', 'kost', 'apartment', 'condominium',
                                     'serviced_residence', 'flat', 'soho', 'studio', 'penthouse', 'kantor', 'office_space');

  -- completeness: count what applies, count what is filled, remember what is missing
  v_total_fields := v_total_fields + 1; if p.location_id is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'location'); end if;
  v_total_fields := v_total_fields + 1; if nullif(p.general_address, '') is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'general_address'); end if;
  v_total_fields := v_total_fields + 1; if p.building_size is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'building_size'); end if;
  if not v_apartment then
    v_total_fields := v_total_fields + 1; if p.land_size is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'land_size'); end if;
  end if;
  if v_residential then
    v_total_fields := v_total_fields + 1; if p.bedrooms is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'bedrooms'); end if;
    v_total_fields := v_total_fields + 1; if p.bathrooms is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'bathrooms'); end if;
    v_total_fields := v_total_fields + 1; if nullif(p.furnishing, '') is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'furnishing'); end if;
  end if;
  v_total_fields := v_total_fields + 1; if p.year_built is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'year_built'); end if;
  v_total_fields := v_total_fields + 1; if nullif(p.property_condition, '') is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'property_condition'); end if;
  v_total_fields := v_total_fields + 1; if nullif(p.ownership_type, '') is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'ownership_type'); end if;
  v_total_fields := v_total_fields + 1; if coalesce(cardinality(p.facilities), 0) > 0 then v_filled := v_filled + 1; else missing := array_append(missing, 'facilities'); end if;
  v_total_fields := v_total_fields + 1; if length(coalesce(l.description, '')) >= 120 then v_filled := v_filled + 1; end if;
  s_complete := round(100.0 * v_filled / greatest(v_total_fields, 1));

  -- photos
  select count(*) into v_media from public.listing_media where listing_id = p_listing_id and kind = 'image' and processing_state <> 'removed';
  s_photo := case when v_media = 0 then 0 when v_media <= 2 then 30 when v_media <= 4 then 60 when v_media <= 7 then 85 else 100 end;
  if v_media < 5 then recs := recs || jsonb_build_object('key', 'add_photos', 'n', 5 - v_media); end if;

  -- title
  s_title := case when length(l.title) between 30 and 90 then 100 else 60 end;
  if length(l.title) > 12 and l.title = upper(l.title) then s_title := s_title - 30; end if;
  if l.title ~* '(!!!|murah banget|wajib|buruan)' then s_title := s_title - 30; end if;
  v_place := coalesce(p.district_name, p.regency_name);
  if v_place is not null and position(lower(split_part(v_place, ' ', 1)) in lower(l.title)) = 0 then
    s_title := s_title - 20;
    recs := recs || jsonb_build_object('key', 'title_location', 'place', v_place);
  end if;
  s_title := greatest(s_title, 0);

  -- description
  s_desc := case when length(coalesce(l.description, '')) >= 300 then 100
                 when length(coalesce(l.description, '')) >= 120 then 70
                 when length(coalesce(l.description, '')) > 0 then 40 else 0 end;
  if length(coalesce(l.description, '')) < 120 then recs := recs || jsonb_build_object('key', 'describe_more', 'min', 120); end if;
  if coalesce(l.description, '') ~ '(\m08[0-9]{8,}|\+62[0-9]{8,}|\+60[0-9]{8,}|\m01[0-9]-?[0-9]{7,})' then
    s_desc := 0;
    recs := recs || jsonb_build_object('key', 'remove_phone');
  end if;

  -- price against comparables (same country, kind, regency; never across a border)
  if l.price > 0 then
    select * into v_comp from public.listing_comparables(p.country_code, l.listing_type, p.property_type, p.regency_name, p.bedrooms, l.id);
    v_size := coalesce(nullif(p.building_size, 0), nullif(p.land_size, 0));
    if v_comp.n >= 3 then
      if v_size is not null and v_comp.median_per_sqm is not null then
        v_ratio := (l.price / v_size) / v_comp.median_per_sqm;
      elsif v_comp.median_price is not null then
        v_ratio := l.price / v_comp.median_price;
      end if;
      if v_ratio is not null then
        s_price := case when v_ratio between 0.85 and 1.15 then 100 when v_ratio between 0.70 and 1.30 then 70 else 40 end;
        if v_ratio > 1.15 then recs := recs || jsonb_build_object('key', 'price_above_comparables', 'pct', round((v_ratio - 1) * 100), 'n', v_comp.n);
        elsif v_ratio < 0.85 then recs := recs || jsonb_build_object('key', 'price_below_comparables', 'pct', round((1 - v_ratio) * 100), 'n', v_comp.n); end if;
      end if;
    end if;
  end if;

  -- location depth: 1 = province/state, 2 = regency/district, 3+ = district/township
  v_depth := case when p.location_id is null then 0 else coalesce(cardinality(p.ancestor_location_ids), 0) end;
  s_loc := case when v_depth = 0 then 20 when v_depth = 1 then 40 when v_depth = 2 then 70 else 100 end;
  if v_depth < 3 then recs := recs || jsonb_build_object('key', 'refine_location'); end if;

  -- verification, freshness
  select agent_status = 'verified' into v_verified from public.profiles where id = l.agent_id;
  s_verif := case when v_verified then 100 else 0 end;
  s_fresh := case when l.status <> 'published' then 50
                  when l.published_at > now() - interval '30 days' then 100
                  when l.published_at > now() - interval '60 days' then 70 else 40 end;

  -- a near-identical live listing anywhere on the platform
  if exists (
    select 1 from public.listings o join public.properties op on op.id = o.property_id
    where o.id <> l.id and o.status in ('draft', 'pending_review', 'published')
      and op.country_code = p.country_code and op.property_type = p.property_type
      and op.regency_name is not distinct from p.regency_name
      and op.bedrooms is not distinct from p.bedrooms
      and o.listing_type = l.listing_type
      and abs(o.price - l.price) <= l.price * 0.02
  ) then
    s_dup := 60;
    recs := recs || jsonb_build_object('key', 'possible_duplicate');
  end if;

  -- responsiveness: the agent's last 90 days of leads, answered before the deadline
  select count(*), count(*) filter (where first_responded_at is not null and first_responded_at <= first_response_due)
    into v_leads, v_on_time
  from public.leads where agent_id = l.agent_id and created_at > now() - interval '90 days';
  s_resp := case when v_leads = 0 then 70 else round(100.0 * v_on_time / v_leads) end;

  -- missing fields, at most three, after the bigger wins
  if cardinality(missing) > 0 then
    recs := recs || (select jsonb_agg(jsonb_build_object('key', 'add_field', 'field', m)) from unnest(missing[1:3]) m);
  end if;

  v_total := round(0.20 * s_complete + 0.20 * s_photo + 0.10 * s_title + 0.15 * s_desc + 0.10 * s_price
                 + 0.10 * s_loc + 0.05 * s_verif + 0.05 * s_fresh + 0.05 * (100 - s_dup));
  v_total := least(greatest(v_total, 0), 100);

  insert into public.listing_quality_scores as q
    (listing_id, total_score, completeness, photo_quality, title_quality, description_quality,
     price_competitiveness, location_accuracy, verification, freshness, duplicate_risk, agent_responsiveness,
     recommendations, computed_at)
  values (p_listing_id, v_total, s_complete, s_photo, s_title, s_desc, s_price, s_loc, s_verif, s_fresh, s_dup, s_resp, recs, now())
  on conflict (listing_id) do update set
    total_score = excluded.total_score, completeness = excluded.completeness, photo_quality = excluded.photo_quality,
    title_quality = excluded.title_quality, description_quality = excluded.description_quality,
    price_competitiveness = excluded.price_competitiveness, location_accuracy = excluded.location_accuracy,
    verification = excluded.verification, freshness = excluded.freshness, duplicate_risk = excluded.duplicate_risk,
    agent_responsiveness = excluded.agent_responsiveness, recommendations = excluded.recommendations, computed_at = now();

  -- Stamping the denormalised column does not re-fire the listings trigger:
  -- quality_score is not in its column list.
  update public.listings set quality_score = v_total where id = p_listing_id and quality_score is distinct from v_total;
  return v_total;
end $function$;
