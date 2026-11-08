-- 00089 · Hero benefits: an immediate revoke (unlink, promotion off) marks the
-- grant revoked rather than only clamping effective_until to now(). The clamp
-- alone leaves a window the size of the clock skew between the database and
-- whoever reads "still live" with their own now() (seen in the suite: 7 grants
-- read as live right after hero_unlink). A grace revoke keeps the clamp only,
-- so the benefit runs out on the day and the row shows why.

create or replace function public.revoke_hero_benefits(p_user uuid, p_reason text, p_grace boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare n int; g int;
begin
  if not public.hero_may_act_for(p_user) then raise exception 'not allowed' using errcode = '42501'; end if;
  select grace_days into g from public.hero_benefits limit 1;
  if p_grace then
    update public.entitlement_grants
       set effective_until = least(effective_until, now() + make_interval(days => coalesce(g, 7))),
           revoke_reason = coalesce(revoke_reason, p_reason)
     where user_id = p_user and source = 'hero_benefit' and revoked_at is null and effective_until > now();
  else
    update public.entitlement_grants
       set revoked_at = now(), effective_until = least(effective_until, now()),
           revoke_reason = coalesce(revoke_reason, p_reason)
     where user_id = p_user and source = 'hero_benefit' and revoked_at is null;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
