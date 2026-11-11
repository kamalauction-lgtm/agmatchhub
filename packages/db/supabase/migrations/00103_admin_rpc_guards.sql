-- =============================================================================
-- 00103 — Admin reporting RPCs answer only admins; dashboard queues count
--         real statuses; audit rows carry the actor's role
--
-- WHY
--   00065, 00067 and 00070–00072 created twelve SECURITY DEFINER reporting
--   functions, granted them to `authenticated`, and relied on the /admin route
--   to keep everyone else out ("the route is the gate"). The route is not a
--   gate for PostgREST: any signed-in agent could call
--   rpc('admin_search', {p_query: '...'}) directly and read other agents'
--   emails, or search by phone number. The fix belongs in the database.
--
--   The same queue function also counted statuses that cannot exist, so three
--   of its numbers were permanently zero:
--     · agents_awaiting      counted agent_status = 'submitted' — not a value
--                            the 00001 CHECK allows; submission sets
--                            'under_review' (G/verification/actions.ts)
--     · requests_to_approve  counted 'pending_approval' — the real value is
--                            'pending_admin_approval' (00005)
--     · open_reports         counted 'open'/'reviewing' — 00016 uses
--                            'submitted'/'under_review'/…
--   and listings_in_review counted moderation_state = 'pending', which also
--   matches every unsubmitted draft (an import commit writes drafts as
--   pending). The moderation queue the number links to shows
--   status = 'pending_review', so that is what is counted now.
--   admin_system_health had the same 'submitted' and 'open' literals.
--
-- HOW THE GUARD IS ADDED
--   Each function is renamed to <name>_unguarded, execute on it is revoked
--   from every client role, and a thin wrapper with the ORIGINAL name and
--   signature is created that checks the caller and then returns the
--   unguarded result. The bodies are not copied, so they cannot drift from
--   the originals. The loop asserts it found all twelve: a missing one fails
--   the migration rather than leaving a hole quietly.
--
--   Allowed callers: any platform admin role (the same test the /admin layout
--   applies), and the service role (the reporting tests and operator scripts
--   call these with the service key).
--
--   !! A later `create or replace function public.admin_<x>` would replace
--   !! the WRAPPER with an unguarded body. Change <x>_unguarded instead.
--
-- AUDIT
--   log_audit (00001) never filled actor_role. It is executable by every
--   signed-in user — it has to be, lib/audit.ts calls it from the user's
--   session — so an agent can write an audit row. They could not write one
--   under someone else's id (actor_id is auth.uid()), and now they cannot
--   make it look like an admin's either: actor_role is computed here from
--   user_roles, never passed in. Signature unchanged; no caller changes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Correct the queue and health literals (full bodies; the guard comes after)
-- -----------------------------------------------------------------------------

create or replace function public.admin_action_queues()
returns table (
  listings_in_review int,
  agents_awaiting int,
  requests_to_approve int,
  open_reports int,
  failed_imports int,
  rewards_to_review int,
  expiring_policies int
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from public.listings where status = 'pending_review'),
    (select count(*)::int from public.profiles where agent_status = 'under_review'),
    (select count(*)::int from public.property_requests
      where status in ('pending_admin_approval', 'resubmitted', 'under_admin_review')),
    (select count(*)::int from public.violation_reports
      where status not in ('resolved', 'rejected', 'archived')),
    (select count(*)::int from public.import_batches where status = 'failed'),
    (select count(*)::int from public.referral_rewards where status = 'QUALIFIED'),
    (select count(*)::int from public.commercial_policies
      where is_active and effective_until is not null
        and effective_until between now() and now() + interval '30 days');
$$;

create or replace function public.admin_system_health()
returns table (
  check_key text,
  status text,
  detail_count int
)
language sql stable security definer set search_path = public as $$
  select 'importer',
    case when c = 0 then 'ok' when c < 5 then 'warn' else 'down' end,
    c
  from (select count(*)::int as c from public.import_batches
        where status = 'failed' and created_at > now() - interval '1 day') x
  union all
  -- Age of the oldest listing waiting in the moderation queue. updated_at,
  -- because an edited published listing re-enters the queue long after it
  -- was created.
  select 'moderation',
    case when h is null then 'ok' when h < 24 then 'ok' when h < 72 then 'warn' else 'down' end,
    coalesce(h, 0)
  from (select extract(epoch from (now() - min(updated_at)))::int / 3600 as h
        from public.listings where status = 'pending_review') x
  union all
  -- Age of the oldest agent waiting for a verification decision, from when
  -- they submitted (not when they signed up).
  select 'verification',
    case when h is null then 'ok' when h < 48 then 'ok' when h < 120 then 'warn' else 'down' end,
    coalesce(h, 0)
  from (select extract(epoch from (now() - min(coalesce(ap.submitted_at, p.created_at))))::int / 3600 as h
        from public.profiles p
        left join public.agent_profiles ap on ap.user_id = p.id
        where p.agent_status = 'under_review') x
  union all
  select 'media',
    case when c = 0 then 'ok' when c < 10 then 'warn' else 'down' end,
    c
  from (select count(*)::int as c from public.listings l
        where l.status = 'published'
          and not exists (select 1 from public.listing_media m where m.listing_id = l.id)) x
  union all
  select 'trust',
    case when h is null then 'ok' when h < 48 then 'ok' when h < 168 then 'warn' else 'down' end,
    coalesce(h, 0)
  from (select extract(epoch from (now() - min(created_at)))::int / 3600 as h
        from public.violation_reports
        where status not in ('resolved', 'rejected', 'archived')) x
  union all
  select 'rewards',
    case when c = 0 then 'ok' when c < 10 then 'warn' else 'down' end,
    c
  from (select count(*)::int as c from public.referral_rewards where status = 'QUALIFIED') x;
