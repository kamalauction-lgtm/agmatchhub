-- =============================================================================
-- 00105 — Admin access in table policies follows the admin's country scope
--
-- WHY (D11, reproduced on staging 10 Nov 2026)
--   P0-a (00103/00104 and the hub changes) confined a country admin in the
--   hub. The table policies did not: 68 policies on 46 tables grant access through
--   `is_platform_admin()`, which is true for every admin role in every
--   country. A country admin scoped to {MY} could read, through PostgREST,
--   an ID agent's users_private row (email, phone), their agent_profiles row,
--   ID listings, ID requests and property_request_private notes.
--
-- WHAT CHANGES
--   In each of those policies — and only in the admin branch of them —
--   `is_platform_admin()` is replaced by `admin_sees_<x>(<row key>)`, which
--   asks "is the caller an admin whose scope includes this row's country?".
--   Owner branches (`user_id = auth.uid()`, owns_listing(), …) are untouched.
--
--   Every helper is true only for a caller who holds one of the four admin
--   roles, so admin_sees_<x>(…) implies is_platform_admin(): this migration
--   can only NARROW access. Global holders (any admin role row with an empty
--   country list — super_admin, admin, compliance_admin as granted today)
--   see exactly what they saw before. A scoped country admin loses rows from
--   other countries. A row whose country cannot be resolved is visible only
--   to global holders.
--
-- HOW
--   The policies are rewritten in place with ALTER POLICY from their own
--   deparsed text (pg_policies), so names, commands, roles and every other
--   condition stay as they are. A table → replacement map drives it; the
--   block fails if a mapped table has no policy to rewrite, or if any policy
--   on a mapped table still calls is_platform_admin() afterwards.
--
--   Helpers are SECURITY DEFINER and read only OTHER tables (or nothing), so
--   no policy queries its own table (the 42P17 rule).
--
-- NOT CHANGED HERE (recorded as D14)
--   Global configuration tables (countries, brand_settings, site_banners,
--   declarations, training, locations, boost_products, …) have no country
--   per row; their admin policies still use is_platform_admin(), so the
--   capability split (00060) for those writes is enforced in the hub only.
--   audit_logs and user_roles are also unchanged.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The scope test and the per-entity resolvers
-- -----------------------------------------------------------------------------

create or replace function public.admin_sees_country(p_country text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.key in ('super_admin', 'admin', 'country_admin', 'compliance_admin')
      and (cardinality(ur.country_codes) = 0 or p_country = any (ur.country_codes))
  );
$$;

comment on function public.admin_sees_country(text) is
  'Is the caller an admin whose scope includes this country? A global admin role row (empty country list) sees every country, and is the only kind that sees a NULL country (00105).';

create or replace function public.admin_sees_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_country((select p.country_code from public.profiles p where p.id = p_user));
$$;

