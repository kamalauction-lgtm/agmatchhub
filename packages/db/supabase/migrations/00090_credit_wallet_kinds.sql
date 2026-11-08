-- =============================================================================
-- 00090 — Credit wallets get a KIND
--
-- One wallet pattern, several balances. Boost credits (00042) and AI credits
-- (Decision 3: premium generative work is credit-metered, separately from the
-- monthly AI text allowance) must never be confusable, and a third kind later
-- (e.g. WhatsApp message credits) must be a row, not a table.
--
--   credit_wallets        PK (agent_id)  →  PK (agent_id, kind)
--   credit_transactions   + kind, + reasons for AI and promotional credit
--   boost_listing()       unchanged arithmetic, now explicit about kind='boost'
--   credit_grant()        the ONE way credit is added — admin or service only
--   credit_spend()        the ONE way credit leaves outside boost_listing()
--
-- Both tables had zero rows in production on 7 Nov 2026; the PK change is
-- still written to be safe on populated tables (existing rows become 'boost').
-- =============================================================================

alter table public.credit_wallets
  add column if not exists kind text not null default 'boost'
    check (kind in ('boost', 'ai'));

alter table public.credit_wallets drop constraint credit_wallets_pkey;
alter table public.credit_wallets add primary key (agent_id, kind);

alter table public.credit_transactions
  add column if not exists kind text not null default 'boost'
    check (kind in ('boost', 'ai'));

alter table public.credit_transactions drop constraint credit_transactions_reason_check;
alter table public.credit_transactions add constraint credit_transactions_reason_check
  check (reason in ('grant', 'purchase', 'boost', 'refund', 'adjustment', 'expiry',
                    'ai_usage', 'promotion', 'hero_welcome', 'topup'));

create index if not exists idx_credit_tx_agent_kind
  on public.credit_transactions (agent_id, kind, created_at desc);

comment on column public.credit_wallets.kind is
  'boost = listing boosts (00042); ai = metered premium AI work (images, video, large documents). One row per agent per kind.';

-- -----------------------------------------------------------------------------
-- boost_listing(): same rules, same numbers, wallet addressed by kind
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

  update public.listing_boosts
     set status = 'expired'
   where listing_id = p_listing_id and status = 'active' and ends_at <= now();

  if exists (select 1 from public.listing_boosts
             where listing_id = p_listing_id and status = 'active' and ends_at > now()) then
    raise exception 'this listing is already boosted';
  end if;

  insert into public.credit_wallets (agent_id, kind) values (v_agent, 'boost')
  on conflict (agent_id, kind) do nothing;

  select balance into v_balance from public.credit_wallets where agent_id = v_agent and kind = 'boost';
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
     where agent_id = v_agent and kind = 'boost'
    returning balance into v_balance;

    insert into public.credit_transactions
      (agent_id, kind, delta, balance_after, reason, ref_type, ref_id)
    values (v_agent, 'boost', -v_prod.credit_cost, v_balance, 'boost', 'listing_boost', v_boost_id);
  end if;

  perform public.log_audit('listing.boosted', 'listing', p_listing_id::text, null,
    jsonb_build_object('product', v_prod.key, 'boost_id', v_boost_id,
                       'credits', v_prod.credit_cost), null, 'success');

  return v_boost_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- credit_grant(): credit comes in through here and nowhere else
-- -----------------------------------------------------------------------------
-- Admin (commercial.manage) by hand, the service role from a webhook or a
-- promotion (E11 will call it from a verified payment). An agent can never call
-- it for themselves: that is the whole difference between a wallet and a
-- number in a profile.
create or replace function public.credit_grant(
  p_agent uuid, p_kind text, p_amount int, p_reason text,
  p_note text default null, p_ref_type text default null, p_ref_id uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  if not (auth.uid() is null or public.has_capability('commercial.manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_reason not in ('grant', 'purchase', 'refund', 'adjustment', 'promotion', 'hero_welcome', 'topup') then
    raise exception 'not a crediting reason: %', p_reason;
  end if;

  insert into public.credit_wallets (agent_id, kind, balance, lifetime_granted)
  values (p_agent, p_kind, p_amount, p_amount)
  on conflict (agent_id, kind) do update
    set balance = public.credit_wallets.balance + excluded.balance,
        lifetime_granted = public.credit_wallets.lifetime_granted + excluded.lifetime_granted
  returning balance into v_balance;

  insert into public.credit_transactions (agent_id, kind, delta, balance_after, reason, ref_type, ref_id, note)
  values (p_agent, p_kind, p_amount, v_balance, p_reason, p_ref_type, p_ref_id, left(p_note, 300));

  perform public.log_audit('credit.granted', 'credit_wallet', p_agent::text, null,
    jsonb_build_object('kind', p_kind, 'amount', p_amount, 'reason', p_reason, 'balance', v_balance), null, 'success');
  return v_balance;
end $$;

-- -----------------------------------------------------------------------------
-- credit_spend(): for the agent's own metered work (AI image, video, …)
-- -----------------------------------------------------------------------------
-- The agent may spend their own balance; the service may spend on their behalf
-- from a server action that already checked the work is theirs. Refuses to go
-- below zero rather than clamping — the caller must know it did not happen.
create or replace function public.credit_spend(
  p_agent uuid, p_kind text, p_amount int, p_reason text,
  p_ref_type text default null, p_ref_id uuid default null, p_note text default null
) returns int language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  if not (auth.uid() is null or auth.uid() = p_agent or public.has_capability('commercial.manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_reason not in ('boost', 'ai_usage', 'adjustment', 'expiry') then
    raise exception 'not a spending reason: %', p_reason;
  end if;

  update public.credit_wallets
     set balance = balance - p_amount,
         lifetime_spent = lifetime_spent + p_amount
   where agent_id = p_agent and kind = p_kind and balance >= p_amount
  returning balance into v_balance;
  if v_balance is null then
    raise exception 'insufficient credits' using errcode = 'P0001';
  end if;

  insert into public.credit_transactions (agent_id, kind, delta, balance_after, reason, ref_type, ref_id, note)
  values (p_agent, p_kind, -p_amount, v_balance, p_reason, p_ref_type, p_ref_id, left(p_note, 300));
  return v_balance;
end $$;

/** Balance by kind; 0 when the wallet does not exist yet. Own, admin, or service. */
create or replace function public.credit_balance(p_agent uuid, p_kind text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null or auth.uid() = p_agent or public.is_platform_admin()
      then coalesce((select w.balance from public.credit_wallets w where w.agent_id = p_agent and w.kind = p_kind), 0)
    else 0 end;
$$;

revoke all on function public.credit_grant(uuid, text, int, text, text, text, uuid) from public, anon;
revoke all on function public.credit_spend(uuid, text, int, text, text, uuid, text) from public, anon;
revoke all on function public.credit_balance(uuid, text) from public, anon;
grant execute on function public.credit_grant(uuid, text, int, text, text, text, uuid) to authenticated;
grant execute on function public.credit_spend(uuid, text, int, text, text, uuid, text) to authenticated;
grant execute on function public.credit_balance(uuid, text) to authenticated;
