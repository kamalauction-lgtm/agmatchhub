-- =============================================================================
-- 00081 — AI Manager (Stage B, E2 · 7 Nov 2026)
--
-- The first live role. The rules-only Brief Harian (lib/dashboard/brief.ts)
-- stays exactly as it is; the AI Manager writes a short paragraph OVER it,
-- once per agent per day, cached in ai_briefs, regenerated when the counts
-- change or the agent asks. Quota exhausted → the cached row says 'rules' and
-- the dashboard shows the list it always showed.
--
-- Three functions, all SECURITY DEFINER with the same self-or-admin-or-service
-- guard as the ledger: write the cache, clear it, and name who should get a
-- brief from the morning cron.
-- =============================================================================

create or replace function public.ai_upsert_brief(
  p_user uuid, p_date date, p_locale text, p_source text, p_paragraph text,
  p_actions jsonb, p_counts_hash text, p_model text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ai_may_act_for(p_user) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.ai_briefs (user_id, brief_date, locale, source, paragraph, actions, counts_hash, model)
  values (p_user, p_date, p_locale, p_source, p_paragraph, coalesce(p_actions, '[]'::jsonb), p_counts_hash, p_model)
  on conflict (user_id, brief_date) do update
    set locale = excluded.locale, source = excluded.source, paragraph = excluded.paragraph,
        actions = excluded.actions, counts_hash = excluded.counts_hash, model = excluded.model,
        created_at = now();
end $$;
revoke execute on function public.ai_upsert_brief(uuid, date, text, text, text, jsonb, text, text) from public, anon;

create or replace function public.ai_clear_brief(p_user uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ai_may_act_for(p_user) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.ai_briefs where user_id = p_user and brief_date = p_date;
end $$;
revoke execute on function public.ai_clear_brief(uuid, date) from public, anon;

/**
 * Who gets a brief written for them by the morning cron: verified agents who
 * signed in recently and have the AI feature on. Recency is the cost control
 * — a brief nobody reads is the easiest money to waste. Service/admin only.
 */
create or replace function public.ai_brief_audience(p_days integer default 14)
returns table (user_id uuid, locale text, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.preferred_language, 'id'), p.display_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where (auth.uid() is null or public.has_capability('ai.manage'))
    and p.agent_status = 'verified'
    and u.last_sign_in_at > now() - greatest(p_days, 1) * interval '1 day'
    and public.is_feature_enabled('ai_features', p.id);
$$;
revoke execute on function public.ai_brief_audience(integer) from public, anon;

-- The role goes live with its capability.
update public.ai_roles set status = 'live', route = '/dashboard', updated_at = now() where key = 'ai_manager';
