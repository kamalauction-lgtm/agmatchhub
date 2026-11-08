-- =============================================================================
-- 00058 — match_regency(): one place for "which regency does this text name?"
--
-- The Excel importer grew this logic in JavaScript; the portal importer needs
-- the same thing. Two copies of a rule about somebody's address is one copy too
-- many, so it moves into the database where both callers reach it.
--
-- THE RULE, unchanged: VERBATIM LOOKUP ONLY. No fuzzy matching, no trigram
-- similarity, no nearest-neighbour. The regency name must literally appear in
-- the text. A wrong regency on a property listing is worse than no regency —
-- it puts a house in the wrong city and a buyer drives an hour for nothing.
--
-- Two wrinkles the Indonesian data forces:
--   · we store "Kab. Sidoarjo" while addresses write "Kabupaten Sidoarjo", so
--     the prefix is stripped on both sides before comparing
--   · "Bekasi" is both Kota Bekasi and Kab. Bekasi. An exact full-name match
--     wins; failing that the address must say "kota" or "kabupaten" to decide.
--     If it does not, NOTHING is returned.
-- =============================================================================

create or replace function public.match_regency(p_text text)
returns table (id uuid, regency text, province text)
language sql stable security definer set search_path = public as $$
  with candidates as (
    select l.id,
           l.name as regency,
           p.name as province,
           regexp_replace(l.name, '^(Kab\.|Kota|Kabupaten)\s+', '') as bare,
           (position(lower(l.name) in lower(p_text)) > 0) as exact_hit
    from public.locations l
    join public.locations p on p.id = l.parent_id
    where l.level = 'regency' and p.level = 'province'
      and (
        position(lower(l.name) in lower(p_text)) > 0
        or position(lower(regexp_replace(l.name, '^(Kab\.|Kota|Kabupaten)\s+', '')) in lower(p_text)) > 0
      )
  ),
  ranked as (
    select *,
           -- Prefer an exact name match, then the longest name so
           -- "Jakarta Selatan" beats "Jakarta", then the class the address
           -- actually names.
           row_number() over (
             order by exact_hit desc,
                      length(bare) desc,
                      (case
                         when p_text ~* '\mkota\M'  and regency like 'Kota%'  then 0
                         when p_text ~* '\mkab(upaten)?\.?\M' and regency like 'Kab.%' then 0
                         else 1
                       end)
           ) as rn,
           count(*) over (partition by lower(bare)) as same_name
    from candidates
  )
  select id, regency, province
  from ranked
  where rn = 1
    -- Ambiguous and undecidable: two regencies share the name and the address
    -- says neither "kota" nor "kabupaten". Return nothing rather than a coin toss.
    and not (
      same_name > 1
      and not exact_hit
      and p_text !~* '\mkota\M'
      and p_text !~* '\mkab(upaten)?\.?\M'
    );
$$;

comment on function public.match_regency(text) is
  'Regency + province named verbatim in the given text. Returns no row when the text is ambiguous - a wrong regency is worse than none.';

revoke all on function public.match_regency(text) from anon;
grant execute on function public.match_regency(text) to authenticated;
