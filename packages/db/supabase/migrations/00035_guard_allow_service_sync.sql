-- =============================================================================
-- 00035 — Let the sync machinery through the lead guard
--
-- 00033's guard trigger blocks ghl_* and assignment fields for everyone who
-- is not a platform admin. That includes the GHL drainer itself: the service
-- role and direct postgres connections have no auth.uid(), so
-- is_platform_admin() is false and the very fields that exist FOR the sync
-- are unwritable by it. Found by building the drainer, not by review.
--
-- Triggers always run, even for roles that bypass RLS — which is the guard's
-- whole value against admins-gone-wrong, but means service contexts need an
-- explicit door. auth.role() is null-safe outside PostgREST.
-- =============================================================================

create or replace function public.guard_lead_agent_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Privileged contexts: platform admins, the service role (hub server code
  -- after its own authz checks), and direct maintenance connections.
  if public.is_platform_admin()
     or auth.role() = 'service_role'
     or current_user in ('postgres', 'service_role') then
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
