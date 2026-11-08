-- =============================================================================
-- 00048 — Hold the IQI identity back until the platform stands on its own
--
-- Kamal, 9 Aug 2026: launch neutral. People use the marketplace and the agent
-- app as ordinary products, without the IQI affiliation being the first thing
-- they see. Once there are enough users to make the association an asset rather
-- than the whole proposition, an admin switches it on.
--
-- One flag, defaulting to OFF, plus the timestamp of the moment it was turned
-- on — "when did we go public with the affiliation" is a question worth being
-- able to answer later without digging through the audit log.
--
-- SCOPE, stated plainly, because a flag called "identity" invites assumptions:
--
--   It hides BRANDING — the IQI and AG marks, the agency name shown beside an
--   agent on public listings, and the copy that names IQI in the agent app.
--
--   It does NOT touch legal content. Terms, privacy policy and any company
--   registration detail are managed in /admin/legal and continue to name the
--   operating entity, because who runs a service is a disclosure obligation,
--   not a marketing choice. Marketing may lead with whatever it likes; the
--   legal pages must still answer "who am I contracting with".
--
--   It does not change what the platform IS or claim otherwise. Nothing here
--   makes a false statement about ownership — it declines to advertise one.
-- =============================================================================

alter table public.brand_settings
  add column if not exists partner_identity_public boolean not null default false,
  add column if not exists partner_identity_activated_at timestamptz;

comment on column public.brand_settings.partner_identity_public is
  'When false (the launch default), the operating group''s branding is hidden across both apps: no IQI/AG marks, no agency name beside public agents, neutral copy. Legal content is unaffected.';

comment on column public.brand_settings.partner_identity_activated_at is
  'When the affiliation was first made public. Set on activation, kept on deactivation so the original date survives a toggle.';

-- Record the moment, and only the first one.
create or replace function public.guard_partner_identity()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.partner_identity_public and not old.partner_identity_public
     and new.partner_identity_activated_at is null then
    new.partner_identity_activated_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_guard_partner_identity
  before update on public.brand_settings
  for each row execute function public.guard_partner_identity();

-- The singleton row must exist for the flag to be readable. 00001 defines the
-- table but does not guarantee a row.
insert into public.brand_settings (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Public read path.
--
-- The marketplace needs the flag on every page render, and it holds only the
-- anon key. This view exposes the flag and nothing else — not the support
-- contacts, not the social links, not who last changed it.
-- -----------------------------------------------------------------------------
create view public.public_platform_identity with (security_invoker = false) as
select partner_identity_public
from public.brand_settings
where id = 1;

comment on view public.public_platform_identity is
  'The single flag the public marketplace needs. Deliberately one column: brand_settings holds support contacts and internal fields that anon has no business reading.';

revoke all on public.public_platform_identity from anon, authenticated;
grant select on public.public_platform_identity to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Only an admin may flip it. brand_settings already carries RLS from 00001;
-- this states the update rule for the new column explicitly rather than
-- assuming the existing policy is what we want.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'brand_settings'
      and policyname = 'brand settings admin write'
  ) then
    create policy "brand settings admin write" on public.brand_settings
      for all to authenticated
      using (public.is_platform_admin())
      with check (public.is_platform_admin());
  end if;
end $$;
