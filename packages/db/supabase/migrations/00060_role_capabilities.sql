-- =============================================================================
-- 00060 — Capabilities: make the four admin roles actually mean four things
--
-- THE PROBLEM
--   `roles` has defined super_admin, admin, country_admin and compliance_admin
--   since 00001, each with a written scope — compliance_admin is specified as
--   "Compliance review; no commercial edits (§7)". But every gate in the
--   system is `is_platform_admin()`, which returns true for all four alike:
--
--     where r.key in ('super_admin','admin','country_admin','compliance_admin')
--
--   No policy anywhere distinguishes them, and `user_roles.country_codes` — a
--   column that exists precisely to scope a country admin — is read by nothing.
--   So the role matrix is documentation, not enforcement, and the first person
--   granted any admin role gets the whole platform.
--
-- THE SHAPE
--   Capabilities are DATA, not a CASE statement in a function. A hard-coded
--   matrix would be one more thing that drifts from the spec silently, and
--   rule 12 keeps roles out of literals. Two small tables, seeded here, joined
--   by one SECURITY DEFINER helper.
--
--   `is_platform_admin()` is deliberately LEFT ALONE. It answers "may this
--   person open the admin area", which is still true for all four roles, and
--   it is referenced by policies across a dozen migrations — redefining it
--   would change the meaning of every one of them at once. Capabilities layer
--   on top to answer the narrower question: "may this person do THIS".
--
-- SECURITY DEFINER, deliberately: the helper reads `user_roles` and is used in
-- `user_roles`' own policies. Definer rights bypass RLS, so there is no
-- recursion — the documented escape from the 42P17 incidents in 00020–00022.
-- =============================================================================

create table public.capabilities (
  key text primary key,
  description text not null,
  created_at timestamptz not null default now()
);

comment on table public.capabilities is
  'One row per thing an admin can do. Referenced by role_capabilities; never hard-coded into a function.';

insert into public.capabilities (key, description) values
  ('roles.manage',       'Grant and revoke roles, and set their country scope'),
  ('platform.configure', 'Countries, currencies, languages, brand identity'),
  ('listing.moderate',   'Approve, reject and correct marketplace listings'),
  ('agent.verify',       'Approve agent verification and public social links'),
  ('request.manage',     'Approve client requirements and issue their links'),
  ('report.manage',      'Handle violation reports'),
  ('commercial.manage',  'Advertising banners, boosts, credits and commission terms'),
  ('content.manage',     'Training guides and their translations'),
  ('legal.publish',      'Publish declaration and disclosure versions');

create table public.role_capabilities (
  role_id uuid not null references public.roles(id) on delete cascade,
  capability_key text not null references public.capabilities(key) on delete cascade,
  primary key (role_id, capability_key)
);

comment on table public.role_capabilities is
  'The role matrix, as rows. Editing this is how a role changes what it can do.';

-- The matrix from the master spec §4–§8 -------------------------------------
-- super_admin      everything, including handing out roles
-- admin            runs the platform day to day; no roles, no legal publishing
-- country_admin    the operational subset, scoped to their markets
-- compliance_admin review and legal ONLY — explicitly no commercial edits
insert into public.role_capabilities (role_id, capability_key)
select r.id, m.key
from public.roles r
join (values
  ('super_admin', 'roles.manage'),
  ('super_admin', 'platform.configure'),
  ('super_admin', 'listing.moderate'),
  ('super_admin', 'agent.verify'),
  ('super_admin', 'request.manage'),
  ('super_admin', 'report.manage'),
  ('super_admin', 'commercial.manage'),
  ('super_admin', 'content.manage'),
  ('super_admin', 'legal.publish'),

  ('admin', 'platform.configure'),
  ('admin', 'listing.moderate'),
  ('admin', 'agent.verify'),
  ('admin', 'request.manage'),
  ('admin', 'report.manage'),
  ('admin', 'commercial.manage'),
  ('admin', 'content.manage'),

  ('country_admin', 'listing.moderate'),
  ('country_admin', 'agent.verify'),
  ('country_admin', 'request.manage'),

  ('compliance_admin', 'listing.moderate'),
  ('compliance_admin', 'agent.verify'),
  ('compliance_admin', 'report.manage'),
  ('compliance_admin', 'legal.publish')
) as m(role_key, key) on m.role_key = r.key
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- The gates
-- -----------------------------------------------------------------------------

create or replace function public.has_capability(p_capability text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_capabilities rc on rc.role_id = ur.role_id
    where ur.user_id = auth.uid()
      and rc.capability_key = p_capability
  );
$$;

comment on function public.has_capability(text) is
  'May the current user do this? Use INSTEAD of is_platform_admin() for anything that writes.';

/**
 * The same question, for a specific country.
 *
 * `country_codes` null or empty means global — that is how super_admin and
 * admin are held. A country_admin carries {ID} or {MY} and is confined to it.
 * This is the column 00001 created and nothing has read until now.
 */
