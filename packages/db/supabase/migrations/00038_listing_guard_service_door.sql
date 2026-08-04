-- =============================================================================
-- 00038 — Same service door for the listing guard as 00035 gave the lead guard
--
-- guard_listing_moderation_fields() only admitted is_platform_admin(), which
-- blocks every service context: the ranking recompute job writes
-- ranking_score, the quality scorer writes quality_score, and the expiry
-- sweep flips status — all of them run as service_role or postgres with no
-- auth.uid(). Discovered when a maintenance UPDATE on staging hit the guard.
--
-- One class of bug, now closed in both guards; any future guard trigger
-- starts from this template.
-- =============================================================================

create or replace function public.guard_listing_moderation_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_platform_admin()
     or auth.role() = 'service_role'
     or current_user in ('postgres', 'service_role') then
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
