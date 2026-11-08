-- =============================================================================
-- 00086 — Lead Qualifier & Property Matcher (Stage B, E6 · 7 Nov 2026)
--
--   lead_intelligence   the intent score WITH ITS REASON, per lead; written
--                       only through lead_intel_upsert() by the lead's agent,
--                       the service role or an AI admin. A score sorts a list;
--                       it never hides a lead (governance §2).
--   lead_radar()        the two deterministic signals: the same phone number
--                       arriving as several leads, and silence — hours since
--                       anyone did anything on an open lead.
--   lead_matches()      alternatives for a lead: the agent's own published
--                       listings and open-pool co-marketing offers, SAME
--                       COUNTRY ONLY, scored on area, kind, price, size and —
--                       when both sides have one — embedding similarity.
-- =============================================================================

create table public.lead_intelligence (
  lead_id          uuid primary key references public.leads(id) on delete cascade,
  intent           smallint not null check (intent between 1 and 5),
  reason           text not null,
  signals          jsonb not null default '[]'::jsonb,
  suggested_action text,
  source           text not null check (source in ('ai', 'rules')),
  model            text,
  computed_at      timestamptz not null default now()
);
alter table public.lead_intelligence enable row level security;
create policy "lead intel via own lead" on public.lead_intelligence for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id and (l.agent_id = auth.uid() or public.is_platform_admin())));
revoke all on public.lead_intelligence from anon;

create or replace function public.lead_intel_upsert(
  p_lead uuid, p_intent integer, p_reason text, p_signals jsonb, p_action text, p_source text, p_model text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (auth.uid() is null or public.has_capability('ai.manage')
          or exists (select 1 from public.leads l where l.id = p_lead and l.agent_id = auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.lead_intelligence (lead_id, intent, reason, signals, suggested_action, source, model, computed_at)
  values (p_lead, p_intent, p_reason, coalesce(p_signals, '[]'::jsonb), p_action, p_source, p_model, now())
  on conflict (lead_id) do update set intent = excluded.intent, reason = excluded.reason, signals = excluded.signals,
    suggested_action = excluded.suggested_action, source = excluded.source, model = excluded.model, computed_at = now();
end $$;
revoke execute on function public.lead_intel_upsert(uuid, integer, text, jsonb, text, text, text) from public, anon;

/** Duplicate phones and silence, for the signed-in agent's leads. */
create or replace function public.lead_radar()
returns table (lead_id uuid, duplicate_count integer, hours_silent numeric, is_cold boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select l.id, l.status, l.created_at, l.first_responded_at, c.phone
    from public.leads l join public.contacts c on c.id = l.contact_id
    where l.agent_id = auth.uid()
  ),
  activity as (
    -- the cron's nudges are not activity; everything the agent did is
    select e.lead_id, max(e.created_at) as last_at
    from public.lead_events e where e.kind <> 'nudge.sent' group by e.lead_id
  )
  select m.id,
         (select count(*) from mine o where o.phone = m.phone and o.id <> m.id)::int,
         round(extract(epoch from now() - greatest(m.created_at, coalesce(m.first_responded_at, m.created_at), coalesce(a.last_at, m.created_at))) / 3600, 1),
         (m.status not in ('closed_won', 'closed_lost', 'spam')
            and extract(epoch from now() - greatest(m.created_at, coalesce(m.first_responded_at, m.created_at), coalesce(a.last_at, m.created_at))) / 3600 > 72)
  from mine m left join activity a on a.lead_id = m.id;
$$;
revoke execute on function public.lead_radar() from public, anon;

/** Alternatives for a lead. Same country, same sale/rent, own + open pool. */
create or replace function public.lead_matches(p_lead uuid, p_limit integer default 3)
returns table (
  listing_id uuid, human_readable_id text, slug text, title text, price numeric, currency text, rent_period text,
  regency_name text, district_name text, bedrooms integer, building_size numeric, property_type text,
  source text, score numeric, reasons text[]
) language plpgsql stable security definer set search_path = public as $$
declare l record; b record;
begin
  select * into l from public.leads where id = p_lead;
  if not found then return; end if;
  if not (auth.uid() is null or l.agent_id = auth.uid() or public.has_capability('ai.manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select x.id, x.listing_type, x.price, p.country_code, p.property_type, p.property_category, p.regency_name, p.bedrooms,
         coalesce(nullif(p.building_size, 0), nullif(p.land_size, 0)) as size
    into b
  from public.listings x join public.properties p on p.id = x.property_id where x.id = l.listing_id;
  if not found then return; end if;

  return query
  with cand as (
    select x.id, x.human_readable_id, x.slug, x.title, x.price, x.currency, x.rent_period, x.agent_id,
           p.regency_name, p.district_name, p.bedrooms, p.building_size, p.property_type, p.property_category,
           coalesce(nullif(p.building_size, 0), nullif(p.land_size, 0)) as size,
           (p.regency_name is not distinct from b.regency_name and p.regency_name is not null) as same_area,
           (p.property_type = b.property_type) as same_type,
           (p.property_category = b.property_category) as same_category,
           case when b.price > 0 and x.price > 0 then x.price / b.price end as price_ratio,
           (abs(coalesce(p.bedrooms, 0) - coalesce(b.bedrooms, 0)) <= 1) as similar_beds,
           case when e1.embedding is not null and e2.embedding is not null
                then 1 - (e1.embedding operator(extensions.<=>) e2.embedding) end as sim
    from public.listings x
    join public.properties p on p.id = x.property_id
    left join public.listing_embeddings e1 on e1.listing_id = x.id
    left join public.listing_embeddings e2 on e2.listing_id = b.id
    where x.status = 'published'
      and x.id <> b.id
      and p.country_code = b.country_code
      and x.listing_type = b.listing_type
      and (x.agent_id = l.agent_id
           or exists (select 1 from public.comarketing_offers o where o.listing_id = x.id and o.status = 'active' and o.scope = 'open_pool'))
  )
  select c.id, c.human_readable_id, c.slug, c.title, c.price, c.currency, c.rent_period,
         c.regency_name, c.district_name, c.bedrooms, c.building_size, c.property_type,
         case when c.agent_id = l.agent_id then 'own' else 'pool' end,
         (case when c.same_area then 40 else 0 end
          + case when c.same_type then 20 when c.same_category then 10 else 0 end
          + case when c.price_ratio between 0.85 and 1.15 then 20 when c.price_ratio between 0.70 and 1.30 then 10 else 0 end
          + case when c.similar_beds then 10 else 0 end
          + coalesce(c.sim, 0) * 10)::numeric,
         array_remove(array[
           case when c.same_area then 'same_area' end,
           case when c.same_type then 'same_type' when c.same_category then 'same_category' end,
           case when c.price_ratio between 0.85 and 1.15 then 'similar_price' when c.price_ratio < 0.85 then 'cheaper' when c.price_ratio > 1.15 then 'pricier' end,
           case when c.similar_beds and b.bedrooms is not null then 'similar_size' end
         ], null)
  from cand c
  order by 14 desc, c.price asc
  limit greatest(p_limit, 1);
end $$;
revoke execute on function public.lead_matches(uuid, integer) from public, anon;

update public.ai_roles set status = 'live', route = '/leads', updated_at = now()
 where key in ('lead_qualifier', 'duplicate_detector', 'silence_radar', 'property_matcher', 'alternative_finder');