create or replace function public.has_capability_in(p_capability text, p_country text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_capabilities rc on rc.role_id = ur.role_id
    where ur.user_id = auth.uid()
      and rc.capability_key = p_capability
      and (
        ur.country_codes is null
        or cardinality(ur.country_codes) = 0
        or p_country = any (ur.country_codes)
      )
  );
$$;

/** Every capability the current user holds — one round trip for the UI. */
create or replace function public.my_capabilities()
returns table (capability_key text) language sql stable security definer set search_path = public as $$
  select distinct rc.capability_key
  from public.user_roles ur
  join public.role_capabilities rc on rc.role_id = ur.role_id
  where ur.user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Guarding the grant table itself
-- -----------------------------------------------------------------------------

/**
 * Three things a role grant must never be able to do.
 *
 * A policy cannot express any of them, because each needs to see the table as
 * a whole rather than the row being written — so this is a trigger, the other
 * remedy the RLS rule allows.
 */
create or replace function public.guard_user_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target uuid := coalesce(new.user_id, old.user_id);
  v_super uuid;
  v_remaining int;
begin
  /* No JWT means the service role or a direct SQL session — the trusted
   * server path, and the one `seed-admin.mjs` uses. It must stay open: it is
   * the only way to create the FIRST super admin, and the only way back in if
   * the last one is somehow lost. A trigger cannot meaningfully defend against
   * a caller who already holds the service key and could disable it anyway.
   */
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- 1. Only somebody holding roles.manage may touch this table at all.
  if not public.has_capability('roles.manage') then
    raise exception 'not permitted to manage roles' using errcode = '42501';
  end if;

  -- 2. Nobody edits their own roles. Blocks quiet self-escalation, and blocks
  --    an admin locking themselves out by accident.
  if v_target = auth.uid() then
    raise exception 'you cannot change your own roles' using errcode = '42501';
  end if;

  -- 3. The platform must keep at least one super_admin. Without this, revoking
  --    the wrong row leaves nobody who can ever grant a role again, and the
  --    only way back is a developer with database credentials.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role_id is distinct from old.role_id) then
    select id into v_super from public.roles where key = 'super_admin';
    if old.role_id = v_super then
      select count(*) into v_remaining
      from public.user_roles
      where role_id = v_super and id <> old.id;
      if v_remaining = 0 then
        raise exception 'the last super admin cannot be removed' using errcode = '23514';
      end if;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_user_roles on public.user_roles;
create trigger trg_guard_user_roles
  before insert or update or delete on public.user_roles
  for each row execute function public.guard_user_roles();

-- Record who granted what, without the application having to remember.
create or replace function public.stamp_user_role_grant()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.granted_by := coalesce(new.granted_by, auth.uid());
  new.granted_at := coalesce(new.granted_at, now());
  return new;
end;
$$;

drop trigger if exists trg_stamp_user_role_grant on public.user_roles;
create trigger trg_stamp_user_role_grant
  before insert on public.user_roles
  for each row execute function public.stamp_user_role_grant();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.capabilities enable row level security;
alter table public.role_capabilities enable row level security;
alter table public.user_roles enable row level security;

-- The matrix is readable by any signed-in user: the UI greys out what you
-- cannot do, and knowing that "compliance_admin may not edit banners" is not
-- a secret. Writing it is super-admin work.
create policy "capabilities readable" on public.capabilities
  for select to authenticated using (true);
create policy "capabilities managed" on public.capabilities
  for all to authenticated
  using (public.has_capability('roles.manage'))
  with check (public.has_capability('roles.manage'));

create policy "role capabilities readable" on public.role_capabilities
  for select to authenticated using (true);
create policy "role capabilities managed" on public.role_capabilities
  for all to authenticated
  using (public.has_capability('roles.manage'))
  with check (public.has_capability('roles.manage'));

/* The existing "user_roles self read" policy is left in place: it already
 * says `user_id = auth.uid() OR is_platform_admin()`, which is the right read
 * rule — any admin may see who holds what; only a role manager may change it.
 * Adding a second SELECT policy would only OR with it to no effect. What was
 * missing was any policy for INSERT, UPDATE or DELETE at all. */
drop policy if exists "user roles managed" on public.user_roles;
create policy "user roles managed" on public.user_roles
  for all to authenticated
  using (public.has_capability('roles.manage'))
  with check (public.has_capability('roles.manage'));

revoke all on public.capabilities from anon, authenticated;
revoke all on public.role_capabilities from anon, authenticated;
grant select on public.capabilities to authenticated;
grant select on public.role_capabilities to authenticated;
grant insert, update, delete on public.capabilities to authenticated;
grant insert, update, delete on public.role_capabilities to authenticated;

revoke all on function public.has_capability(text) from anon;
revoke all on function public.has_capability_in(text, text) from anon;
revoke all on function public.my_capabilities() from anon;
grant execute on function public.has_capability(text) to authenticated;
grant execute on function public.has_capability_in(text, text) to authenticated;
grant execute on function public.my_capabilities() to authenticated;
