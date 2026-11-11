-- =============================================================================
-- 00122 — configuration tables follow the capability split (D14, screen 13)
--
-- Finding D14: the global configuration tables still granted writes to ANY
-- admin through is_platform_admin(), so the 00060 capability split (who may
-- configure the platform, publish legal text, manage content or commerce)
-- held in the Hub only. A compromised or careless session of any admin role
-- could rewrite brand settings, declarations or training through PostgREST.
--
-- Each write policy now names its capability:
--
--   table                         capability            scope
--   brand_settings                platform.configure    global grant
--   countries (update)            platform.configure    that country
--   locations, landmarks          platform.configure    the row's country
--   location_aliases              platform.configure    the location's country
--   property_imports              platform.configure    global grant
--   declarations, _versions       legal.publish         global grant
--   legal_disclosures (update)    legal.publish         global grant
--   training_guides, _translations content.manage       global grant
--   boost_products                commercial.manage     global grant
--   site_banners                  commercial.manage     the banner's country
--                                                       (a banner with no
--                                                       country: global grant)
--
-- "Global grant" = a role grant with no country list (has_global_capability),
-- so a country-scoped admin cannot rewrite platform-wide settings.
--
-- Reads are unchanged: where the old policy was FOR ALL (and so also let any
-- admin read), an "admin read" SELECT policy keeps is_platform_admin().
-- No policy subqueries its own table (hard rule 4): location_aliases looks up
-- locations, a different table.
--
-- Rollback: drop the new policies and recreate the fourteen listed in the
-- header of each block from is_platform_admin().
-- =============================================================================

create or replace function public.has_global_capability(p_capability text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_capabilities rc on rc.role_id = ur.role_id
    where ur.user_id = auth.uid() and rc.capability_key = p_capability
      and (ur.country_codes is null or cardinality(ur.country_codes) = 0));
$$;
revoke all on function public.has_global_capability(text) from public, anon;
grant execute on function public.has_global_capability(text) to authenticated;

-- A FOR ALL admin policy is replaced by: admin read (unchanged) + capability writes.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('boost_products', 'boost products admin', 'public.has_global_capability(''commercial.manage'')'),
    ('brand_settings', 'brand settings admin write', 'public.has_global_capability(''platform.configure'')'),
    ('landmarks', 'landmarks admin write', 'public.has_capability_in(''platform.configure'', country_code)'),
    ('location_aliases', 'location aliases admin write', 'public.has_capability_in(''platform.configure'', (select l.country_code from public.locations l where l.id = location_id))'),
    ('locations', 'locations admin write', 'public.has_capability_in(''platform.configure'', country_code)'),
    ('property_imports', 'property imports admin', 'public.has_global_capability(''platform.configure'')'),
    ('site_banners', 'site banners admin', 'case when country_code is null then public.has_global_capability(''commercial.manage'') else public.has_capability_in(''commercial.manage'', country_code) end'),
    ('training_guide_translations', 'training translations admin write', 'public.has_global_capability(''content.manage'')'),
    ('training_guides', 'training guides admin write', 'public.has_global_capability(''content.manage'')')
  ) as t(tbl, old_policy, cond)
  loop
    execute format('drop policy if exists %I on public.%I', r.old_policy, r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || ' admin read', r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_platform_admin())', r.tbl || ' admin read', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || ' cap insert', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || ' cap update', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || ' cap delete', r.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', r.tbl || ' cap insert', r.tbl, r.cond);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', r.tbl || ' cap update', r.tbl, r.cond, r.cond);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', r.tbl || ' cap delete', r.tbl, r.cond);
  end loop;
end $$;

-- Single-command policies keep their command; only the condition changes.
drop policy if exists "countries admin update" on public.countries;
create policy "countries admin update" on public.countries
  for update to authenticated
  using (public.has_capability_in('platform.configure', code))
  with check (public.has_capability_in('platform.configure', code));

drop policy if exists "declaration_versions admin insert" on public.declaration_versions;
create policy "declaration_versions admin insert" on public.declaration_versions
  for insert to authenticated with check (public.has_global_capability('legal.publish'));
drop policy if exists "declaration_versions admin update" on public.declaration_versions;
create policy "declaration_versions admin update" on public.declaration_versions
  for update to authenticated
  using (public.has_global_capability('legal.publish'))
  with check (public.has_global_capability('legal.publish'));

drop policy if exists "declarations admin insert" on public.declarations;
create policy "declarations admin insert" on public.declarations
  for insert to authenticated with check (public.has_global_capability('legal.publish'));

drop policy if exists "disclosures admin update" on public.legal_disclosures;
create policy "disclosures admin update" on public.legal_disclosures
  for update to authenticated
  using (public.has_global_capability('legal.publish'))
  with check (public.has_global_capability('legal.publish'));
