-- =============================================================================
-- 00069 — Flag targeting and audience parity
--
-- Three corrections to 00066/00068, all of the same shape: a rule that reads
-- the wrong column matches nobody, and matching nobody looks exactly like
-- working when you have no way to count the audience.
--
-- 1. WHICH COUNTRY COLUMN
--    `is_feature_enabled` read `profiles.country_code`; `announcement_matches`
--    read `agent_profiles.country_code`. In production 1 of 11 profiles has a
--    country and 5 of 5 agent_profiles do, so a country-targeted flag would
--    have quietly applied to almost nobody while the identical choice on the
--    announcements screen applied to everyone. Both now read
--    coalesce(agent_profiles, profiles) — the agent record first because it is
--    the one the verification flow fills in.
--
-- 2. CAMPAIGN FLAG TARGETS
--    `feature_flag_targets.target_type` has always allowed 'campaign' and
--    `is_feature_enabled` has never resolved it: the row would save, show in
--    the UI, and match no one. Implemented here with the same meaning the
--    announcements audience already gives it — the person was referred under
--    that campaign — rather than dropped, because "turn the booster on for
--    people who joined in the launch campaign" is what §38 is asking for.
--
-- 3. COUNTING A FLAG'S REACH
--    Targeting without a count is the same trap as an announcement without
--    one. `feature_flag_reach()` answers "how many people is this on for"
--    using is_feature_enabled itself, so the number and the behaviour cannot
--    drift apart.
-- =============================================================================

create or replace function public.is_feature_enabled(p_key text, p_user uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  with flag as (
    select * from public.feature_flags where key = p_key
  ),
  who as (
    select
      ap.agency_id,
      -- Agent record first: it is the one the verification flow fills in.
      coalesce(ap.country_code, pr.country_code) as country_code
    from public.profiles pr
    left join public.agent_profiles ap on ap.user_id = pr.id
    where pr.id = p_user
  )
  select case
    -- An unknown key is OFF. A typo must not silently enable something.
    when not exists (select 1 from flag) then false
    when not (select enabled from flag) then false
    when not (select targeted from flag) then true
    when p_user is null then false          -- targeted flag, nobody to match
    else exists (
      select 1
      from public.feature_flag_targets t
      left join who w on true
      where t.flag_key = p_key
        and (
          (t.target_type = 'user'    and t.user_id = p_user)
          or (t.target_type = 'agency'  and t.agency_id is not null and t.agency_id = w.agency_id)
          or (t.target_type = 'country' and t.country_code is not null and t.country_code = w.country_code)
          or (t.target_type = 'campaign' and t.campaign_id is not null and exists (
                select 1 from public.referrals r
                where r.referred_id = p_user and r.campaign_id = t.campaign_id
              ))
        )
    )
  end;
$$;

create or replace function public.announcement_matches(p_announcement uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with a as (select * from public.announcements where id = p_announcement),
  who as (
    select
      pr.id,
      pr.agent_status,
      ap.agency_id,
      coalesce(ap.country_code, pr.country_code) as country_code,
      (select p.key
         from public.subscriptions s
         join public.plan_versions pv on pv.id = s.plan_version_id
         join public.plans p on p.id = pv.plan_id
        where s.user_id = pr.id and s.status in ('trial','active','complimentary','grace')
        limit 1) as plan_key,
      (select max(l.published_at)
         from public.listings l
        where l.agent_id = pr.id and l.status = 'published') as last_published
    from public.profiles pr
    left join public.agent_profiles ap on ap.user_id = pr.id
    where pr.id = p_user
  )
  select case (select audience from a)
    when 'all'        then true
    when 'verified'   then (select agent_status from who) = 'verified'
    when 'unverified' then (select agent_status from who) is distinct from 'verified'
    when 'agency'     then (select agency_id from who) = (select agency_id from a)
    when 'country'    then (select country_code from who) = (select country_code from a)
    when 'plan'       then (select plan_key from who) = (select plan_key from a)
    when 'campaign'   then exists (
      select 1 from public.referrals r
      where r.referred_id = p_user and r.campaign_id = (select campaign_id from a)
    )
    -- Quiet means never published, or not since the cutoff. "Never" counts:
    -- an agent who has published nothing at all is the most inactive there is.
    when 'inactive'   then (
      (select last_published from who) is null
      or (select last_published from who)
         < now() - make_interval(days => coalesce((select inactive_days from a), 30))
    )
    else false
  end;
$$;

/**
 * How many people a flag is currently on for.
 *
 * Deliberately calls is_feature_enabled per profile rather than reproducing
 * the matching logic: a preview that disagrees with the behaviour is worse
 * than no preview. The table is small enough that the row-at-a-time cost does
 * not matter, and if it ever stops being small the fix is to cache the number,
 * not to fork the rule.
 */
create or replace function public.feature_flag_reach(p_key text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.profiles p
  where public.is_feature_enabled(p_key, p.id);
$$;

/**
 * A flag's targets with the names they point at.
 *
 * The join belongs here rather than in four separate client queries: the page
 * needs "IQI Indonesia", not a uuid, and a target whose subject was deleted
 * should read as missing rather than crash the screen.
 */
create or replace function public.feature_flag_target_list(p_key text)
returns table (
  id uuid,
  target_type text,
  subject_id text,
  subject_label text
)
language sql stable security definer set search_path = public as $$
  select
    t.id,
    t.target_type,
    coalesce(t.user_id::text, t.agency_id::text, t.country_code, t.campaign_id::text),
    coalesce(
      case t.target_type
        when 'user'     then (select display_name from public.profiles where id = t.user_id)
        when 'agency'   then (select name from public.agencies where id = t.agency_id)
        when 'country'  then (select name from public.countries where code = t.country_code)
        when 'campaign' then (select name from public.growth_campaigns where id = t.campaign_id)
      end,
      '—'
    )
  from public.feature_flag_targets t
  where t.flag_key = p_key
  order by t.target_type, 4;
$$;

revoke all on function public.feature_flag_reach(text) from anon;
revoke all on function public.feature_flag_target_list(text) from anon;
grant execute on function public.feature_flag_reach(text) to authenticated;
grant execute on function public.feature_flag_target_list(text) to authenticated;
