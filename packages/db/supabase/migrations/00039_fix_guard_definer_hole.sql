-- =============================================================================
-- 00039 — Close the privilege hole 00035/00038 opened
--
-- Those migrations added a "service door" of `current_user in ('postgres',
-- 'service_role')` to the guard triggers. Inside a SECURITY DEFINER function,
-- current_user IS THE FUNCTION OWNER — postgres — for every caller. The door
-- therefore admitted everyone: an ordinary agent could self-publish a listing
-- or rewrite GHL sync fields. Found by re-running the adversarial tests after
-- 00038, which is the only reason it lived for minutes instead of months.
--
-- Fix, two parts:
--   1. The guards drop SECURITY DEFINER. A trigger function does not need it
--      (it runs on rows the statement already reached), and with invoker
--      rights current_user is honest again: 'authenticated' for API users,
--      'service_role' / 'postgres' for genuinely privileged connections.
--   2. session_user is checked as well — it names the connection's login role
--      and is immune to definer shenanigans in either direction.
--
-- Rule for the README: never consult current_user inside SECURITY DEFINER.
-- =============================================================================

create or replace function public.guard_lead_agent_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_platform_admin()
     or auth.role() = 'service_role'
     or current_user in ('postgres', 'service_role')
     or session_user in ('postgres', 'service_role') then
    return new;
  end if;
  if new.agent_id      is distinct from old.agent_id
     or new.contact_id is distinct from old.contact_id
     or new.listing_id is distinct from old.listing_id
     or new.consent_record_id is distinct from old.consent_record_id
     or new.human_readable_id is distinct from old.human_readable_id
     or new.ghl_sync_pending  is distinct from old.ghl_sync_pending
     or new.ghl_opportunity_id is distinct from old.ghl_opportunity_id
     or new.ghl_attempts is distinct from old.ghl_attempts then
    raise exception 'lead assignment and sync fields are not agent-editable';
  end if;
  if old.first_responded_at is not null
     and new.first_responded_at is distinct from old.first_responded_at then
    raise exception 'first response time cannot be rewritten';
  end if;
  return new;
end;
$$;

create or replace function public.guard_listing_moderation_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_platform_admin()
     or auth.role() = 'service_role'
     or current_user in ('postgres', 'service_role')
     or session_user in ('postgres', 'service_role') then
    return new;
  end if;
  if new.moderation_state is distinct from old.moderation_state
     or new.moderated_by is distinct from old.moderated_by
     or new.moderated_at is distinct from old.moderated_at
     or new.moderation_reason is distinct from old.moderation_reason
     or new.is_verified is distinct from old.is_verified
     or new.is_featured is distinct from old.is_featured
     or new.featured_until is distinct from old.featured_until
     or new.quality_score is distinct from old.quality_score
     or new.ranking_score is distinct from old.ranking_score
     or new.human_readable_id is distinct from old.human_readable_id then
    raise exception 'moderation and ranking fields are not agent-editable';
  end if;
  if new.status = 'published' and old.status <> 'published' then
    raise exception 'listings are published by moderation, not by the agent';
  end if;
  return new;
end;
$$;

-- The same review applies to guard_agent_profile_review_fields (00021) and
-- guard_request_admin_fields (00026): both are SECURITY DEFINER with
-- is_platform_admin() as the only door — no current_user check, so no hole —
-- but they drop definer too for the same hygiene.
alter function public.guard_agent_profile_review_fields() security invoker;
alter function public.guard_request_admin_fields() security invoker;

-- Repair the row the hole let through during testing (staging data, but the
-- migration must leave any database consistent with its own rules).
update public.listings
   set status = 'rejected'
 where moderation_state = 'rejected' and status = 'published';