$$;

-- -----------------------------------------------------------------------------
-- 2. The check every wrapper runs first
-- -----------------------------------------------------------------------------

create or replace function public.assert_admin_reporting_access()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if not public.is_platform_admin() then
    raise exception 'admin reporting is restricted to platform admins'
      using errcode = '42501';
  end if;
end;
$$;

-- Only the wrappers (running as owner) call it.
revoke all on function public.assert_admin_reporting_access() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Rename each reporting function and put a guarded wrapper in its place
-- -----------------------------------------------------------------------------

do $guard$
declare
  v_names constant text[] := array[
    'admin_growth_metrics', 'admin_action_queues', 'admin_referral_signals',
    'admin_top_referrers', 'admin_search', 'admin_metric_series',
    'admin_period_comparison', 'admin_funnel', 'admin_breakdown',
    'admin_top_agents', 'admin_commercial_snapshot', 'admin_system_health'
  ];
  r record;
  v_found int := 0;
  v_args text;
  v_idargs text;
  v_result text;
  v_params text;
  v_body text;
begin
  for r in
    select p.oid, p.proname, p.pronargs, p.proretset
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = any (v_names)
  loop
    v_found := v_found + 1;
    v_args   := pg_get_function_arguments(r.oid);           -- with defaults
    v_idargs := pg_get_function_identity_arguments(r.oid);  -- types only
    v_result := pg_get_function_result(r.oid);
    v_params := coalesce(
      (select string_agg('$' || i, ', ' order by i) from generate_series(1, r.pronargs) i),
      '');

    execute format('alter function public.%I(%s) rename to %I',
                   r.proname, v_idargs, r.proname || '_unguarded');
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated',
                   r.proname || '_unguarded', v_idargs);

    if r.proretset then
      v_body := format(
        'begin perform public.assert_admin_reporting_access(); '
        'return query select * from public.%I(%s); end',
        r.proname || '_unguarded', v_params);
    else
      v_body := format(
        'begin perform public.assert_admin_reporting_access(); '
        'return public.%I(%s); end',
        r.proname || '_unguarded', v_params);
    end if;

    execute format(
      'create function public.%I(%s) returns %s '
      'language plpgsql stable security definer set search_path = public as %L',
      r.proname, v_args, v_result, v_body);

    execute format('comment on function public.%I(%s) is %L',
      r.proname, v_idargs,
      'Guarded wrapper (00103). Platform admins and service role only. '
      'Change ' || r.proname || '_unguarded, never this function.');

    execute format('revoke all on function public.%I(%s) from public, anon',
                   r.proname, v_idargs);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role',
                   r.proname, v_idargs);
  end loop;

  if v_found <> array_length(v_names, 1) then
    raise exception '00103: expected % admin reporting functions, found %',
      array_length(v_names, 1), v_found;
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 4. log_audit stamps the actor's role itself
-- -----------------------------------------------------------------------------

create or replace function public.log_audit(
  p_action text, p_entity_type text, p_entity_id text default null,
  p_previous jsonb default null, p_new jsonb default null,
  p_reason text default null, p_result text default 'success'
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  -- Highest-privilege role the actor holds; never taken from the caller.
  select r.key into v_role
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
  order by array_position(
    array['super_admin', 'admin', 'compliance_admin', 'country_admin', 'agent'], r.key)
    nulls last
  limit 1;

  if v_role is null then
    v_role := case
      when auth.uid() is not null then 'user'
      when coalesce(auth.role(), '') = 'service_role' then 'service_role'
      else 'system'
    end;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id,
    previous_values, new_values, reason, result)
  values (auth.uid(), v_role, p_action, p_entity_type, p_entity_id,
    p_previous, p_new, p_reason, p_result);
end $$;
