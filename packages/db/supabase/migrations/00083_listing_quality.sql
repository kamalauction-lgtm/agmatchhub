-- =============================================================================
-- 00083 — Listing quality score and comparables (Stage B, E3 · 7 Nov 2026)
--
-- `listing_quality_scores` has existed since 00030 with eleven sub-scores and
-- nothing that ever filled it (0 rows in production). This migration makes it
-- real, deterministically — no model, no cost, same answer every time — which
-- is what docs/module-ai-agent-dashboard.md §8 asked for as build-order item 1
-- and what the AI Listing Assistant reads to tell an agent the specific fixes.
--
--   listing_comparables(...)        median price / price-per-m² of published
--                                   listings of the same kind, same regency,
--                                   same country — never across a border
--   compute_listing_quality(id)     fills the sub-scores, writes ordered
--                                   recommendations, stamps listings.quality_score
--   triggers                        recompute when the listing, its property or
--                                   its photos change
--
-- Weights (sum 100): completeness 20 · photos 20 · title 10 · description 15 ·
-- price 10 · location 10 · verification 5 · freshness 5 · not-duplicate 5.
-- Photos and completeness dominate on purpose: they are the two things the
-- live catalogue is worst at (30 listings, 0 photographs).
-- =============================================================================

create or replace function public.listing_comparables(
  p_country text, p_listing_type text, p_property_type text, p_regency text,
  p_bedrooms integer default null, p_exclude uuid default null
) returns table (n bigint, median_price numeric, median_per_sqm numeric, min_price numeric, max_price numeric)
language sql stable security definer set search_path = public as $$
  with c as (
    select l.price,
           case when coalesce(nullif(p.building_size, 0), nullif(p.land_size, 0)) is not null
                then l.price / coalesce(nullif(p.building_size, 0), nullif(p.land_size, 0)) end as ppsqm
    from public.listings l
    join public.properties p on p.id = l.property_id
    where l.status = 'published'
      and l.price > 0
      and p.country_code = p_country
      and l.listing_type = p_listing_type
      and p.property_type = p_property_type
      and (p_regency is null or p.regency_name = p_regency)
      and (p_bedrooms is null or p.bedrooms is null or p.bedrooms = p_bedrooms)
      and (p_exclude is null or l.id <> p_exclude)
  )
  select count(*),
         percentile_cont(0.5) within group (order by price),
         percentile_cont(0.5) within group (order by ppsqm),
         min(price), max(price)
  from c;
$$;
revoke execute on function public.listing_comparables(text, text, text, text, integer, uuid) from public, anon;
grant execute on function public.listing_comparables(text, text, text, text, integer, uuid) to authenticated, service_role;

