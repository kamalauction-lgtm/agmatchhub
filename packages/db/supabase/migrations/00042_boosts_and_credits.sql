-- =============================================================================
-- 00042 — Listing boosts + the credit ledger
--
-- Kamal, 4 Aug 2026: everything is FREE for now, but build the payment system
-- behind it so switching it on later is a data change, not a rewrite.
--
-- So the full machinery exists — wallet, append-only ledger, priced products —
-- and `boost_products.credit_cost` is simply 0 today. Turning billing on means
-- updating one row per product and granting real credits. No code changes.
--
-- The habit mechanic, in Kamal's words: boost puts a listing on top for three
-- days; when it lapses the agent comes back and boosts again. Both benchmarked
-- platforms run exactly this (Rumah123's "Sundul", PropMall's "Repost Today"),
-- because it is what brings an agent back into the product daily.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Products — priced in data, never in code (§7)
-- -----------------------------------------------------------------------------
create table public.boost_products (
  key text primary key,
  duration_days int not null check (duration_days > 0),
  credit_cost int not null default 0 check (credit_cost >= 0),
  -- Higher wins when several boosts are live on competing listings.
  rank_weight int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_boost_products_updated before update on public.boost_products
  for each row execute function public.set_updated_at();

insert into public.boost_products (key, duration_days, credit_cost, rank_weight) values
  ('boost_3d', 3, 0, 100)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Wallet + append-only ledger
-- -----------------------------------------------------------------------------
create table public.credit_wallets (
  agent_id uuid primary key references public.profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  lifetime_granted int not null default 0,
  lifetime_spent int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_credit_wallets_updated before update on public.credit_wallets
  for each row execute function public.set_updated_at();

-- Append-only: no UPDATE or DELETE policy is ever granted on this table.
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null,
  balance_after int not null,
  reason text not null check (reason in
    ('grant','purchase','boost','refund','adjustment','expiry')),
  ref_type text,
  ref_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index idx_credit_tx_agent on public.credit_transactions (agent_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Boosts
-- -----------------------------------------------------------------------------
create table public.listing_boosts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  agent_id uuid not null references public.profiles(id),
  product_key text not null references public.boost_products(key),

  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  credits_spent int not null default 0,
  rank_weight int not null default 100,

  status text not null default 'active'
    check (status in ('active','expired','cancelled')),

  created_at timestamptz not null default now()
);

-- One live boost per listing at a time — re-boosting is the point, stacking is not.
create unique index idx_one_active_boost on public.listing_boosts (listing_id)
  where status = 'active';
create index idx_boosts_active on public.listing_boosts (ends_at)
  where status = 'active';
create index idx_boosts_agent on public.listing_boosts (agent_id, created_at desc);

/** Is this listing boosted right now? Used by the public view. */
create or replace function public.listing_boost_weight(p_listing_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(b.rank_weight), 0)
  from public.listing_boosts b
  where b.listing_id = p_listing_id
    and b.status = 'active'
    and b.ends_at > now();
$$;

-- -----------------------------------------------------------------------------
-- boost_listing() — the one way a boost is ever created
--
-- SECURITY DEFINER because it debits the wallet and writes the ledger, which
-- agents must never do directly. Every rule lives here: ownership, listing
-- state, no double-boost, sufficient credits, ledger entry.
-- -----------------------------------------------------------------------------
create or replace function public.boost_listing(
  p_listing_id uuid,
  p_product_key text default 'boost_3d'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_agent uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_prod public.boost_products%rowtype;
  v_balance int;
  v_boost_id uuid;
begin
  if v_agent is null then
    raise exception 'not authenticated';
  end if;

  select l.agent_id, l.status into v_owner, v_status
  from public.listings l where l.id = p_listing_id;
  if v_owner is null then raise exception 'listing not found'; end if;
  if v_owner <> v_agent then raise exception 'only the listing owner may boost it'; end if;
  if v_status <> 'published' then
    raise exception 'only a published listing can be boosted';
  end if;

  select * into v_prod from public.boost_products
   where key = p_product_key and is_active;
  if v_prod.key is null then raise exception 'boost product not available'; end if;

  -- Expire anything stale on this listing before checking for a live boost.
  update public.listing_boosts
     set status = 'expired'
   where listing_id = p_listing_id and status = 'active' and ends_at <= now();

  if exists (select 1 from public.listing_boosts
             where listing_id = p_listing_id and status = 'active' and ends_at > now()) then
    raise exception 'this listing is already boosted';
  end if;

  -- Wallet. Free mode means credit_cost = 0, so this is a no-op today but the
  -- accounting is real from day one.
  insert into public.credit_wallets (agent_id) values (v_agent)
  on conflict (agent_id) do nothing;

  select balance into v_balance from public.credit_wallets where agent_id = v_agent;
  if v_balance < v_prod.credit_cost then
    raise exception 'insufficient credits';
  end if;

  insert into public.listing_boosts
    (listing_id, agent_id, product_key, ends_at, credits_spent, rank_weight)
  values
    (p_listing_id, v_agent, v_prod.key,
     now() + make_interval(days => v_prod.duration_days),
     v_prod.credit_cost, v_prod.rank_weight)
  returning id into v_boost_id;

  if v_prod.credit_cost > 0 then
    update public.credit_wallets
       set balance = balance - v_prod.credit_cost,
           lifetime_spent = lifetime_spent + v_prod.credit_cost
     where agent_id = v_agent
    returning balance into v_balance;

    insert into public.credit_transactions
      (agent_id, delta, balance_after, reason, ref_type, ref_id)
    values (v_agent, -v_prod.credit_cost, v_balance, 'boost', 'listing_boost', v_boost_id);
  end if;

  -- log_audit takes entity_id as TEXT, not uuid — the cast is required or
  -- function resolution fails at runtime.
  perform public.log_audit('listing.boosted', 'listing', p_listing_id::text, null,
    jsonb_build_object('product', v_prod.key, 'boost_id', v_boost_id,
                       'credits', v_prod.credit_cost), null, 'success');

  return v_boost_id;
end;
$$;

/** Sweep lapsed boosts. Called by the scheduled job and by boost_listing(). */
create or replace function public.expire_lapsed_boosts()
returns int language sql security definer set search_path = public as $$
  with done as (
    update public.listing_boosts set status = 'expired'
     where status = 'active' and ends_at <= now()
    returning 1
  ) select count(*)::int from done;
$$;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.boost_products enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.listing_boosts enable row level security;

-- Products are a price list: every signed-in agent may read them.
create policy "boost products read" on public.boost_products
  for select to authenticated using (is_active);
create policy "boost products admin" on public.boost_products
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "credit wallet own read" on public.credit_wallets
  for select to authenticated
  using (agent_id = auth.uid() or public.is_platform_admin());

-- No insert/update policy for agents: only boost_listing() and admin move money.
create policy "credit wallet admin" on public.credit_wallets
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "credit tx own read" on public.credit_transactions
  for select to authenticated
  using (agent_id = auth.uid() or public.is_platform_admin());
-- Deliberately append-only: no update or delete policy exists, for anyone.

create policy "listing boosts own read" on public.listing_boosts
  for select to authenticated
  using (agent_id = auth.uid() or public.is_platform_admin());
create policy "listing boosts admin" on public.listing_boosts
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
-- Agents never INSERT directly — boost_listing() is the only door.

-- =============================================================================
-- Public view gains boost fields so the marketplace can rank and label them
-- =============================================================================
create or replace view public.public_listings with (security_invoker = false) as
select
  l.id, l.human_readable_id, l.slug, l.listing_type, l.currency, l.price,
  l.rent_period, l.price_negotiable, l.deposit, l.service_charge, l.language,
  l.title, l.description, l.title_en, l.description_en, l.key_selling_points,
  l.available_from, l.published_at, l.is_verified, l.is_featured,
  l.quality_score, l.ranking_score, l.view_count, l.save_count,

  p.id as property_id, p.property_category, p.property_type, p.ownership_type,
  p.general_address, p.building_name, p.developer_name, p.postal_code,
  p.province_name, p.regency_name, p.district_name, p.village_name,
  p.location_id, p.ancestor_location_ids,
  extensions.st_y(p.geom::extensions.geometry) as latitude,
  extensions.st_x(p.geom::extensions.geometry) as longitude,
  p.land_size, p.building_size, p.measurement_unit, p.bedrooms, p.bathrooms,
  p.floors, p.floor_level, p.parking_spaces, p.year_built, p.furnishing,
  p.property_condition, p.facing, p.electricity_va, p.facilities,

  l.agent_id, ap.display_name as agent_display_name,
  ap.avatar_url as agent_avatar_url, agp.agency_name as agent_agency_name,
  (ap.agent_status = 'verified') as agent_is_verified,

  cover.processed_path as cover_image_path,
  cover.thumbnail_path as cover_thumbnail_path,
  cover.alt_text as cover_alt_text,
  (select count(*) from public.listing_media m
     where m.listing_id = l.id and m.processing_state = 'ready') as media_count,

  -- Promotion, always labelled in the UI (§14 transparency).
  public.listing_boost_weight(l.id) as boost_weight,
  (public.listing_boost_weight(l.id) > 0) as is_boosted
from public.listings l
join public.properties p on p.id = l.property_id
join public.profiles ap on ap.id = l.agent_id
left join public.agent_profiles agp on agp.user_id = l.agent_id
left join lateral (
  select m.processed_path, m.thumbnail_path, m.alt_text
  from public.listing_media m
  where m.listing_id = l.id and m.processing_state = 'ready'
  order by m.is_cover desc, m.position
  limit 1
) cover on true
where l.status = 'published'
  and l.moderation_state = 'approved'
  and l.archived_at is null
  and p.archived_at is null
  and (l.expires_at is null or l.expires_at > now());

-- Recreating the view drops its grants; restore them, SELECT only (00032).
revoke all on public.public_listings from anon, authenticated;
grant select on public.public_listings to anon, authenticated;
