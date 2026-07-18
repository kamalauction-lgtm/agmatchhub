-- =============================================================================
-- 00015 — Commission sharing agreements · spec §72–78, §82–84
-- Versioned, dual-accepted, never silently overwritten (§76). All writes go
-- through definer functions so §83 validation always runs server-side.
-- Confidential to the two agents + admin (§78) — no client path exists.
-- =============================================================================

create table public.commission_agreements (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,          -- COM-2026-000001
  submission_id uuid not null unique references public.property_submissions(id) on delete cascade,
  -- Total commission declared by the SA (§72)
  total_commission_type text check (total_commission_type in
    ('percentage','fixed','rental_months','to_be_confirmed')),
  total_percentage numeric(7,4) check (total_percentage is null or (total_percentage >= 0 and total_percentage <= 100)),
  total_amount numeric(14,2) check (total_amount is null or total_amount >= 0),
  total_months numeric(5,2) check (total_months is null or total_months >= 0),
  currency text references public.currencies(code),
  calculation_basis text check (calculation_basis in
    ('final_sale_price','asking_price','accepted_offer_price','monthly_rental',
     'annual_rental','total_lease_value','other')),
  payer_type text check (payer_type in
    ('seller','owner','landlord','developer','listing_agency','supply_agent','other')),
  status text not null default 'proposed' check (status in
    ('draft','proposed','counter_proposed','accepted','revised','disputed','cancelled')),
  current_version_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_commission_agreements_updated before update on public.commission_agreements
  for each row execute function public.set_updated_at();

create table public.commission_agreement_versions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.commission_agreements(id) on delete cascade,
  version_number int not null,
  sharing_method text not null check (sharing_method in
    ('fifty_fifty','custom_percentage','custom_fixed')),
  listing_side_percentage numeric(7,4),
  buyer_side_percentage numeric(7,4),
  listing_side_amount numeric(14,2),
  buyer_side_amount numeric(14,2),
  currency text references public.currencies(code),
  custom_terms text,
  amendment_reason text,
  proposed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (agreement_id, version_number)
);
-- version rows are immutable: no update/delete policies, no update grants used

create table public.commission_acceptances (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.commission_agreements(id) on delete cascade,
  version_id uuid not null references public.commission_agreement_versions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  side text not null check (side in ('listing_side','buyer_side')),
  accepted_terms jsonb not null,                   -- exact terms snapshot (§75)
  created_at timestamptz not null default now(),
  unique (version_id, user_id)
);

alter table public.commission_agreements enable row level security;
alter table public.commission_agreement_versions enable row level security;
alter table public.commission_acceptances enable row level security;

create policy "commission agreements participants" on public.commission_agreements
  for select to authenticated using (public.is_submission_participant(submission_id));
create policy "commission versions participants" on public.commission_agreement_versions
  for select to authenticated
  using (exists (select 1 from public.commission_agreements a
         where a.id = commission_agreement_versions.agreement_id
           and public.is_submission_participant(a.submission_id)));
create policy "commission acceptances participants" on public.commission_acceptances
  for select to authenticated
  using (exists (select 1 from public.commission_agreements a
         where a.id = commission_acceptances.agreement_id
           and public.is_submission_participant(a.submission_id)));
-- all writes via the definer functions below

-- ---------------------------------------------------------------------------
-- Propose a sharing arrangement (creates agreement + next version) — §73/§74
-- Server-side validation per §83. The proposer's active acceptance is
-- recorded immediately; the other side must accept to lock the version.
-- ---------------------------------------------------------------------------

