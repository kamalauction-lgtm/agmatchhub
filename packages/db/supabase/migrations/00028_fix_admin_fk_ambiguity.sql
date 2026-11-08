-- 00028: Repoint created_by_admin_id FKs from profiles → auth.users.
--
-- 00027 added created_by_admin_id referencing profiles(id) on both
-- property_submissions and agent_profiles. Each table already had a profiles
-- relationship (supply_agent_id, and user_id respectively), so a SECOND profiles
-- FK made PostgREST embeds ambiguous — e.g. `profiles(...)` on the submission
-- review page and `agent_profiles(...)` on the admin agents list both started
-- failing (404 / empty). created_by_admin_id is an audit pointer only, never
-- embedded, so point it at auth.users(id) like every other actor column
-- (changed_by, granted_by, reviewed_by). profiles.id === auth.users.id, so the
-- stored values remain valid.

alter table public.property_submissions
  drop constraint if exists property_submissions_created_by_admin_id_fkey;
alter table public.property_submissions
  add constraint property_submissions_created_by_admin_id_fkey
    foreign key (created_by_admin_id) references auth.users(id);

alter table public.agent_profiles
  drop constraint if exists agent_profiles_created_by_admin_id_fkey;
alter table public.agent_profiles
  add constraint agent_profiles_created_by_admin_id_fkey
    foreign key (created_by_admin_id) references auth.users(id);