create or replace function public.compute_listing_quality(p_listing_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  l record; p record;
  v_media int; v_depth int; v_verified boolean; v_comp record;
  v_apartment boolean; v_residential boolean;
  v_total_fields int := 0; v_filled int := 0;
  s_complete int; s_photo int; s_title int; s_desc int; s_price int := 60; s_loc int;
  s_verif int; s_fresh int; s_dup int := 0; s_resp int;
  v_total int; v_place text; v_size numeric; v_ratio numeric;
  v_leads int; v_on_time int;
  recs jsonb := '[]'::jsonb;
  missing text[] := '{}';
begin
  select * into l from public.listings where id = p_listing_id;
  if not found then return null; end if;
  if not (auth.uid() is null or public.owns_listing(p_listing_id) or public.is_platform_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into p from public.properties where id = l.property_id;

  v_residential := p.property_category = 'residential';
  v_apartment := p.property_type in ('apartemen', 'kondominium', 'kost', 'apartment', 'condominium',
                                     'serviced_residence', 'flat', 'soho', 'studio', 'penthouse', 'kantor', 'office_space');

  -- completeness: count what applies, count what is filled, remember what is missing
  v_total_fields := v_total_fields + 1; if p.location_id is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'location'); end if;
  v_total_fields := v_total_fields + 1; if nullif(p.general_address, '') is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'general_address'); end if;
  v_total_fields := v_total_fields + 1; if p.building_size is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'building_size'); end if;
  if not v_apartment then
    v_total_fields := v_total_fields + 1; if p.land_size is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'land_size'); end if;
  end if;
  if v_residential then
    v_total_fields := v_total_fields + 1; if p.bedrooms is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'bedrooms'); end if;
    v_total_fields := v_total_fields + 1; if p.bathrooms is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'bathrooms'); end if;
    v_total_fields := v_total_fields + 1; if nullif(p.furnishing, '') is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'furnishing'); end if;
  end if;
  v_total_fields := v_total_fields + 1; if p.year_built is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'year_built'); end if;
  v_total_fields := v_total_fields + 1; if nullif(p.property_condition, '') is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'property_condition'); end if;
  v_total_fields := v_total_fields + 1; if nullif(p.ownership_type, '') is not null then v_filled := v_filled + 1; else missing := array_append(missing, 'ownership_type'); end if;
  v_total_fields := v_total_fields + 1; if coalesce(cardinality(p.facilities), 0) > 0 then v_filled := v_filled + 1; else missing := array_append(missing, 'facilities'); end if;
  v_total_fields := v_total_fields + 1; if length(coalesce(l.description, '')) >= 120 then v_filled := v_filled + 1; end if;
  s_complete := round(100.0 * v_filled / greatest(v_total_fields, 1));

  -- photos
  select count(*) into v_media from public.listing_media where listing_id = p_listing_id and kind = 'image';
  s_photo := case when v_media = 0 then 0 when v_media <= 2 then 30 when v_media <= 4 then 60 when v_media <= 7 then 85 else 100 end;
  if v_media < 5 then recs := recs || jsonb_build_object('key', 'add_photos', 'n', 5 - v_media); end if;

  -- title
  s_title := case when length(l.title) between 30 and 90 then 100 else 60 end;
  if length(l.title) > 12 and l.title = upper(l.title) then s_title := s_title - 30; end if;
  if l.title ~* '(!!!|murah banget|wajib|buruan)' then s_title := s_title - 30; end if;
  v_place := coalesce(p.district_name, p.regency_name);
  if v_place is not null and position(lower(split_part(v_place, ' ', 1)) in lower(l.title)) = 0 then
    s_title := s_title - 20;
    recs := recs || jsonb_build_object('key', 'title_location', 'place', v_place);
  end if;
  s_title := greatest(s_title, 0);

  -- description
  s_desc := case when length(coalesce(l.description, '')) >= 300 then 100
                 when length(coalesce(l.description, '')) >= 120 then 70
                 when length(coalesce(l.description, '')) > 0 then 40 else 0 end;
  if length(coalesce(l.description, '')) < 120 then recs := recs || jsonb_build_object('key', 'describe_more', 'min', 120); end if;
  if coalesce(l.description, '') ~ '(\m08[0-9]{8,}|\+62[0-9]{8,}|\+60[0-9]{8,}|\m01[0-9]-?[0-9]{7,})' then
    s_desc := 0;
    recs := recs || jsonb_build_object('key', 'remove_phone');
  end if;

  -- price against comparables (same country, kind, regency; never across a border)
  if l.price > 0 then
    select * into v_comp from public.listing_comparables(p.country_code, l.listing_type, p.property_type, p.regency_name, p.bedrooms, l.id);
    v_size := coalesce(nullif(p.building_size, 0), nullif(p.land_size, 0));
    if v_comp.n >= 3 then
      if v_size is not null and v_comp.median_per_sqm is not null then
        v_ratio := (l.price / v_size) / v_comp.median_per_sqm;
      elsif v_comp.median_price is not null then
        v_ratio := l.price / v_comp.median_price;
      end if;
      if v_ratio is not null then
        s_price := case when v_ratio between 0.85 and 1.15 then 100 when v_ratio between 0.70 and 1.30 then 70 else 40 end;
        if v_ratio > 1.15 then recs := recs || jsonb_build_object('key', 'price_above_comparables', 'pct', round((v_ratio - 1) * 100), 'n', v_comp.n);
        elsif v_ratio < 0.85 then recs := recs || jsonb_build_object('key', 'price_below_comparables', 'pct', round((1 - v_ratio) * 100), 'n', v_comp.n); end if;
      end if;
    end if;
  end if;

  -- location depth: 1 = province/state, 2 = regency/district, 3+ = district/township
  v_depth := case when p.location_id is null then 0 else coalesce(cardinality(p.ancestor_location_ids), 0) end;
  s_loc := case when v_depth = 0 then 20 when v_depth = 1 then 40 when v_depth = 2 then 70 else 100 end;
  if v_depth < 3 then recs := recs || jsonb_build_object('key', 'refine_location'); end if;

  -- verification, freshness
  select agent_status = 'verified' into v_verified from public.profiles where id = l.agent_id;
  s_verif := case when v_verified then 100 else 0 end;
  s_fresh := case when l.status <> 'published' then 50
                  when l.published_at > now() - interval '30 days' then 100
                  when l.published_at > now() - interval '60 days' then 70 else 40 end;

  -- a near-identical live listing anywhere on the platform
  if exists (
    select 1 from public.listings o join public.properties op on op.id = o.property_id
    where o.id <> l.id and o.status in ('draft', 'pending_review', 'published')
      and op.country_code = p.country_code and op.property_type = p.property_type
      and op.regency_name is not distinct from p.regency_name
      and op.bedrooms is not distinct from p.bedrooms
      and o.listing_type = l.listing_type
      and abs(o.price - l.price) <= l.price * 0.02
  ) then
    s_dup := 60;
    recs := recs || jsonb_build_object('key', 'possible_duplicate');
  end if;

  -- responsiveness: the agent's last 90 days of leads, answered before the deadline
  select count(*), count(*) filter (where first_responded_at is not null and first_responded_at <= first_response_due)
    into v_leads, v_on_time
  from public.leads where agent_id = l.agent_id and created_at > now() - interval '90 days';
  s_resp := case when v_leads = 0 then 70 else round(100.0 * v_on_time / v_leads) end;

  -- missing fields, at most three, after the bigger wins
  if cardinality(missing) > 0 then
    recs := recs || (select jsonb_agg(jsonb_build_object('key', 'add_field', 'field', m)) from unnest(missing[1:3]) m);
  end if;

  v_total := round(0.20 * s_complete + 0.20 * s_photo + 0.10 * s_title + 0.15 * s_desc + 0.10 * s_price
                 + 0.10 * s_loc + 0.05 * s_verif + 0.05 * s_fresh + 0.05 * (100 - s_dup));
  v_total := least(greatest(v_total, 0), 100);

  insert into public.listing_quality_scores as q
    (listing_id, total_score, completeness, photo_quality, title_quality, description_quality,
     price_competitiveness, location_accuracy, verification, freshness, duplicate_risk, agent_responsiveness,
     recommendations, computed_at)
  values (p_listing_id, v_total, s_complete, s_photo, s_title, s_desc, s_price, s_loc, s_verif, s_fresh, s_dup, s_resp, recs, now())
  on conflict (listing_id) do update set
    total_score = excluded.total_score, completeness = excluded.completeness, photo_quality = excluded.photo_quality,
    title_quality = excluded.title_quality, description_quality = excluded.description_quality,
    price_competitiveness = excluded.price_competitiveness, location_accuracy = excluded.location_accuracy,
    verification = excluded.verification, freshness = excluded.freshness, duplicate_risk = excluded.duplicate_risk,
    agent_responsiveness = excluded.agent_responsiveness, recommendations = excluded.recommendations, computed_at = now();

  -- Stamping the denormalised column does not re-fire the listings trigger:
  -- quality_score is not in its column list.
  update public.listings set quality_score = v_total where id = p_listing_id and quality_score is distinct from v_total;
  return v_total;
