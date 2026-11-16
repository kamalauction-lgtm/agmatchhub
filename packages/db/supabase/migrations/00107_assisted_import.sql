-- =============================================================================
-- 00107 — Assisted listing import, slice P0-d-1: admin prepares, agent commits
--
-- Owner decisions (10 Nov 2026):
--   · `listing.import_assisted` for exactly super_admin, admin and
--     country_admin (the agent.invite holders); not compliance_admin.
--   · The ADMIN prepares a batch that belongs to the AGENT; the AGENT reviews
--     it, accepts listing_import_authority personally and commits it. An
--     admin committing on the agent's behalf (P0-d-2) waits for counsel.
--   · The admin who prepared a batch may not approve moderation of the
--     listings it produced.
--
-- WHAT THIS ADDS
--   1. The capability and its three grants.
--   2. import_batches.acting_admin_id (who prepared it; NULL for an agent's
--      own batch) and handed_over_at. acting_admin_id is set only by
--      admin_import_batch_create() and can never change afterwards.
--   3. Admin access to batches and items split into READ (unchanged scope,
--      00105) and WRITE (listing.import_assisted for the agent's country).
--      Batches are created by admins only through the function, never by a
--      direct insert. compliance_admin keeps read access and loses writes.
--   4. D15 guard: an authority consent for an import batch can be recorded
--      only by the batch's owner. Before this, an admin who could see an
--      agent's batch and ran the commit would have recorded the agent's
--      authority declaration — and created the listings — as themselves.
--   5. Separation of duties on moderation.
--
-- Photos are untouched (P0-e-1). Depends on 00060, 00103, 00105.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Capability
-- -----------------------------------------------------------------------------

insert into public.capabilities (key, description)
values ('listing.import_assisted', 'Prepare listing imports for an agent, for the agent to review and commit')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_key)
select r.id, 'listing.import_assisted'
from public.roles r
where r.key in ('super_admin', 'admin', 'country_admin')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. Columns
-- -----------------------------------------------------------------------------

alter table public.import_batches
  add column if not exists acting_admin_id uuid references auth.users(id),
  add column if not exists handed_over_at timestamptz;

comment on column public.import_batches.acting_admin_id is
  'The admin who prepared this batch for the agent (00107). NULL when the agent started it. Set only by admin_import_batch_create(); immutable.';

create index if not exists idx_import_batches_acting_admin
  on public.import_batches (acting_admin_id) where acting_admin_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Scope helpers
-- -----------------------------------------------------------------------------