create or replace function public.propose_commission_version(
  p_submission_id uuid,
  p_method text,
  p_listing_pct numeric default null,
  p_buyer_pct numeric default null,
  p_listing_amt numeric default null,
  p_buyer_amt numeric default null,
  p_custom_terms text default null,
  p_amendment_reason text default null,
  p_total_type text default null,
  p_total_percentage numeric default null,
  p_total_amount numeric default null,
  p_calculation_basis text default null,
  p_payer_type text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_is_sa boolean; v_is_ra boolean;
  v_agreement public.commission_agreements%rowtype;
  v_currency text; v_next int; v_version_id uuid; v_human text;
  v_lp numeric; v_bp numeric; v_la numeric; v_ba numeric;
begin
  select exists (select 1 from public.property_submissions s
                 where s.id = p_submission_id and s.supply_agent_id = auth.uid()) into v_is_sa;
  select exists (select 1 from public.property_submissions s
                 where s.id = p_submission_id and public.owns_request(s.request_id)) into v_is_ra;
  if not (v_is_sa or v_is_ra) then raise exception 'not authorised'; end if;

  select s.currency into v_currency from public.property_submissions s where s.id = p_submission_id;

  -- §83 validation
  if p_method = 'fifty_fifty' then
    v_lp := 50; v_bp := 50; v_la := null; v_ba := null;
  elsif p_method = 'custom_percentage' then
    if p_listing_pct is null or p_buyer_pct is null then
      raise exception 'percentages required';
    end if;
    if p_listing_pct < 0 or p_buyer_pct < 0 or p_listing_pct > 100 or p_buyer_pct > 100 then
      raise exception 'percentages out of range';
    end if;
    if round(p_listing_pct + p_buyer_pct, 2) <> 100 then
      raise exception 'percentages must total 100';
    end if;
    v_lp := p_listing_pct; v_bp := p_buyer_pct; v_la := null; v_ba := null;
  elsif p_method = 'custom_fixed' then
    if p_listing_amt is null or p_buyer_amt is null then
      raise exception 'amounts required';
    end if;
    if p_listing_amt < 0 or p_buyer_amt < 0 then
      raise exception 'amounts must not be negative';
    end if;
    v_la := p_listing_amt; v_ba := p_buyer_amt; v_lp := null; v_bp := null;
  else
    raise exception 'unknown sharing method';
  end if;

  select * into v_agreement from public.commission_agreements
    where submission_id = p_submission_id;

  if v_agreement.id is null then
    v_human := public.next_human_id('COM');
    insert into public.commission_agreements
      (human_readable_id, submission_id, total_commission_type, total_percentage,
       total_amount, currency, calculation_basis, payer_type, created_by)
    values
      (v_human, p_submission_id, p_total_type, p_total_percentage,
       p_total_amount, v_currency, p_calculation_basis, p_payer_type, auth.uid())
    returning * into v_agreement;
  elsif v_agreement.status = 'accepted' and p_amendment_reason is null then
    -- §76: amending an accepted agreement requires a stated reason
    raise exception 'amendment reason required';
  end if;

  -- Fixed-amount total reconciliation (§83) when a fixed total is declared
  if p_method = 'custom_fixed' and coalesce(p_total_amount, v_agreement.total_amount) is not null
     and (v_la + v_ba) > coalesce(p_total_amount, v_agreement.total_amount)
     and p_custom_terms is null then
    raise exception 'allocation exceeds declared total';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.commission_agreement_versions
    where agreement_id = v_agreement.id;

  insert into public.commission_agreement_versions
    (agreement_id, version_number, sharing_method, listing_side_percentage,
     buyer_side_percentage, listing_side_amount, buyer_side_amount, currency,
     custom_terms, amendment_reason, proposed_by)
  values
    (v_agreement.id, v_next, p_method, v_lp, v_bp, v_la, v_ba, v_currency,
     p_custom_terms, p_amendment_reason, auth.uid())
  returning id into v_version_id;

  update public.commission_agreements
    set current_version_id = v_version_id,
        status = case when v_next = 1 then 'proposed'
                      when v_agreement.status = 'accepted' then 'revised'
                      else 'counter_proposed' end,
        total_commission_type = coalesce(p_total_type, total_commission_type),
        total_percentage = coalesce(p_total_percentage, total_percentage),
        total_amount = coalesce(p_total_amount, total_amount),
        calculation_basis = coalesce(p_calculation_basis, calculation_basis),
        payer_type = coalesce(p_payer_type, payer_type)
    where id = v_agreement.id;

  -- Proposer actively accepts their own proposal (§75)
  insert into public.commission_acceptances (agreement_id, version_id, user_id, side, accepted_terms)
  values (v_agreement.id, v_version_id, auth.uid(),
          case when v_is_sa then 'listing_side' else 'buyer_side' end,
          jsonb_build_object('method', p_method, 'listing_pct', v_lp, 'buyer_pct', v_bp,
                             'listing_amt', v_la, 'buyer_amt', v_ba,
                             'currency', v_currency, 'terms', p_custom_terms,
                             'version', v_next));
  return v_version_id;
end $$;

-- ---------------------------------------------------------------------------
-- Accept the current version (§75). When both sides have accepted → locked.
-- ---------------------------------------------------------------------------

create or replace function public.accept_commission_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_agreement public.commission_agreements%rowtype;
  v_version public.commission_agreement_versions%rowtype;
  v_is_sa boolean; v_is_ra boolean; v_sides int;
begin
  select v.* into v_version from public.commission_agreement_versions v where v.id = p_version_id;
  if v_version.id is null then raise exception 'version not found'; end if;
  select a.* into v_agreement from public.commission_agreements a where a.id = v_version.agreement_id;
  if v_agreement.current_version_id <> p_version_id then
    raise exception 'not the current version';
  end if;

  select exists (select 1 from public.property_submissions s
                 where s.id = v_agreement.submission_id and s.supply_agent_id = auth.uid()) into v_is_sa;
  select exists (select 1 from public.property_submissions s
                 where s.id = v_agreement.submission_id and public.owns_request(s.request_id)) into v_is_ra;
  if not (v_is_sa or v_is_ra) then raise exception 'not authorised'; end if;

  insert into public.commission_acceptances (agreement_id, version_id, user_id, side, accepted_terms)
  values (v_agreement.id, p_version_id, auth.uid(),
          case when v_is_sa then 'listing_side' else 'buyer_side' end,
          jsonb_build_object('method', v_version.sharing_method,
                             'listing_pct', v_version.listing_side_percentage,
                             'buyer_pct', v_version.buyer_side_percentage,
                             'listing_amt', v_version.listing_side_amount,
                             'buyer_amt', v_version.buyer_side_amount,
                             'currency', v_version.currency,
                             'terms', v_version.custom_terms,
                             'version', v_version.version_number))
  on conflict (version_id, user_id) do nothing;

  select count(distinct side) into v_sides
    from public.commission_acceptances where version_id = p_version_id;
  if v_sides = 2 then
    update public.commission_agreements set status = 'accepted' where id = v_agreement.id;
  end if;
end $$;
