-- =============================================================================
-- 00017 — audit_logs.actor_id → profiles(id) so the admin audit viewer can
-- embed actor names (PostgREST embeds need a direct FK; same as 00003).
-- audit_logs had no FK on actor_id previously; add one, keeping nulls allowed.
-- =============================================================================

-- Remove any orphan actor ids first (defensive; should be none)
update public.audit_logs a
   set actor_id = null
 where actor_id is not null
   and not exists (select 1 from public.profiles p where p.id = a.actor_id);

alter table public.audit_logs
  add constraint audit_logs_actor_fk
  foreign key (actor_id) references public.profiles(id) on delete set null;
