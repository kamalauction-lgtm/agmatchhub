-- =============================================================================
-- 00067 — Global admin search
--
-- §18: one box that finds an agent by name, phone, email or id; a listing by
-- title or reference; an organisation; a referral code; an import batch; a
-- client requirement.
--
-- WHY ONE FUNCTION RATHER THAN SIX QUERIES IN THE PAGE
--   An operator searching "Bekasi" does not know which table the answer is in.
--   Six separate queries in the route would each need their own permission
--   check and their own result shape, and the day somebody adds a seventh
--   entity they will forget one of those. One union, one shape, one gate.
--
-- WHAT IT DELIBERATELY DOES NOT SEARCH
--   Nothing confidential: no minimum prices, no commission terms, no internal
--   notes, no client identities from MatchHub. An admin can reach those on the
--   record itself, where the page makes clear what they are looking at. A
--   search box that surfaces a client's phone number next to a listing title
--   is how confidential data leaks into a screen share.
--
-- ILIKE, NOT FULL TEXT
--   The corpus is small (tens of thousands of rows) and the queries are
--   prefix/substring lookups on names and references, which is exactly what
--   trigram-less ILIKE handles adequately. Adding tsvector columns and their
--   triggers for this would be maintenance nobody asked for.
-- =============================================================================

create or replace function public.admin_search(p_query text, p_limit int default 8)
returns table (
  kind text,
  id text,
  label text,
  sublabel text,
  href text
)
language sql stable security definer set search_path = public as $$
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
    limit p_limit
  );
$$;

comment on function public.admin_search(text, int) is
  'Cross-entity admin lookup. Returns only non-confidential identifying fields; never commission terms, minimum prices, internal notes or client identities.';

-- Route-level gating (requireAdmin) is the control, as with the other admin
-- RPCs — a SECURITY DEFINER function cannot consult RLS on the caller's behalf.
revoke all on function public.admin_search(text, int) from anon;
grant execute on function public.admin_search(text, int) to authenticated;
