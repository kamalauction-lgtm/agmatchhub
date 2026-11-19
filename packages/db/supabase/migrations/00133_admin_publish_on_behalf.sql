-- =============================================================================
-- 00133 — An admin publishes an agent's imported listings on their behalf,
-- when the agent's consent is recorded (owner, 19 Nov 2026; lifts hold D-2)
--
-- Until now only the agent could commit a batch an admin had prepared (D15,
-- 00107), and the admin who prepared it could never approve the result
-- (separation of duties). The owner decided:
--   · an admin may commit a prepared batch for the agent, but only when the
--     agent's latest onboarding consent (00132) includes publish_on_behalf;
--   · for such a batch the same admin may also approve the listings.
-- Every other batch keeps both rules exactly as before.
--
--   1. import_batches.on_behalf_consent_id (→ agent_onboarding_consents),
--      committed_on_behalf_by (→ auth.users, hard rule 6) and
--      committed_on_behalf_at: set once, only by the function below.
--   2. admin_can_commit_for_batch(batch): listing.import_assisted in the
--      agent's country, not yourself, an admin-prepared batch the agent has
--      not taken control of (00119), and agent_allows(agent,
--      'publish_on_behalf').
--   3. admin_import_batch_commit_authorise(batch): re-checks, stamps the
--      consent and the admin, audits, notifies the agent. The Hub then writes
--      the listings for the agent with the service role, as pending_review.
--   4. guard_assisted_listing_moderation: the preparing admin may approve a
--      listing whose batch was committed on behalf while the consent still
--      stands. A withdrawn consent restores the two-person rule.
--
-- No policy subqueries its own table (hard rule 4).
-- Rollback: restore guard_assisted_listing_moderation from 00107; drop the two
-- functions, the guard trigger and the three columns.
-- =============================================================================

alter table public.import_batches
  add column if not exists on_behalf_consent_id uuid references public.agent_onboarding_consents(id),
  add column if not exists committed_on_behalf_by uuid references auth.users(id) on delete set null,
  add column if not exists committed_on_behalf_at timestamptz;

create or replace function public.guard_import_batch_on_behalf()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.on_behalf_consent_id is not distinct from old.on_behalf_consent_id
     and new.committed_on_behalf_by is not distinct from old.committed_on_behalf_by
     and new.committed_on_behalf_at is not distinct from old.committed_on_behalf_at then
    return new;
  end if;
  if old.on_behalf_consent_id is not null then
    raise exception 'an on-behalf commit is recorded once' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null
     or current_setting('propertiguru.on_behalf_commit', true) = 'on' then
    return new;
  end if;
  raise exception 'on-behalf commits are recorded only by admin_import_batch_commit_authorise' using errcode = '42501';
end;
$$;

drop trigger if exists trg_import_batches_on_behalf on public.import_batches;
create trigger trg_import_batches_on_behalf
  before update of on_behalf_consent_id, committed_on_behalf_by, committed_on_behalf_at on public.import_batches
  for each row execute function public.guard_import_batch_on_behalf();

create or replace function public.admin_can_commit_for_batch(p_batch uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.import_batches b
     where b.id = p_batch
       and b.acting_admin_id is not null
       and b.on_behalf_consent_id is null
       and coalesce(b.agent_review_state, '') <> 'complete'
       and public.admin_can_import_for(b.agent_id)
       and public.agent_allows(b.agent_id, 'publish_on_behalf')
  );
$$;

create or replace function public.admin_import_batch_commit_authorise(p_batch uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_b record;
  v_consent record;
  v_ready int;
begin
  select * into v_b from public.import_batches where id = p_batch for update;
  if v_b.id is null or not public.admin_can_import_for(v_b.agent_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_b.acting_admin_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_assisted');
  end if;
  if v_b.on_behalf_consent_id is not null then
    return jsonb_build_object('ok', false, 'error', 'already_committed');
  end if;
  if coalesce(v_b.agent_review_state, '') = 'complete' then
    return jsonb_build_object('ok', false, 'error', 'agent_in_control');
  end if;
  if not public.agent_allows(v_b.agent_id, 'publish_on_behalf') then
    return jsonb_build_object('ok', false, 'error', 'no_consent');
  end if;
  select c.id, c.method, c.consented_at into v_consent
    from public.agent_onboarding_consents c
   where c.user_id = v_b.agent_id and 'publish_on_behalf' = any(c.scopes) and c.status = 'given'
   order by c.created_at desc limit 1;
  select count(*) into v_ready from public.import_items where batch_id = p_batch and status = 'ready';
  if v_ready = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_ready');
  end if;

  perform set_config('propertiguru.on_behalf_commit', 'on', true);
  update public.import_batches
     set on_behalf_consent_id = v_consent.id, committed_on_behalf_by = auth.uid(), committed_on_behalf_at = now()
   where id = p_batch;
  perform set_config('propertiguru.on_behalf_commit', 'off', true);

  perform public.log_audit('listing_import.assisted_committed_on_behalf', 'import_batch', p_batch::text, null,
    jsonb_build_object('agent_id', v_b.agent_id, 'consent_id', v_consent.id, 'consent_method', v_consent.method,
                       'consented_at', v_consent.consented_at, 'ready', v_ready), null);
  insert into public.notifications (user_id, kind, payload, href)
  values (v_b.agent_id, 'listing_import.committed_on_behalf', jsonb_build_object('ref', v_ready), '/listings');
  return jsonb_build_object('ok', true, 'agent', v_b.agent_id, 'consent', v_consent.id, 'ready', v_ready);
end;
$$;

revoke all on function public.admin_can_commit_for_batch(uuid) from public, anon;
revoke all on function public.admin_import_batch_commit_authorise(uuid) from public, anon;
grant execute on function public.admin_can_commit_for_batch(uuid) to authenticated;
grant execute on function public.admin_import_batch_commit_authorise(uuid) to authenticated;

-- Was this listing committed on the agent's behalf, with the consent standing?
create or replace function public.listing_committed_on_behalf(p_listing uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.import_items i
    join public.import_batches b on b.id = i.batch_id
    where i.listing_id = p_listing
      and b.on_behalf_consent_id is not null
      and public.agent_allows(b.agent_id, 'publish_on_behalf')
  );
$$;
revoke all on function public.listing_committed_on_behalf(uuid) from public, anon;
grant execute on function public.listing_committed_on_behalf(uuid) to authenticated;

create or replace function public.guard_assisted_listing_moderation()
returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if ((new.moderation_state = 'approved' and old.moderation_state is distinct from 'approved')
      or (new.status = 'published' and old.status is distinct from 'published'))
     and public.prepared_by_me(new.id)
     and not public.listing_committed_on_behalf(new.id) then
    raise exception 'separation_of_duties: you prepared this listing''s import, so another admin must approve it'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 5. Latent bug found while testing "the agent can withdraw" (00133) ------------
-- guard_listing_comarketing_notice (00051) runs as the agent who changes a live
-- listing, and calls notify_comarketing_agents, which (correctly) only the
-- server may execute. So every agent change to a published listing's status
-- (withdraw, sold, rented) or price failed with "permission denied for function
-- notify_comarketing_agents". The trigger only passes NEW/OLD values of the row
-- being changed, so it runs with the owner's rights; the notify function stays
-- closed to direct calls.
alter function public.guard_listing_comarketing_notice() security definer;
alter function public.guard_listing_comarketing_notice() set search_path = public;