create or replace function public.admin_sees_property(p_property uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_country((select p.country_code from public.properties p where p.id = p_property));
$$;

create or replace function public.admin_sees_listing(p_listing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_country((
    select p.country_code from public.listings l
    join public.properties p on p.id = l.property_id
    where l.id = p_listing));
$$;

create or replace function public.admin_sees_media(p_media uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_listing((select m.listing_id from public.listing_media m where m.id = p_media));
$$;

create or replace function public.admin_sees_request(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_country((select r.country_code from public.property_requests r where r.id = p_request));
$$;

create or replace function public.admin_sees_request_link(p_link uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_request((select l.request_id from public.request_links l where l.id = p_link));
$$;

create or replace function public.admin_sees_submission(p_submission uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_request((select s.request_id from public.property_submissions s where s.id = p_submission));
$$;

create or replace function public.admin_sees_presentation(p_presentation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_request((select c.request_id from public.client_presentations c where c.id = p_presentation));
$$;

create or replace function public.admin_sees_import_batch(p_batch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_user((select b.agent_id from public.import_batches b where b.id = p_batch));
$$;

/** A lead belongs to the listing's country; a lead without a listing, to its agent's. */
create or replace function public.admin_sees_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_country((
    select coalesce(p.country_code, ap.country_code)
    from public.leads l
    left join public.listings li on li.id = l.listing_id
    left join public.properties p on p.id = li.property_id
    left join public.profiles ap on ap.id = l.agent_id
    where l.id = p_lead));
$$;

/** A contact is visible when one of its leads is; a contact with no lead, to global admins only. */
create or replace function public.admin_sees_contact(p_contact uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leads l where l.contact_id = p_contact and public.admin_sees_lead(l.id))
      or (not exists (select 1 from public.leads l where l.contact_id = p_contact)
          and public.admin_sees_country(null));
$$;

create or replace function public.admin_sees_offer(p_offer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_listing((select o.listing_id from public.comarketing_offers o where o.id = p_offer));
$$;

/** A report belongs to its request's country, else its submission's request, else the reported user's. */
create or replace function public.admin_sees_report(p_report uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_sees_country((
    select coalesce(rq.country_code, srq.country_code, up.country_code)
    from public.violation_reports v
    left join public.property_requests rq on rq.id = v.request_id
    left join public.property_submissions s on s.id = v.submission_id
    left join public.property_requests srq on srq.id = s.request_id
    left join public.profiles up on up.id = v.reported_user_id
    where v.id = p_report));
$$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'admin_sees_country(text)', 'admin_sees_user(uuid)', 'admin_sees_property(uuid)',
    'admin_sees_listing(uuid)', 'admin_sees_media(uuid)', 'admin_sees_request(uuid)',
    'admin_sees_request_link(uuid)', 'admin_sees_submission(uuid)',
    'admin_sees_presentation(uuid)', 'admin_sees_import_batch(uuid)',
    'admin_sees_lead(uuid)', 'admin_sees_contact(uuid)', 'admin_sees_offer(uuid)',
    'admin_sees_report(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end
$grants$;

-- -----------------------------------------------------------------------------
-- 2. Rewrite the admin branch of each policy in place
-- -----------------------------------------------------------------------------

do $scope$
declare
  -- table → the expression that replaces is_platform_admin() in its policies.
  -- Columns are qualified with the policy's own table so they resolve to the
  -- row being checked even inside an EXISTS over another table.
  v_map constant jsonb := jsonb_build_object(
    'profiles',                       'admin_sees_country(profiles.country_code)',
    'users_private',                  'admin_sees_user(users_private.user_id)',
    'agent_profiles',                 'admin_sees_user(agent_profiles.user_id)',
    'agent_social_links',             'admin_sees_user(agent_social_links.user_id)',
    'agent_verifications',            'admin_sees_user(agent_verifications.user_id)',
    'agent_tasks',                    'admin_sees_user(agent_tasks.agent_id)',
    'consent_records',                'admin_sees_user(consent_records.user_id)',
    'credit_wallets',                 'admin_sees_user(credit_wallets.agent_id)',
    'credit_transactions',            'admin_sees_user(credit_transactions.agent_id)',
    'import_batches',                 'admin_sees_user(import_batches.agent_id)',
    'import_items',                   'admin_sees_import_batch(import_items.batch_id)',
    'properties',                     'admin_sees_country(properties.country_code)',
    'property_private',               'admin_sees_property(property_private.property_id)',
    'listings',                       'admin_sees_property(listings.property_id)',
    'listing_media',                  'admin_sees_listing(listing_media.listing_id)',
    'listing_media_source',           'admin_sees_media(listing_media_source.media_id)',
    'listing_price_history',          'admin_sees_listing(listing_price_history.listing_id)',
    'listing_quality_scores',         'admin_sees_listing(listing_quality_scores.listing_id)',
    'listing_statistics',             'admin_sees_listing(listing_statistics.listing_id)',
    'listing_status_history',         'admin_sees_listing(listing_status_history.listing_id)',
    'listing_embeddings',             'admin_sees_listing(listing_embeddings.listing_id)',
    'listing_boosts',                 'admin_sees_listing(listing_boosts.listing_id)',
    'closing_checklists',             'admin_sees_country(closing_checklists.country_code)',
    'leads',                          'admin_sees_lead(leads.id)',
    'lead_events',                    'admin_sees_lead(lead_events.lead_id)',
    'lead_intelligence',              'admin_sees_lead(lead_intelligence.lead_id)',
    'contacts',                       'admin_sees_contact(contacts.id)',
    'property_requests',              'admin_sees_country(property_requests.country_code)',
    'property_request_private',       'admin_sees_request(property_request_private.request_id)',
    'request_edit_log',               'admin_sees_request(request_edit_log.request_id)',
    'request_links',                  'admin_sees_request(request_links.request_id)',
    'request_link_access_logs',       'admin_sees_request_link(request_link_access_logs.link_id)',
    'property_submissions',           'admin_sees_request(property_submissions.request_id)',
    'property_submission_media',      'admin_sees_submission(property_submission_media.submission_id)',
    'property_submission_private',    'admin_sees_submission(property_submission_private.submission_id)',
    'property_submission_sources',    'admin_sees_submission(property_submission_sources.submission_id)',
    'submission_status_history',      'admin_sees_submission(submission_status_history.submission_id)',
    'client_presentations',           'admin_sees_request(client_presentations.request_id)',
    'client_presentation_properties', 'admin_sees_presentation(client_presentation_properties.presentation_id)',
    'client_access_logs',             'admin_sees_presentation(client_access_logs.presentation_id)',
    'client_feedback',                'admin_sees_presentation(client_feedback.presentation_id)',
    'comarketing_offers',             'admin_sees_listing(comarketing_offers.listing_id)',
    'comarketing_offer_private',      'admin_sees_offer(comarketing_offer_private.offer_id)',
    'comarketing_engagements',        'admin_sees_offer(comarketing_engagements.offer_id)',
    'violation_reports',              'admin_sees_report(violation_reports.id)',
    'violation_report_admin',         'admin_sees_report(violation_report_admin.report_id)'
  );
  v_table text;
  v_expr text;
  r record;
  v_q text;
  v_w text;
  v_done int;
  v_total int := 0;
  v_left int;
begin
  for v_table, v_expr in select key, value #>> '{}' from jsonb_each(v_map) loop
    v_done := 0;
    for r in
      select policyname, qual, with_check
      from pg_policies
      where schemaname = 'public' and tablename = v_table
        and (qual like '%is_platform_admin()%' or with_check like '%is_platform_admin()%')
    loop
      v_q := replace(replace(r.qual, 'public.is_platform_admin()', 'is_platform_admin()'), 'is_platform_admin()', 'public.' || v_expr);
      v_w := replace(replace(r.with_check, 'public.is_platform_admin()', 'is_platform_admin()'), 'is_platform_admin()', 'public.' || v_expr);
      if v_q is not null and v_w is not null then
        execute format('alter policy %I on public.%I using (%s) with check (%s)', r.policyname, v_table, v_q, v_w);
      elsif v_q is not null then
        execute format('alter policy %I on public.%I using (%s)', r.policyname, v_table, v_q);
      else
        execute format('alter policy %I on public.%I with check (%s)', r.policyname, v_table, v_w);
      end if;
      v_done := v_done + 1;
    end loop;
    if v_done = 0 then
      raise exception '00105: no admin policy found on %', v_table;
    end if;
    v_total := v_total + v_done;
  end loop;

  select count(*) into v_left
  from pg_policies
  where schemaname = 'public'
    and tablename in (select jsonb_object_keys(v_map))
    and (qual like '%is_platform_admin()%' or with_check like '%is_platform_admin()%');
  if v_left > 0 then
    raise exception '00105: % policies on mapped tables still use is_platform_admin()', v_left;
  end if;

  raise notice '00105: rewrote % admin policies on % tables', v_total, (select count(*) from jsonb_object_keys(v_map));
end
$scope$;
