-- =============================================================================
-- 00123 — the audit trail can no longer be written by clients (screen 13)
--
-- Found on staging, 11 Nov 2026: public.log_audit was executable by PUBLIC,
-- including anon. The anon key is public (it ships in the marketplace
-- bundle), so anyone could insert audit rows: actor NULL, role 'system',
-- any action and entity they liked. Signed-in users could also write rows
-- with arbitrary actions under their own identity. The plan's "revoking
-- log_audit" item closes this.
--
--   1. log_audit: EXECUTE revoked from PUBLIC, anon and authenticated. It is
--      still called from inside SECURITY DEFINER functions (they run as the
--      owner) and by the migration and operator scripts (database sessions).
--   2. log_audit_as(actor, …): the same insert with an explicit actor, for
--      the Hub's server code only (service_role). The Hub verifies the
--      session user first and passes that id; the actor's role is still
--      looked up here, never taken from the caller.
--
--   3. audit.view (global grants only) gates reading audit_logs; see below.
--
-- Requires 00122 (has_global_capability).
--
-- Rollback: grant execute on log_audit back to authenticated; drop
-- log_audit_as (and redeploy a Hub that calls log_audit with the session).
-- =============================================================================

create or replace function public.log_audit_as(
  p_actor uuid,
  p_action text, p_entity_type text, p_entity_id text default null,
  p_previous jsonb default null, p_new jsonb default null,
  p_reason text default null, p_result text default 'success'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if p_action is null or length(p_action) > 120 or p_entity_type is null or length(p_entity_type) > 80 then
    raise exception 'invalid audit entry' using errcode = '22023';
  end if;
  if p_actor is not null then
    select r.key into v_role
      from public.user_roles ur join public.roles r on r.id = ur.role_id
     where ur.user_id = p_actor
     order by array_position(array['super_admin', 'admin', 'compliance_admin', 'country_admin', 'agent'], r.key) nulls last
     limit 1;
    v_role := coalesce(v_role, 'user');
  else
    v_role := 'system';
  end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id,
    previous_values, new_values, reason, result)
  values (p_actor, v_role, p_action, p_entity_type, p_entity_id, p_previous, p_new, p_reason, p_result);
end;
$$;

revoke all on function public.log_audit_as(uuid, text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.log_audit_as(uuid, text, text, text, jsonb, jsonb, text, text) to service_role;

revoke execute on function public.log_audit(text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.log_audit(text, text, text, jsonb, jsonb, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Reading the audit trail is its own, global capability: audit.view.
--    Until now any platform admin could read every row (is_platform_admin()),
--    so a Malaysia-only country admin could read Indonesia's audit trail.
--    Audit rows carry no country, so the grant must be global; it goes to the
--    three global roles (super_admin, admin, compliance_admin).
-- -----------------------------------------------------------------------------

insert into public.capabilities (key, description)
values ('audit.view', 'Read and export the audit trail (global grants only)')
on conflict (key) do nothing;

insert into public.role_capabilities (role_id, capability_key)
select r.id, 'audit.view' from public.roles r where r.key in ('super_admin', 'admin', 'compliance_admin')
on conflict do nothing;

drop policy if exists "audit read admin" on public.audit_logs;
create policy "audit read admin" on public.audit_logs
  for select to authenticated using (public.has_global_capability('audit.view'));
