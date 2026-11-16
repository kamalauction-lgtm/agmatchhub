-- =============================================================================
-- 00118 — profile photos are cleaned before they are public (P1-b-4)
--
-- Owner decision, 11 Nov 2026 ("Both parts"), docs/design/profile-photo-cleaning-plan.md.
-- Until now the Hub wrote the agent's ORIGINAL file to the public bucket
-- agent-profile-public, metadata included, and the 00002 policies let any
-- signed-in agent write to their own folder there directly, bypassing the
-- Hub. The Hub now re-encodes the photo to one metadata-free WebP and stores
-- only that, with the service client, after authenticating the agent.
--
--   1. Agents lose direct INSERT/UPDATE on agent-profile-public. Reads stay
--      public (the bucket is public); nothing else changes for other buckets.
--   2. profiles.avatar_url may only be null or the agent's own cleaned file,
--      `<own uid>/avatar-<hash16>.webp` (optionally with the bucket prefix),
--      unless the writer is the service role or a direct database session.
--      A BEFORE trigger on profiles reads only NEW/OLD — never a subquery
--      on profiles (hard rule 4).
--
-- Ships in the SAME deploy as the Hub change: without it agents could not
-- upload a profile photo at all.
--
-- Rollback: recreate the two 00002 policies; drop the trigger and function.
-- =============================================================================

drop policy if exists "profile media owner write" on storage.objects;
drop policy if exists "profile media owner update" on storage.objects;

create or replace function public.guard_profile_avatar()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.avatar_url is null or new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;
  -- The Hub's service client and direct database sessions (migrations, the
  -- owner-approved cleanup scripts) are trusted writers.
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if new.avatar_url !~ ('^(agent-profile-public/)?' || new.id::text || '/avatar-[0-9a-f]{16}\.webp$') then
    raise exception 'avatar_url must be your own cleaned profile photo' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_avatar_guard on public.profiles;
create trigger trg_profiles_avatar_guard
  before update of avatar_url on public.profiles
  for each row execute function public.guard_profile_avatar();
