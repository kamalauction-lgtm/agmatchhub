-- =============================================================================
-- 00124 — admin search stays inside the admin's countries (screen 13)
--
-- Found on staging, 11 Nov 2026: admin_search (00103 guard) calls
-- admin_search_unguarded, a SECURITY DEFINER function with no country
-- filter. A Malaysia-only country admin could look up any country's agents by
-- name, email or phone, and see their email address, plus listings,
-- organisations, referral codes, client requirements and import batches.
--
-- The body below is the live staging definition (pg_get_functiondef,
-- 11 Nov 2026) with exactly one line added to each of its six branches: the
-- same admin_sees_* helper the table policies already use (00105).
-- Same signature, SECURITY DEFINER, search_path and grants.
--
-- Rollback: re-run the previous definition (the six added lines removed).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_search_unguarded(p_query text, p_limit integer DEFAULT 8)
 RETURNS TABLE(kind text, id text, label text, sublabel text, href text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with q as (
    select '%' || btrim(p_query) || '%' as pattern, btrim(p_query) as raw
  )
  -- Agents: by display name, email, phone or id prefix.
  (
    select
      'agent'::text,
      p.id::text,
      coalesce(p.display_name, '—'),
      coalesce(up.email, ap.agency_name, p.agent_status),
      '/admin/agents/' || p.id
    from public.profiles p
    left join public.users_private up on up.user_id = p.id
    left join public.agent_profiles ap on ap.user_id = p.id
    cross join q
    where q.raw <> ''
      and (
        p.display_name ilike q.pattern
        or up.email ilike q.pattern
        or up.mobile_number ilike q.pattern
        or up.whatsapp_number ilike q.pattern
        or p.id::text ilike q.pattern
        or p.public_slug ilike q.pattern
      )
      and public.admin_sees_user(p.id)
    limit p_limit
  )
  union all
  -- Listings: by title or the human-readable reference agents quote.
  (
    select
      'listing'::text,
      l.id::text,
      l.title,
      l.human_readable_id || ' · ' || l.status,
      '/admin/listings'
    from public.listings l
    cross join q
    where q.raw <> ''
      and (l.title ilike q.pattern or l.human_readable_id ilike q.pattern)
      and public.admin_sees_listing(l.id)
    limit p_limit
  )
  union all
  -- Organisations.
  (
    select
      'organisation'::text,
      a.id::text,
      a.name,
      coalesce(a.country_code, '—'),
      '/admin/organisations/' || a.id
    from public.agencies a
    cross join q
    where q.raw <> '' and (a.name ilike q.pattern or a.registration_number ilike q.pattern)
      and public.admin_sees_country(a.country_code)
    limit p_limit
  )
  union all
  -- Referral codes: the thing an agent quotes when something went wrong.
  (
    select
      'referral_code'::text,
      rc.code,
      rc.code,
      coalesce(p.display_name, '—'),
      '/admin/agents/' || rc.user_id
    from public.referral_codes rc
    join public.profiles p on p.id = rc.user_id
    cross join q
    where q.raw <> '' and rc.code ilike q.pattern
      and public.admin_sees_user(rc.user_id)
    limit p_limit
  )
  union all
  -- Client requirements.
  (
    select
      'request'::text,
      r.id::text,
      coalesce(r.title, r.human_readable_id),
      r.human_readable_id || ' · ' || r.status,
      '/admin/requests/' || r.id
    from public.property_requests r
    cross join q
    where q.raw <> ''
      and (r.title ilike q.pattern or r.human_readable_id ilike q.pattern)
      and public.admin_sees_request(r.id)
    limit p_limit
  )
  union all
  -- Import batches, so a failed import can be found by its source.
  (
    select
      'import_batch'::text,
      b.id::text,
      coalesce(b.source_label, b.source_portal, 'import'),
      b.status || ' · ' || coalesce(p.display_name, '—'),
      '/admin/listings'
    from public.import_batches b
    left join public.profiles p on p.id = b.agent_id
    cross join q
    where q.raw <> ''
      and (b.source_label ilike q.pattern or b.source_portal ilike q.pattern)
      and public.admin_sees_user(b.agent_id)
    limit p_limit
  );
$function$;
