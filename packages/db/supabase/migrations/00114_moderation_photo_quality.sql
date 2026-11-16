-- =============================================================================
-- 00114 — moderation and photo quality (P1-a: storyboard screens 9, 7, 6)
--
-- 1. `media.review` — the capability key the approved plan names for the
--    Photo Quality Centre. Granted to exactly the roles that already hold
--    `listing.moderate` (super_admin, admin, country_admin, compliance_admin):
--    no one gains access they did not have; the screen gets its own key.
-- 2. `listings.moderation_reason_code` — a fixed vocabulary for rejections,
--    so the agent sees a consistent, translatable reason and reporting can
--    count them. The free-text `moderation_reason` stays.
-- 3. Three photo actions for reviewers, each SECURITY DEFINER, each checking
--    `has_capability_in(…, the listing's country)` in the database, each one
--    transaction and audited:
--      admin_media_quarantine(media)  keep a photo out (moderators or reviewers)
--      admin_media_release(media)     undo a keep-out (reviewers; not on a
--                                     listing you prepared — separation of duties)
--      admin_media_retry(media)       give a failed or paused photo a fresh run
--    They change an imported photo's state, which the intake guard refuses to
--    every session; it now admits exactly these transitions while the setting
--    `propertiguru.media_review` is on (set only by these functions).
--
-- Nothing becomes public here: release returns a photo to `processed` (or to
-- `pending` when it was never processed), and publication remains the
-- moderator's approval of the listing.
--
-- Rollback: drop the three functions and the column; restore
-- guard_intake_media from 00112; delete the media.review grants and key.
-- =============================================================================

insert into public.capabilities (key, description)
values ('media.review', 'Review listing photos: see processing failures and pauses, keep photos out, release and retry them')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_key)
select distinct rc.role_id, 'media.review'
  from public.role_capabilities rc
 where rc.capability_key = 'listing.moderate'
on conflict do nothing;

alter table public.listings add column if not exists moderation_reason_code text;
alter table public.listings drop constraint if exists listings_moderation_reason_code_check;
alter table public.listings add constraint listings_moderation_reason_code_check check (
  moderation_reason_code is null or moderation_reason_code = any (array[
    'incomplete_details', 'photos_quality', 'photos_rights', 'price_unrealistic',
    'wrong_location', 'duplicate', 'prohibited_content', 'other'
  ])
);

-- The listing's country for one photo, for the capability checks below.
create or replace function public.media_country(p_media uuid)
returns text
language sql stable security definer set search_path = public as $$
  select p.country_code
    from public.listing_media m
    join public.listings l on l.id = m.listing_id
    join public.properties p on p.id = l.property_id
   where m.id = p_media;
$$;
revoke all on function public.media_country(uuid) from public, anon;
grant execute on function public.media_country(uuid) to authenticated;

create or replace function public.admin_media_quarantine(p_media uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_media record;
  v_country text := public.media_country(p_media);
begin
  if v_country is null
     or not (public.has_capability_in('listing.moderate', v_country) or public.has_capability_in('media.review', v_country)) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select id, listing_id, processing_state into v_media from public.listing_media where id = p_media;
  if v_media.processing_state not in ('pending', 'processing', 'processed', 'failed') then
    return jsonb_build_object('ok', false, 'error', 'not_moderatable');
  end if;
  perform set_config('propertiguru.media_review', 'on', true);
  update public.listing_media set processing_state = 'quarantined', is_cover = false where id = p_media;
  perform set_config('propertiguru.media_review', 'off', true);
  perform public.log_audit('listing_media.quarantined', 'listing_media', p_media::text,
    jsonb_build_object('processing_state', v_media.processing_state),
    jsonb_build_object('processing_state', 'quarantined', 'listing_id', v_media.listing_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_media_release(p_media uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_media record;
  v_country text := public.media_country(p_media);
  v_to text;
begin
  if v_country is null or not public.has_capability_in('media.review', v_country) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select id, listing_id, processing_state, derived_path, derived_thumb_path into v_media from public.listing_media where id = p_media;
  if v_media.processing_state <> 'quarantined' then
    return jsonb_build_object('ok', false, 'error', 'not_quarantined');
  end if;
  -- Whoever prepared this listing's import does not get to undo a keep-out on it.
  if public.prepared_by_me(v_media.listing_id) then
    return jsonb_build_object('ok', false, 'error', 'self_prepared');
  end if;
  v_to := case when v_media.derived_path is not null and v_media.derived_thumb_path is not null then 'processed' else 'pending' end;
  perform set_config('propertiguru.media_review', 'on', true);
  update public.listing_media
     set processing_state = v_to, processing_error = null, processing_next_at = null,
         processing_attempts = case when v_to = 'pending' then 0 else processing_attempts end
   where id = p_media;
  perform set_config('propertiguru.media_review', 'off', true);
  perform public.log_audit('listing_media.released', 'listing_media', p_media::text,
    jsonb_build_object('processing_state', 'quarantined'),
    jsonb_build_object('processing_state', v_to, 'listing_id', v_media.listing_id));
  return jsonb_build_object('ok', true, 'state', v_to);
end;
$$;

create or replace function public.admin_media_retry(p_media uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_media record;
  v_country text := public.media_country(p_media);
begin
  if v_country is null or not public.has_capability_in('media.review', v_country) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select id, listing_id, processing_state, processing_error, processing_attempts into v_media from public.listing_media where id = p_media;
  -- Failed photos, and pending photos held by the quota or the monthly cap.
  -- coalesce: a NULL error would make the whole test NULL, and `not NULL` lets it through.
  if not (v_media.processing_state = 'failed'
          or (v_media.processing_state = 'pending' and coalesce(v_media.processing_error, '') in ('paused_quota', 'paused_cap'))) then
    return jsonb_build_object('ok', false, 'error', 'not_retryable');
  end if;
  perform set_config('propertiguru.media_review', 'on', true);
  update public.listing_media
     set processing_state = 'pending', processing_error = null, processing_next_at = null,
         processing_attempts = 0, processing_started_at = null
   where id = p_media;
  perform set_config('propertiguru.media_review', 'off', true);
  perform public.log_audit('listing_media.retried', 'listing_media', p_media::text,
    jsonb_build_object('processing_state', v_media.processing_state, 'error', v_media.processing_error, 'attempts', v_media.processing_attempts),
    jsonb_build_object('processing_state', 'pending', 'listing_id', v_media.listing_id));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_media_quarantine(uuid) from public, anon;
revoke all on function public.admin_media_release(uuid) from public, anon;
revoke all on function public.admin_media_retry(uuid) from public, anon;
grant execute on function public.admin_media_quarantine(uuid) to authenticated;
grant execute on function public.admin_media_release(uuid) to authenticated;
grant execute on function public.admin_media_retry(uuid) to authenticated;

-- guard_intake_media: the live definition (00112) with one more admitted case:
-- the three reviewer functions above, and nothing else, may change state.
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
  -- 00114: the reviewer functions (admin_media_quarantine / _release / _retry)
  -- set this for their own single update; the paths and derivatives stay as they are.
  if current_setting('propertiguru.media_review', true) = 'on'
     and new.storage_path is not distinct from old.storage_path
     and new.derived_path is not distinct from old.derived_path
     and new.derived_thumb_path is not distinct from old.derived_thumb_path
     and new.processed_path is not distinct from old.processed_path
     and new.thumbnail_path is not distinct from old.thumbnail_path then
    return new;
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
