-- 00027: Admin-created agents + admin submits properties on behalf of agents
--
-- Owner requirement: many agents are busy / not computer-savvy, so the admin
-- team creates their account AND submits properties for them. The property is
-- still attributed to the agent (supply_agent_id) so the AGENT receives every
-- notification on their own email/phone. The agent verifies their profile later.
--
-- These two flows run through the SERVICE client from an admin-gated server
-- action, so auth.uid() is null (service role). Any commission RPC that relies
-- on auth.uid() therefore needs an admin variant that trusts an explicit,
-- role-checked admin id — see propose_commission_version_admin below.

-- 1. Mark agent accounts that an admin created on the agent's behalf.
alter table public.agent_profiles
  add column if not exists created_by_admin_id uuid references public.profiles(id);

-- 2. Mark submissions an admin entered on behalf of the supply agent.
--    When not null, the row was created by that admin for supply_agent_id.
alter table public.property_submissions
  add column if not exists created_by_admin_id uuid references public.profiles(id);

-- 3. Admin-on-behalf commission proposal.
--    Mirrors public.propose_commission_version but (a) authorises via an
--    explicit p_admin_id checked against user_roles instead of auth.uid(), and
--    (b) attributes the proposal to the SUPPLY AGENT (listing side), so the
--    record is indistinguishable from the agent having proposed it themselves.
create or replace function public.propose_commission_version_admin(
  p_submission_id uuid,
  p_admin_id uuid,
  p_method text,
  p_listing_pct numeric default null,
  p_buyer_pct numeric default null,
  p_listing_amt numeric default null,
  p_buyer_amt numeric default null,
  p_custom_terms text default null,
  p_total_type text default null,
  p_total_percentage numeric default null,
  p_total_amount numeric default null,
  p_calculation_basis text default null,
  p_payer_type text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
  v_actor uuid;                 -- the supply agent the proposal is attributed to
  v_agreement public.commission_agreements%rowtype;
  v_currency text; v_next int; v_version_id uuid; v_human text;
  v_lp numeric; v_bp numeric; v_la numeric; v_ba numeric;
begin
  -- Authority: p_admin_id must hold a platform-admin role (no auth.uid() here).
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_admin_id
      and r.key in ('super_admin','admin','country_admin','compliance_admin')
  ) into v_is_admin;
  if not v_is_admin then raise exception 'not authorised'; end if;

  select s.supply_agent_id, s.currency into v_actor, v_currency
    from public.property_submissions s where s.id = p_submission_id;
  if v_actor is null then raise exception 'submission not found'; end if;

  -- §83 validation (identical to the agent path)
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
       p_total_amount, v_currency, p_calculation_basis, p_payer_type, v_actor)
    returning * into v_agreement;
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
     p_custom_terms, null, v_actor)
  returning id into v_version_id;

  update public.commission_agreements
    set current_version_id = v_version_id,
        status = 'proposed',
        total_commission_type = coalesce(p_total_type, total_commission_type),
        total_percentage = coalesce(p_total_percentage, total_percentage),
        total_amount = coalesce(p_total_amount, total_amount),
        calculation_basis = coalesce(p_calculation_basis, calculation_basis),
        payer_type = coalesce(p_payer_type, payer_type)
    where id = v_agreement.id;

  -- The agent (listing side) is recorded as having proposed and accepted their
  -- own terms, exactly as the normal flow does.
  insert into public.commission_acceptances (agreement_id, version_id, user_id, side, accepted_terms)
  values (v_agreement.id, v_version_id, v_actor, 'listing_side',
          jsonb_build_object('method', p_method, 'listing_pct', v_lp, 'buyer_pct', v_bp,
                             'listing_amt', v_la, 'buyer_amt', v_ba,
                             'currency', v_currency, 'terms', p_custom_terms,
                             'version', v_next, 'entered_by_admin', p_admin_id));
  return v_version_id;
end $$;

revoke all on function public.propose_commission_version_admin(
  uuid, uuid, text, numeric, numeric, numeric, numeric, text, text, numeric, numeric, text, text
) from anon, authenticated;
