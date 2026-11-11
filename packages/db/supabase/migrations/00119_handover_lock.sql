-- =============================================================================
-- 00119 — after handover, the agent is in control (P1-b-5, screen 14)
--
-- Approved plan, "Self-service handover": when the agent has handled every
-- prepared item, the batch's agent_review_state becomes `complete`. From then
-- on the admin team has no edit path to those listings — they are normal
-- listings — and keeps only moderation powers.
--
-- Until now nothing changed at that point: an in-country admin could still
-- edit the batch, its items, and (through the "admin all" policies) the
-- resulting listings, properties, private property data and photos.
--
--   1. import_batches.agent_review_state ('preparing' → 'in_review' →
--      'complete', admin-prepared batches only; NULL for an agent's own) and
--      agent_review_completed_at. Kept by refresh_agent_review_state(), called
--      on every item change and on handover. `complete` is permanent. The
--      columns are written only by that function (guarded).
--   2. On completion: audited, and the agent gets an in-app notification.
--   3. The lock. For a listing or property that came from a COMPLETE admin-
--      prepared batch, anyone other than its agent (and other than the
--      service role / operator path) may change only the moderation,
--      featuring, verification and counter columns of the listing — never its
--      content — and may not edit or delete the property, its private data or
--      its photos. Admin photo moderation (00114 functions, which set
--      propertiguru.media_review) still works. Items and the batch itself are
--      closed to the admin team.
--
-- Every guard reads NEW/OLD and helpers on OTHER tables only (hard rule 4).
--
-- Rollback: drop the triggers and functions below; drop the two columns.
-- =============================================================================

alter table public.import_batches
  add column if not exists agent_review_state text
    check (agent_review_state in ('preparing', 'in_review', 'complete')),
  add column if not exists agent_review_completed_at timestamptz;

comment on column public.import_batches.agent_review_state is
  'Admin-prepared batches only: preparing (not handed over), in_review (the agent is handling items), complete (every item handled; the admin team has no edit path to the resulting listings). NULL for an agent''s own batch. Written only by refresh_agent_review_state().';

-- An item is handled once the agent imported it, declined it, or it cannot be imported.
create or replace function public.import_item_handled(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('imported', 'skipped', 'failed');
$$;

-- -----------------------------------------------------------------------------
-- 1. The state, and who may write it
-- -----------------------------------------------------------------------------

create or replace function public.guard_agent_review_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.acting_admin_id is not null then
      new.agent_review_state := 'preparing';
      new.agent_review_completed_at := null;
    else
      new.agent_review_state := null;
      new.agent_review_completed_at := null;
    end if;
    return new;
  end if;
  if auth.uid() is null or current_setting('propertiguru.review_state', true) = 'on' then
    return new;
  end if;
  if new.agent_review_state is distinct from old.agent_review_state
     or new.agent_review_completed_at is distinct from old.agent_review_completed_at then
    raise exception 'agent_review_state is kept by the database' using errcode = '42501';
  end if;
  -- The batch itself is closed to the admin team once the agent is in control.
  if old.agent_review_state = 'complete' and old.agent_id is distinct from auth.uid() then
    raise exception 'handover_lock: the agent is in control of this batch' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_import_batches_review_state on public.import_batches;
create trigger trg_import_batches_review_state
  before insert or update on public.import_batches
  for each row execute function public.guard_agent_review_state();

create or replace function public.refresh_agent_review_state(p_batch uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_batch record;
  v_next text;
begin
  select b.id, b.agent_id, b.acting_admin_id, b.handed_over_at, b.agent_review_state
    into v_batch from public.import_batches b where b.id = p_batch;
  if v_batch.id is null or v_batch.acting_admin_id is null then
    return null;
  end if;
  if v_batch.agent_review_state = 'complete' then
    return 'complete';                                   -- permanent
  end if;
  if v_batch.handed_over_at is null then
    v_next := 'preparing';
  elsif exists (select 1 from public.import_items i where i.batch_id = p_batch)
    and not exists (select 1 from public.import_items i where i.batch_id = p_batch and not public.import_item_handled(i.status)) then
    v_next := 'complete';
  else
    v_next := 'in_review';
  end if;
  if v_next is distinct from v_batch.agent_review_state then
    perform set_config('propertiguru.review_state', 'on', true);
    update public.import_batches
       set agent_review_state = v_next,
           agent_review_completed_at = case when v_next = 'complete' then now() else null end
     where id = p_batch;
    perform set_config('propertiguru.review_state', 'off', true);
    if v_next = 'complete' then
      perform public.log_audit('listing_import.assisted_review_complete', 'import_batch', p_batch::text, null,
        jsonb_build_object('agent_id', v_batch.agent_id,
          'imported', (select count(*) from public.import_items i where i.batch_id = p_batch and i.status = 'imported'),
          'skipped', (select count(*) from public.import_items i where i.batch_id = p_batch and i.status = 'skipped')));
      insert into public.notifications (user_id, kind, payload, href)
      values (v_batch.agent_id, 'listing_import.handover_complete', jsonb_build_object('batch', p_batch), '/listings/import/' || p_batch::text);
    end if;
  end if;
  return v_next;
end;
$$;

revoke all on function public.refresh_agent_review_state(uuid) from public, anon, authenticated;

create or replace function public.on_import_item_review_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_agent_review_state(coalesce(new.batch_id, old.batch_id));
  return null;
end;
$$;

drop trigger if exists trg_import_items_review_state on public.import_items;
create trigger trg_import_items_review_state
  after insert or update of status or delete on public.import_items
  for each row execute function public.on_import_item_review_state();

-- Handover now also moves the batch to in_review (or straight to complete if
-- the agent has, unusually, already handled everything). Same checks as 00107.
create or replace function public.admin_import_batch_handover(p_batch uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_batch public.import_batches;
begin
  select * into v_batch from public.import_batches where id = p_batch for update;
  if v_batch.id is null or v_batch.acting_admin_id is null
     or not public.admin_can_import_for(v_batch.agent_id) then
    raise exception 'not permitted to hand over this batch' using errcode = '42501';
  end if;
  if v_batch.agent_review_state = 'complete' then
    raise exception 'handover_lock: the agent is already in control of this batch' using errcode = '42501';
  end if;
  update public.import_batches set handed_over_at = now() where id = p_batch;
  perform public.refresh_agent_review_state(p_batch);
  perform public.log_audit('listing_import.assisted_handed_over', 'import_batch', p_batch::text,
    null, jsonb_build_object('agent_id', v_batch.agent_id,
      'ready', (select count(*) from public.import_items i where i.batch_id = p_batch and i.status = 'ready')));
  return v_batch.agent_id;
end;
$$;

-- Existing admin-prepared batches get their state (operator path: no guard).
update public.import_batches b
   set agent_review_state = case
         when b.handed_over_at is null then 'preparing'
         when exists (select 1 from public.import_items i where i.batch_id = b.id)
          and not exists (select 1 from public.import_items i where i.batch_id = b.id and not public.import_item_handled(i.status)) then 'complete'
         else 'in_review' end
 where b.acting_admin_id is not null;
update public.import_batches set agent_review_completed_at = now()
 where agent_review_state = 'complete' and agent_review_completed_at is null;

-- -----------------------------------------------------------------------------
-- 2. Lookups for the lock (they read import_items / import_batches only)
-- -----------------------------------------------------------------------------

create or replace function public.agent_in_control_listing(p_listing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.import_items i join public.import_batches b on b.id = i.batch_id
     where i.listing_id = p_listing and b.acting_admin_id is not null and b.agent_review_state = 'complete');
$$;

create or replace function public.agent_in_control_property(p_property uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.import_items i join public.import_batches b on b.id = i.batch_id
     where i.property_id = p_property and b.acting_admin_id is not null and b.agent_review_state = 'complete');
$$;

revoke all on function public.agent_in_control_listing(uuid) from public, anon;
revoke all on function public.agent_in_control_property(uuid) from public, anon;
grant execute on function public.agent_in_control_listing(uuid) to authenticated;
grant execute on function public.agent_in_control_property(uuid) to authenticated;

/** A trusted writer: the operator path (no session) or the service role. */
create or replace function public.handover_lock_exempt()
returns boolean language sql stable as $$
  select auth.uid() is null or coalesce(auth.role(), '') = 'service_role';
$$;

-- -----------------------------------------------------------------------------
-- 3. The lock
-- -----------------------------------------------------------------------------

-- Listings: only these columns may change for someone other than the agent.
create or replace function public.guard_handover_lock_listing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_free text[] := array['status', 'moderation_state', 'moderated_by', 'moderated_at', 'moderation_reason',
    'moderation_reason_code', 'published_at', 'expires_at', 'archived_at', 'is_verified', 'last_verified_at',
    'is_featured', 'featured_until', 'quality_score', 'ranking_score', 'view_count', 'save_count',
    'inquiry_count', 'updated_at'];
begin
  if public.handover_lock_exempt() or old.agent_id = auth.uid() or not public.agent_in_control_listing(old.id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'handover_lock: the agent is in control of this listing' using errcode = '42501';
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'handover_lock: only moderation is open to the admin team on this listing' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listings_handover_lock on public.listings;
create trigger trg_listings_handover_lock
  before update or delete on public.listings
  for each row execute function public.guard_handover_lock_listing();

create or replace function public.guard_handover_lock_property()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.handover_lock_exempt() or old.agent_id = auth.uid() or not public.agent_in_control_property(old.id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'handover_lock: the agent is in control of this property' using errcode = '42501';
end;
$$;

drop trigger if exists trg_properties_handover_lock on public.properties;
create trigger trg_properties_handover_lock
  before update or delete on public.properties
  for each row execute function public.guard_handover_lock_property();

create or replace function public.guard_handover_lock_property_private()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_property uuid := case when tg_op = 'DELETE' then old.property_id else new.property_id end;
begin
  if public.handover_lock_exempt() or public.owns_property(v_property) or not public.agent_in_control_property(v_property) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'handover_lock: the agent is in control of this property' using errcode = '42501';
end;
$$;

drop trigger if exists trg_property_private_handover_lock on public.property_private;
create trigger trg_property_private_handover_lock
  before insert or update or delete on public.property_private
  for each row execute function public.guard_handover_lock_property_private();

create or replace function public.guard_handover_lock_media()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_listing uuid := case when tg_op = 'DELETE' then old.listing_id else new.listing_id end;
begin
  if public.handover_lock_exempt() or public.owns_listing(v_listing)
     or current_setting('propertiguru.media_review', true) = 'on'      -- 00114 moderation functions
     or not public.agent_in_control_listing(v_listing) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'handover_lock: the agent is in control of this listing''s photos' using errcode = '42501';
end;
$$;

drop trigger if exists trg_listing_media_handover_lock on public.listing_media;
create trigger trg_listing_media_handover_lock
  before insert or update or delete on public.listing_media
  for each row execute function public.guard_handover_lock_media();

-- Items of a complete batch are closed to everyone but the agent.
create or replace function public.guard_handover_lock_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := case when tg_op = 'DELETE' then old.batch_id else new.batch_id end;
begin
  if public.handover_lock_exempt() or public.owns_import_batch(v_batch) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.import_batches b where b.id = v_batch and b.agent_review_state = 'complete') then
    raise exception 'handover_lock: the agent is in control of this batch' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_import_items_handover_lock on public.import_items;
create trigger trg_import_items_handover_lock
  before insert or update or delete on public.import_items
  for each row execute function public.guard_handover_lock_item();
