-- =============================================================================
-- 00082 — Why there was no paragraph (Stage B, E2 · 7 Nov 2026)
--
-- Found in the first browser check: a cached 'rules' brief carried no reason,
-- so the dashboard footer said "Rules-only brief." instead of "no AI provider
-- is connected yet" on every render after the first. The reason belongs in
-- the cache row, because the cache is exactly what stops the engine being
-- asked again.
-- =============================================================================

alter table public.ai_briefs add column if not exists reason text;

drop function if exists public.ai_upsert_brief(uuid, date, text, text, text, jsonb, text, text);

create or replace function public.ai_upsert_brief(
  p_user uuid, p_date date, p_locale text, p_source text, p_paragraph text,
  p_actions jsonb, p_counts_hash text, p_model text, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ai_may_act_for(p_user) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.ai_briefs (user_id, brief_date, locale, source, paragraph, actions, counts_hash, model, reason)
  values (p_user, p_date, p_locale, p_source, p_paragraph, coalesce(p_actions, '[]'::jsonb), p_counts_hash, p_model, p_reason)
  on conflict (user_id, brief_date) do update
    set locale = excluded.locale, source = excluded.source, paragraph = excluded.paragraph,
        actions = excluded.actions, counts_hash = excluded.counts_hash, model = excluded.model,
        reason = excluded.reason, created_at = now();
end $$;
revoke execute on function public.ai_upsert_brief(uuid, date, text, text, text, jsonb, text, text, text) from public, anon;
