-- =============================================================================
-- 00059 — match_regency: decide the class before the name
--
-- 00058 assumed Indonesian regencies are seeded as "Kota Bekasi" / "Kab.
-- Bekasi". They are not. In `locations` there are 416 rows prefixed "Kab." and
-- 98 with NO prefix at all — the kota rows are bare ("Bekasi", "Bandung",
-- "Bogor"). Zero rows begin with "Kota ". So 00058's ranking clause
-- `regency like 'Kota%'` could never fire, and 26 bare names collide with a
-- "Kab." row of the same name.
--
-- Three wrong answers came out of that, all found by the test suite:
--
--   'Bekasi'                                 -> Bekasi (kota)      guessed
--   'Kabupaten Bandung'                      -> Bandung (kota)     WRONG
--   'Cikarang, Kabupaten Bekasi, Jawa Barat' -> Bekasi  (kota)     WRONG
--
-- The last is an ordinary portal address line. Cikarang is in KABUPATEN
-- Bekasi; filing it under Kota Bekasi puts the property in the wrong place on
-- the map and in every location filter, silently.
--
-- The cause is that 00058 ranked by literal containment first: "Kab. Bekasi"
-- is not a substring of "Kabupaten Bekasi", but the bare "Bekasi" is, so the
-- kota won on a technicality even though the text said kabupaten out loud.
--
-- WHAT CHANGES
--   1. Match on the BARE name, at word boundaries, so both spellings of the
--      class compare equally and "Banjar" no longer matches "Banjarbaru".
--   2. Read the class from the TEXT (kota / kabupaten / unstated) and from the
--      ROW, and let the class filter before anything else decides.
--   3. Return a row only when exactly one candidate survives. Everything else
--      returns nothing — including bare "Bekasi", which is genuinely
--      undecidable and must go back to the agent rather than be guessed.
--
-- This function only ever runs during import, where a wrong regency is worse
-- than an empty one.
-- =============================================================================

create or replace function public.match_regency(p_text text)
returns table (id uuid, regency text, province text)
language sql stable security definer set search_path = public as $$
  with input as (
    select
      lower(coalesce(p_text, '')) as t,
      -- \m..\M are word boundaries, so "kota" does not match inside
      -- "kabupaten", and "kab" does not match inside "kabar".
      (lower(coalesce(p_text, '')) ~ '\mkota\M') as says_kota,
      (lower(coalesce(p_text, '')) ~ '\mkab(upaten)?\.?\M') as says_kab
  ),
  intent as (
    select t,
      case
        -- A text naming both classes has decided nothing.
        when says_kab and says_kota then null
        when says_kab then 'kab'
        when says_kota then 'kota'
        else null
      end as text_class
    from input
  ),
  candidates as (
    select
      l.id,
      l.name as regency,
      p.name as province,
      regexp_replace(l.name, '^(Kab\.|Kabupaten|Kota)\s+', '') as bare,
      case when l.name ~* '^(Kab\.|Kabupaten)\s' then 'kab' else 'kota' end as row_class,
      i.text_class
    from public.locations l
    join public.locations p on p.id = l.parent_id
    cross join intent i
    where l.level = 'regency'
      and p.level = 'province'
      and i.t <> ''
      -- Whole-word match on the bare name. Regex metacharacters in the name
      -- are escaped so a stray '.' cannot widen the match.
      and i.t ~ (
        '\m' ||
        regexp_replace(
          lower(regexp_replace(l.name, '^(Kab\.|Kabupaten|Kota)\s+', '')),
          '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'
        ) ||
        '\M'
      )
  ),
  filtered as (
    -- The class decides before the name does. This is the whole fix.
    select * from candidates
    where text_class is null or row_class = text_class
  ),
  best as (
    -- Longest name wins containment: "Jakarta Selatan" over "Jakarta".
    select * from filtered
    where length(bare) = (select max(length(bare)) from filtered)
  )
  select b.id, b.regency, b.province
  from best b
  -- Exactly one, or nothing. A tie here means the text genuinely does not say
  -- which regency it means, and a coin toss would be indistinguishable from a
  -- fact once it is stored on the listing.
  where (select count(*) from best) = 1;
$$;

comment on function public.match_regency(text) is
  'Regency + province named verbatim in the given text. The class (kota / kabupaten) is read from the text and filters before the name is ranked. Returns no row unless exactly one regency survives - a wrong regency is worse than none.';

revoke all on function public.match_regency(text) from anon;
grant execute on function public.match_regency(text) to authenticated;
