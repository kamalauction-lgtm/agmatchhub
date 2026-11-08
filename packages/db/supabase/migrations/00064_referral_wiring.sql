-- =============================================================================
-- 00064 — Wiring the referral loop to real events
--
-- 00063 built the scoring and the payouts. Nothing issued a code and nothing
-- attributed a signup, so the engine had no input. This connects it:
--
--   ensure_referral_code()   every agent gets a code, on demand, once
--   attach_referral()        a signup is attributed at registration
--   the two hooks            verification and listing approval advance the funnel
--
-- WHY THE HOOKS ARE TRIGGERS
--   Activation depends on two things decided by OTHER people: an admin
--   verifying the agent, and an admin approving their listing. Neither of
--   those code paths should have to remember to call the referral engine — a
--   forgotten call means an agent silently never gets paid, and nobody finds
--   out for weeks. The database watches the columns instead.
-- =============================================================================

/**
 * A short, human-shareable code.
 *
 * Deliberately excludes 0/O and 1/I/L: this code gets read off a phone screen
 * and typed by someone else, and those pairs are where that goes wrong.
 */
create or replace function public.generate_referral_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try int := 0;
begin
  loop
    v_code := '';
    for i in 1..7 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.referral_codes where code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then
      raise exception 'could not allocate a referral code';
    end if;
  end loop;
  return v_code;
end;
$$;

/**
 * The caller's code, created on first ask.
 *
 * Idempotent: a second call returns the same code. Only ever issues a code for
 * the CALLER, so an agent cannot mint codes on behalf of anyone else.
 */
create or replace function public.ensure_referral_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select code into v_code from public.referral_codes
  where user_id = v_user and is_active limit 1;
  if v_code is not null then
    return v_code;
  end if;

  v_code := public.generate_referral_code();
  insert into public.referral_codes (code, user_id) values (v_code, v_user);
  return v_code;
end;
$$;

/**
 * Attribute a newly registered agent to whoever referred them.
 *
 * Runs as the new user, immediately after signup. The guards here are the ones
 * that matter for a free-capacity campaign:
 *
 *   · a code must exist and be active
 *   · nobody may refer themselves
 *   · a person can only ever be attributed ONCE — the unique constraint on
 *     referrals.referred_id enforces it, so a later code cannot steal a signup
 *   · attribution is only accepted for a brand new account, so an established
 *     agent cannot be retro-claimed by a friend
 *
 * Returns true only when a referral row was actually created.
 */
