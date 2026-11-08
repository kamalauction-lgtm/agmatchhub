-- =============================================================================
-- 00093 — Ingest, multi-country: a Malaysian location matcher and one front door
--
-- The server-to-server ingest (Hero → this platform) resolved locations with
-- match_regency(), which knows only Indonesia's province → regency shape.
-- Malaysia's geography (00075) is state → district → township, and what an
-- agent types is the township ("Mont Kiara", "Shah Alam") or the district
-- ("Johor Bahru", "Petaling").
--
-- SAME DISCIPLINE AS match_regency(): return a row only when the text names
-- exactly one place; a tie or nothing returns nothing, because a wrong
-- location stored on a listing is indistinguishable from a fact later.
--
--   match_location_my(text)        deepest unique match: township, else district
--   match_location(country, text)  one call for the route; ID → match_regency
--
-- The ingest agent per country is a setting, not an env var:
--   countries.settings -> 'ingest' -> 'agent_id'   (set on /admin/countries)
-- =============================================================================

create or replace function public.match_location_my(p_text text)
returns table (id uuid, township text, district text, state text, level text)
language sql stable security definer set search_path = public as $$
  with input as (select lower(coalesce(p_text, '')) as t),
  esc as (
    -- whole-word match on the place name, regex metacharacters escaped
    select l.id, l.name, l.level, l.parent_id,
           '\m' || regexp_replace(lower(l.name), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M' as rx
    from public.locations l
    where l.country_code = 'MY' and l.level in ('township', 'district')
  ),
  hits as (
    select e.id, e.name, e.level, e.parent_id
    from esc e cross join input i
    where i.t <> '' and i.t ~ e.rx
  ),
  -- Longest township name wins containment ("Seremban 2" over "Seremban").
  best_township as (
    select * from hits h where h.level = 'township'
      and length(h.name) = (select max(length(name)) from hits where level = 'township')
  ),
  best_district as (
    select * from hits h where h.level = 'district'
      and length(h.name) = (select max(length(name)) from hits where level = 'district')
  ),
  chosen as (
    -- A township is more specific than a district, so it wins when unique.
    select * from best_township where (select count(*) from best_township) = 1
    union all
    select * from best_district
      where (select count(*) from best_township) <> 1
        and (select count(*) from best_district) = 1
  )
  select c.id,
         case when c.level = 'township' then c.name end,
         case when c.level = 'township' then d.name else c.name end,
         case when c.level = 'township' then s.name else d.name end,
         c.level
  from chosen c
  join public.locations d on d.id = c.parent_id
  left join public.locations s on s.id = d.parent_id
  limit 1;
$$;

/**
 * One front door for the ingest route. Returns the platform's own three
 * names in the properties table's shape (location_id, province_name =
 * state/province, regency_name = district/regency) for either country.
 */
create or replace function public.match_location(p_country text, p_text text)
returns table (id uuid, province_name text, regency_name text, place_name text, level text)
language sql stable security definer set search_path = public as $$
  select m.id, m.province, m.regency, m.regency, 'regency'::text
  from public.match_regency(p_text) m
  where upper(p_country) = 'ID'
  union all
  select m.id, m.state, m.district, coalesce(m.township, m.district), m.level
  from public.match_location_my(p_text) m
  where upper(p_country) = 'MY';
$$;

revoke all on function public.match_location_my(text) from public, anon;
revoke all on function public.match_location(text, text) from public, anon;
grant execute on function public.match_location_my(text) to authenticated;
grant execute on function public.match_location(text, text) to authenticated;

comment on function public.match_location_my(text) is
  'Malaysia: the one township (else district) the text names, or nothing. Used by import/ingest only, where a wrong place is worse than none.';
