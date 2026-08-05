-- =============================================================================
-- 00040 — Co-Marketing, Phase A
--
-- Design: docs/module-co-marketing.md. A listing agent (LA) offers a published
-- listing to other agents under stated commission terms; a marketing agent
-- (MA) picks it up and markets it as their own inventory on their own landing
-- page, with their contact details public.
--
-- Phase A is the spine: offers, the document gate, terms snapshots and
-- engagements. Landing pages, lead attribution and AI come later.
--
-- The gate that matters: a listing cannot be offered unless the property has
-- owner authorisation ON RECORD. "Dokumen sah" is enforced here, in the
-- database, not trusted to the UI.
-- =============================================================================

-- Definer helpers. Policies below never subquery their own table (00020–00022,
-- 00039): these are the doors.
create or replace function public.property_authorisation_obtained(p_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.property_private pp
    where pp.property_id = p_property_id
      and pp.owner_authorisation_status = 'obtained'
  );
$$;

-- -----------------------------------------------------------------------------
-- Offers
-- -----------------------------------------------------------------------------
create table public.comarketing_offers (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,               -- CMO-2026-000001

  listing_id uuid not null references public.listings(id) on delete cascade,
  -- The single embeddable profiles FK on this table (00028's lesson).
  listing_agent_id uuid not null references public.profiles(id),

  status text not null default 'active' check (status in
    ('draft','active','paused','withdrawn','closed')),
  scope text not null default 'open_pool' check (scope in
    ('open_pool','invite_only','agency_only')),

  -- Terms. Money is numeric, never float (§36).
  commission_basis text not null default 'total_pct'
    check (commission_basis in ('total_pct','fixed_amount')),
  total_commission_pct numeric(7,4) check (total_commission_pct between 0 and 100),
  total_commission_amount numeric(14,2) check (total_commission_amount >= 0),
  marketing_agent_share_pct numeric(7,4) not null
    check (marketing_agent_share_pct between 0 and 100),
  payer text not null default 'owner' check (payer in ('owner','buyer','developer')),

  allow_price_display boolean not null default true,
  max_marketing_agents int check (max_marketing_agents > 0),
  requires_la_approval boolean not null default false,
  notes text,

  terms_version int not null default 1,
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- One live offer per listing; re-offering after withdrawal is allowed.
create unique index idx_comarketing_one_live_offer on public.comarketing_offers (listing_id)
  where status in ('draft','active','paused');
create index idx_comarketing_offers_pool on public.comarketing_offers (status, scope, created_at desc)
  where status = 'active';
create index idx_comarketing_offers_agent on public.comarketing_offers (listing_agent_id, status);

create trigger trg_comarketing_offers_updated before update on public.comarketing_offers
  for each row execute function public.set_updated_at();

-- Declared after the table it reads: a `language sql` body is validated at
-- creation time, so this cannot sit with the other helpers above.
create or replace function public.is_offer_listing_agent(p_offer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.comarketing_offers o
    where o.id = p_offer_id and o.listing_agent_id = auth.uid()
  );
$$;


-- Confidential terms live apart: RLS filters rows, not columns (the lesson
-- that produced property_submission_private).
create table public.comarketing_offer_private (
  offer_id uuid primary key references public.comarketing_offers(id) on delete cascade,
  min_marketing_price numeric(14,2) check (min_marketing_price >= 0),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_comarketing_offer_private_updated before update
  on public.comarketing_offer_private
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Engagements — one marketing agent picking up one offer
-- -----------------------------------------------------------------------------
create table public.comarketing_engagements (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,               -- CME-2026-000001

  offer_id uuid not null references public.comarketing_offers(id) on delete cascade,
  marketing_agent_id uuid not null references public.profiles(id),

  -- The immutable snapshot. If the LA later changes terms, this engagement
  -- keeps what was actually accepted (§76 amendment pattern).
  accepted_terms_version int not null,
  accepted_terms jsonb not null,
  accepted_at timestamptz not null default now(),

  status text not null default 'active' check (status in
    ('pending','active','paused','ended','revoked')),
  end_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (offer_id, marketing_agent_id)
);

create index idx_comarketing_engagements_agent
  on public.comarketing_engagements (marketing_agent_id, status);
create index idx_comarketing_engagements_offer
  on public.comarketing_engagements (offer_id, status);

create trigger trg_comarketing_engagements_updated before update
  on public.comarketing_engagements
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- The document gate + own-listing check, as a trigger so it cannot be bypassed
-- by any client that reaches the table. SECURITY INVOKER (00039).
-- -----------------------------------------------------------------------------
create or replace function public.guard_comarketing_offer()
returns trigger language plpgsql set search_path = public as $$
declare
  v_property_id uuid;
  v_agent_id uuid;
  v_status text;
begin
  select l.property_id, l.agent_id, l.status
    into v_property_id, v_agent_id, v_status
  from public.listings l where l.id = new.listing_id;

  if v_property_id is null then
    raise exception 'listing not found';
  end if;
  if v_agent_id is distinct from new.listing_agent_id then
    raise exception 'only the listing owner may offer it for co-marketing';
  end if;
  if v_status <> 'published' then
    raise exception 'only a published listing can be offered for co-marketing';
  end if;
  if not public.property_authorisation_obtained(v_property_id) then
    raise exception 'owner authorisation must be on record before co-marketing';
  end if;
  return new;
end;
$$;

create trigger trg_guard_comarketing_offer
  before insert or update of listing_id, listing_agent_id on public.comarketing_offers
  for each row execute function public.guard_comarketing_offer();

-- An MA may end their own engagement, and nothing else.
create or replace function public.guard_comarketing_engagement()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_platform_admin()
     or auth.role() = 'service_role'
     or session_user in ('postgres', 'service_role')
     or public.is_offer_listing_agent(new.offer_id) then
    return new;
  end if;
  if new.accepted_terms_version is distinct from old.accepted_terms_version
     or new.accepted_terms is distinct from old.accepted_terms
     or new.accepted_at is distinct from old.accepted_at
     or new.offer_id is distinct from old.offer_id
     or new.marketing_agent_id is distinct from old.marketing_agent_id
     or new.human_readable_id is distinct from old.human_readable_id then
    raise exception 'accepted terms cannot be altered';
  end if;
  if new.status is distinct from old.status and new.status <> 'ended' then
    raise exception 'a marketing agent may only end their own engagement';
  end if;
  return new;
end;
$$;

create trigger trg_guard_comarketing_engagement
  before update on public.comarketing_engagements
  for each row execute function public.guard_comarketing_engagement();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.comarketing_offers enable row level security;
alter table public.comarketing_offer_private enable row level security;
alter table public.comarketing_engagements enable row level security;

-- Offers: the LA controls their own; every verified agent can see the open
-- pool; admins see everything.
create policy "comarketing offers owner" on public.comarketing_offers
  for all to authenticated
  using (listing_agent_id = auth.uid())
  with check (listing_agent_id = auth.uid());

create policy "comarketing offers pool read" on public.comarketing_offers
  for select to authenticated
  using (
    status = 'active'
    and scope = 'open_pool'
    and (expires_at is null or expires_at > now())
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.agent_status = 'verified')
  );

create policy "comarketing offers admin" on public.comarketing_offers
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Confidential terms: listing agent and admin only. Never the marketing agent.
create policy "comarketing offer private owner" on public.comarketing_offer_private
  for all to authenticated
  using (public.is_offer_listing_agent(offer_id) or public.is_platform_admin())
  with check (public.is_offer_listing_agent(offer_id) or public.is_platform_admin());

-- Engagements: the MA sees their own, the LA sees engagements on their offers.
create policy "comarketing engagements visibility" on public.comarketing_engagements
  for select to authenticated
  using (
    marketing_agent_id = auth.uid()
    or public.is_offer_listing_agent(offer_id)
    or public.is_platform_admin()
  );

create policy "comarketing engagements agent insert" on public.comarketing_engagements
  for insert to authenticated
  with check (
    marketing_agent_id = auth.uid()
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.agent_status = 'verified')
  );

create policy "comarketing engagements agent update" on public.comarketing_engagements
  for update to authenticated
  using (marketing_agent_id = auth.uid() or public.is_offer_listing_agent(offer_id))
  with check (marketing_agent_id = auth.uid() or public.is_offer_listing_agent(offer_id));

create policy "comarketing engagements admin" on public.comarketing_engagements
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

comment on table public.comarketing_offers is
  'A listing offered to other agents under stated commission terms. Requires owner authorisation on record — enforced by guard_comarketing_offer().';
comment on table public.comarketing_engagements is
  'One marketing agent marketing one offered listing. accepted_terms is an immutable snapshot; the marketing agent may only end their own engagement.';