create or replace function public.attach_referral(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_referrer uuid;
  v_campaign uuid;
  v_age interval;
begin
  if v_user is null or p_code is null or btrim(p_code) = '' then
    return false;
  end if;

  select user_id into v_referrer from public.referral_codes
  where code = upper(btrim(p_code)) and is_active;
  if v_referrer is null or v_referrer = v_user then
    return false;
  end if;

  if exists (select 1 from public.referrals where referred_id = v_user) then
    return false;                                   -- already attributed
  end if;

  -- Only a fresh account. Ten minutes is generous for a signup round trip and
  -- far too short to retro-claim somebody who joined last month.
  select now() - created_at into v_age from public.profiles where id = v_user;
  if v_age is null or v_age > interval '10 minutes' then
    return false;
  end if;

  select id into v_campaign from public.growth_campaigns
  where status = 'active' and starts_at <= now()
    and (ends_at is null or ends_at > now())
  order by starts_at desc limit 1;

  insert into public.referrals (referrer_id, referred_id, campaign_id, code, stage)
  values (v_referrer, v_user, v_campaign, upper(btrim(p_code)), 'REGISTERED');

  insert into public.referral_events (referral_id, stage, note)
  select id, 'REGISTERED', 'signed up with code ' || upper(btrim(p_code))
  from public.referrals where referred_id = v_user;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- The hooks
-- -----------------------------------------------------------------------------

/**
 * An agent became verified — re-evaluate whoever referred them.
 *
 * `evaluate_referral` is re-entrant and cheap when nothing changed, so firing
 * on every relevant transition is safe.
 */
create or replace function public.on_agent_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.agent_status = 'verified' and old.agent_status is distinct from 'verified' then
    perform public.evaluate_referral(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_referral_on_verification on public.profiles;
create trigger trg_referral_on_verification
  after update of agent_status on public.profiles
  for each row execute function public.on_agent_status_change();

/**
 * A listing became publicly visible — that is the other half of activation.
 *
 * Fires on the transition INTO published+approved, not on every update of an
 * already-live listing.
 */
create or replace function public.on_listing_published()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and new.moderation_state = 'approved'
     and (old.status is distinct from 'published' or old.moderation_state is distinct from 'approved')
  then
    perform public.evaluate_referral(new.agent_id);
    -- The referrer's inventory-based milestones may also have moved (§25).
    perform public.award_referral_rewards(r.referrer_id)
      from public.referrals r
      where r.referred_id = new.agent_id and r.invalidated_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_referral_on_publish on public.listings;
create trigger trg_referral_on_publish
  after update of status, moderation_state on public.listings
  for each row execute function public.on_listing_published();

-- A listing that arrives already published (the import path does this) has to
-- count too, or an agent activated by an import is never paid for.
create or replace function public.on_listing_inserted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and new.moderation_state = 'approved' then
    perform public.evaluate_referral(new.agent_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_referral_on_listing_insert on public.listings;
create trigger trg_referral_on_listing_insert
  after insert on public.listings
  for each row execute function public.on_listing_inserted();

-- -----------------------------------------------------------------------------
-- The agent's own growth summary, in one round trip
-- -----------------------------------------------------------------------------

create or replace function public.my_growth_summary()
returns table (
  code text,
  activated int,
  pending int,
  network_listings int,
  bonus_listing_slots int,
  boost_credits int,
  featured_vouchers int,
  points int
)
language sql stable security definer set search_path = public as $$
  select
    (select rc.code from public.referral_codes rc where rc.user_id = auth.uid() and rc.is_active limit 1),
    public.activated_referral_count(auth.uid()),
    (select count(*)::int from public.referrals r
      where r.referrer_id = auth.uid() and r.invalidated_at is null and r.stage <> 'ACTIVATED'),
    public.network_published_listings(auth.uid()),
    -- Only what referrals earned, not the plan allowance: this is the "you
    -- earned this" number, and mixing the plan into it would overstate it.
    (select coalesce(sum(g.int_value), 0)::int from public.entitlement_grants g
      where g.user_id = auth.uid() and g.entitlement_key = 'listing.active_limit'
        and g.source in ('referral_reward', 'campaign') and g.revoked_at is null),
    (select coalesce(sum(g.int_value), 0)::int from public.entitlement_grants g
      where g.user_id = auth.uid() and g.entitlement_key = 'boost.monthly_credits'
        and g.source in ('referral_reward', 'campaign') and g.revoked_at is null),
    (select coalesce(sum(g.int_value), 0)::int from public.entitlement_grants g
      where g.user_id = auth.uid() and g.entitlement_key = 'featured.vouchers'
        and g.source in ('referral_reward', 'campaign') and g.revoked_at is null),
    (select coalesce(rp.points, 0) from public.referral_points rp where rp.user_id = auth.uid());
$$;

/** The next rung, so the dashboard can say "3 more to unlock…". */
create or replace function public.my_next_reward()
returns table (threshold int, remaining int, label text)
language sql stable security definer set search_path = public as $$
  select rr.threshold,
         rr.threshold - public.activated_referral_count(auth.uid()),
         rr.label
  from public.referral_reward_rules rr
  join public.growth_campaigns gc on gc.id = rr.campaign_id
  where gc.status = 'active'
    and rr.is_active
    and rr.metric = 'activated_referrals'
    and rr.recipient = 'referrer'
    and rr.threshold > public.activated_referral_count(auth.uid())
  order by rr.threshold asc
  limit 1;
$$;

revoke all on function public.generate_referral_code() from anon, authenticated;
revoke all on function public.ensure_referral_code() from anon;
revoke all on function public.attach_referral(text) from anon;
revoke all on function public.my_growth_summary() from anon;
revoke all on function public.my_next_reward() from anon;
grant execute on function public.ensure_referral_code() to authenticated;
grant execute on function public.attach_referral(text) to authenticated;
grant execute on function public.my_growth_summary() to authenticated;
grant execute on function public.my_next_reward() to authenticated;