/** May the caller prepare imports for this agent? listing.import_assisted for the agent's country. */
create or replace function public.admin_can_import_for(p_agent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and p_agent is distinct from auth.uid()
     and public.has_capability_in(
           'listing.import_assisted',
           (select p.country_code from public.profiles p where p.id = p_agent));
$$;

create or replace function public.admin_can_import_batch(p_batch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_can_import_for((select b.agent_id from public.import_batches b where b.id = p_batch));
$$;

revoke all on function public.admin_can_import_for(uuid) from public, anon;
revoke all on function public.admin_can_import_batch(uuid) from public, anon;
grant execute on function public.admin_can_import_for(uuid) to authenticated;
grant execute on function public.admin_can_import_batch(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Admin access: read as before, write only with the capability
-- -----------------------------------------------------------------------------

drop policy if exists "import batches admin" on public.import_batches;
create policy "import batches admin read" on public.import_batches
  for select to authenticated using (public.admin_sees_user(agent_id));
create policy "import batches admin update" on public.import_batches
  for update to authenticated
  using (public.admin_can_import_for(agent_id))
  with check (public.admin_can_import_for(agent_id));
-- No admin INSERT or DELETE policy: admins create batches only through
-- admin_import_batch_create(), which stamps acting_admin_id.

drop policy if exists "import items admin" on public.import_items;
create policy "import items admin read" on public.import_items
  for select to authenticated using (public.admin_sees_import_batch(batch_id));
create policy "import items admin insert" on public.import_items
  for insert to authenticated with check (public.admin_can_import_batch(batch_id));
create policy "import items admin update" on public.import_items
  for update to authenticated
  using (public.admin_can_import_batch(batch_id))
  with check (public.admin_can_import_batch(batch_id));

-- acting_admin_id: set once, by the function, never edited — not by the agent
-- (whose own-batch policy allows updates) and not by another admin.
create or replace function public.guard_import_batch_provenance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;                                    -- operator path
  end if;
  if tg_op = 'INSERT' then
    if new.acting_admin_id is not null
       and current_setting('propertiguru.assisted_import_create', true) is distinct from 'on' then
      raise exception 'acting_admin_id is set only by admin_import_batch_create' using errcode = '42501';
    end if;
  elsif new.acting_admin_id is distinct from old.acting_admin_id
     or new.agent_id is distinct from old.agent_id then
    raise exception 'an import batch''s owner and preparing admin cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_import_batches_provenance
  before insert or update on public.import_batches
  for each row execute function public.guard_import_batch_provenance();

-- -----------------------------------------------------------------------------
-- 5. Admin functions: create and hand over
-- -----------------------------------------------------------------------------

create or replace function public.admin_import_batch_create(
  p_agent uuid,
  p_source_kind text,
  p_source_portal text,
  p_source_label text,
  p_status text default 'processing',
  p_error text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_country text;
begin
  if not public.admin_can_import_for(p_agent) then
    raise exception 'not permitted to prepare imports for this agent' using errcode = '42501';
  end if;
  select country_code into v_country from public.profiles where id = p_agent;

  perform set_config('propertiguru.assisted_import_create', 'on', true);
  insert into public.import_batches (agent_id, acting_admin_id, source_kind, source_portal,
    source_label, status, error)
  values (p_agent, auth.uid(), p_source_kind, p_source_portal, left(p_source_label, 200),
    p_status, p_error)
  returning id into v_id;
  perform set_config('propertiguru.assisted_import_create', 'off', true);

  perform public.log_audit('listing_import.assisted_batch_created', 'import_batch', v_id::text,
    null, jsonb_build_object('agent_id', p_agent, 'country_code', v_country,
                             'source_kind', p_source_kind, 'source_portal', p_source_portal));
  return v_id;
end;
$$;

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
  update public.import_batches set handed_over_at = now() where id = p_batch;
  perform public.log_audit('listing_import.assisted_handed_over', 'import_batch', p_batch::text,
    null, jsonb_build_object('agent_id', v_batch.agent_id,
      'ready', (select count(*) from public.import_items i where i.batch_id = p_batch and i.status = 'ready')));
  return v_batch.agent_id;
end;
$$;

revoke all on function public.admin_import_batch_create(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.admin_import_batch_handover(uuid) from public, anon;
grant execute on function public.admin_import_batch_create(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_import_batch_handover(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. D15: the authority for a batch is the batch owner's to give
-- -----------------------------------------------------------------------------

create or replace function public.guard_import_consent_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.import_batch_ref is null or auth.uid() is null then
    return new;
  end if;
  if not exists (
    select 1 from public.import_batches b
    where b.id = new.import_batch_ref and b.agent_id = auth.uid() and new.user_id = auth.uid()
  ) then
    raise exception 'only the agent who owns an import batch can accept its authority declaration'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_consent_records_import_owner
  before insert on public.consent_records
  for each row execute function public.guard_import_consent_owner();

-- -----------------------------------------------------------------------------
-- 7. Separation of duties: the preparing admin cannot approve those listings
-- -----------------------------------------------------------------------------

create or replace function public.prepared_by_me(p_listing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.import_items i
    join public.import_batches b on b.id = i.batch_id
    where i.listing_id = p_listing and b.acting_admin_id = auth.uid()
  );
$$;

revoke all on function public.prepared_by_me(uuid) from public, anon;
grant execute on function public.prepared_by_me(uuid) to authenticated;

create or replace function public.guard_assisted_listing_moderation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if ((new.moderation_state = 'approved' and old.moderation_state is distinct from 'approved')
      or (new.status = 'published' and old.status is distinct from 'published'))
     and public.prepared_by_me(new.id) then
    raise exception 'separation_of_duties: you prepared this listing''s import, so another admin must approve it'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_listings_assisted_moderation
  before update of moderation_state, status on public.listings
  for each row execute function public.guard_assisted_listing_moderation();
