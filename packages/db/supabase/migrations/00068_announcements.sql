-- =============================================================================
-- 00068 — Announcements
--
-- §44: in-app broadcast, targeted at everyone, one company, a country, a plan,
-- a campaign, or agents who have gone quiet. Architecture ready for WhatsApp
-- and email later; SMS never (platform rule 11).
--
-- DELIVERY IS COMPUTED, NOT COPIED
--   The obvious design is to fan out one row per recipient at send time. That
--   is wrong here for two reasons: an announcement aimed at "all verified
--   agents" would need re-fanning every time somebody is verified, and a
--   10,000-agent broadcast would write 10,000 rows to say one sentence.
--
--   Instead the audience is a RULE, evaluated when an agent asks what is
--   waiting for them. The only per-recipient rows are the ones that record a
--   person actually reading it — which is data that genuinely differs per
--   person, and only exists for people who showed up.
-- =============================================================================

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,

  -- Where it shows and how loudly. `critical` is for outages and deadlines;
  -- overusing it is how people stop reading them, so the wording in the admin
  -- says as much.
  severity text not null default 'info' check (severity in ('info', 'important', 'critical')),

  audience text not null default 'all' check (audience in
    ('all', 'verified', 'unverified', 'agency', 'country', 'plan', 'campaign', 'inactive')),
  agency_id uuid references public.agencies(id) on delete cascade,
  country_code text references public.countries(code),
  plan_key text,
  campaign_id uuid references public.growth_campaigns(id) on delete cascade,
  -- For audience = 'inactive': no published listing in this many days.
  inactive_days int,

  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_published boolean not null default false,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_announcements_updated before update on public.announcements
  for each row execute function public.set_updated_at();

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

/**
 * Does this announcement apply to this person?
 *
 * Kept as its own function so the agent-facing feed and the admin's "who will
 * see this" preview cannot disagree — a preview that counts a different
 * audience from the one delivered is worse than no preview.
 */
create or replace function public.announcement_matches(p_announcement uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with a as (select * from public.announcements where id = p_announcement),
  who as (
    select
      pr.id,
      pr.agent_status,
      ap.agency_id,
      ap.country_code,
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

/** What this agent has not read yet. */
create or replace function public.my_announcements()
returns table (
  id uuid,
  title text,
  body text,
  severity text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.body, a.severity, a.created_at
  from public.announcements a
  where a.is_published
    and a.starts_at <= now()
    and (a.ends_at is null or a.ends_at > now())
    and public.announcement_matches(a.id, auth.uid())
    and not exists (
      select 1 from public.announcement_reads r
      where r.announcement_id = a.id and r.user_id = auth.uid()
    )
  order by
    case a.severity when 'critical' then 0 when 'important' then 1 else 2 end,
    a.created_at desc;
$$;

/** How many people an announcement would reach — the admin's preview. */
create or replace function public.announcement_audience_count(p_announcement uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.profiles p
  where public.announcement_matches(p_announcement, p.id);
$$;

create or replace function public.mark_announcement_read(p_announcement uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.announcement_reads (announcement_id, user_id)
  values (p_announcement, auth.uid())
  on conflict do nothing;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

-- Agents read published announcements through `my_announcements()`, which is
-- SECURITY DEFINER. The table itself stays admin-only so an unpublished draft
-- cannot be read early.
create policy "announcements admin" on public.announcements
  for all to authenticated
  using (public.has_capability('platform.configure'))
  with check (public.has_capability('platform.configure'));

create policy "own reads" on public.announcement_reads
  for all to authenticated
  using (user_id = auth.uid() or public.has_capability('platform.configure'))
  with check (user_id = auth.uid());

revoke all on public.announcements, public.announcement_reads from anon, authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert on public.announcement_reads to authenticated;

revoke all on function public.announcement_matches(uuid, uuid) from anon;
revoke all on function public.my_announcements() from anon;
revoke all on function public.announcement_audience_count(uuid) from anon;
revoke all on function public.mark_announcement_read(uuid) from anon;
grant execute on function public.announcement_matches(uuid, uuid) to authenticated;
grant execute on function public.my_announcements() to authenticated;
grant execute on function public.announcement_audience_count(uuid) to authenticated;
grant execute on function public.mark_announcement_read(uuid) to authenticated;