end $$;
revoke execute on function public.compute_listing_quality(uuid) from public, anon;
grant execute on function public.compute_listing_quality(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keep it current.
-- ---------------------------------------------------------------------------
create or replace function public.trg_listing_quality_listing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() < 2 then perform public.compute_listing_quality(new.id); end if;
  return new;
end $$;
drop trigger if exists listing_quality_on_listing on public.listings;
create trigger listing_quality_on_listing
  after insert or update of title, description, price, status, published_at, key_selling_points on public.listings
  for each row execute function public.trg_listing_quality_listing();

create or replace function public.trg_listing_quality_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() < 2 then perform public.compute_listing_quality(coalesce(new.listing_id, old.listing_id)); end if;
  return coalesce(new, old);
end $$;
drop trigger if exists listing_quality_on_media on public.listing_media;
create trigger listing_quality_on_media
  after insert or delete on public.listing_media
  for each row execute function public.trg_listing_quality_media();

create or replace function public.trg_listing_quality_property()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if pg_trigger_depth() < 2 then
    for r in select id from public.listings where property_id = new.id loop
      perform public.compute_listing_quality(r.id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists listing_quality_on_property on public.properties;
create trigger listing_quality_on_property
  after update of bedrooms, bathrooms, building_size, land_size, year_built, furnishing, property_condition,
                  ownership_type, facilities, location_id, general_address on public.properties
  for each row execute function public.trg_listing_quality_property();

-- Everything that already exists gets a score now.
select public.compute_listing_quality(id) from public.listings;

-- The roles this makes real.
update public.ai_roles set status = 'live', route = '/listings/new', updated_at = now() where key in ('listing_copywriter', 'comparables_analyst');
update public.ai_roles set status = 'live', route = '/listings', updated_at = now() where key = 'quality_auditor';

comment on function public.compute_listing_quality(uuid) is 'Deterministic 0–100 listing quality with ordered recommendation keys; fired by triggers on listings, listing_media and properties.';
