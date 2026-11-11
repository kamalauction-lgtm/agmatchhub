-- =============================================================================
-- 00127 — Source Mapping and Sync: the source registry (screen 8, P2-a)
--
-- Approved plan (P0-a → P2-b, 10 Nov 2026): "A/sources: a source registry and
-- per-source mapping. Re-sync of approved feeds produces proposed edits, never
-- overwrites." and "A portal whose terms forbid reuse is marked 'agent-supplied
-- only' in the source registry."
--
-- Built now: the registry, each source's TERMS STATUS (unreviewed until legal
-- reviews it), and its field mapping. Not built: re-sync — it needs access to
-- each external source and the legal review of its terms (decision D-7).
--
--   · listing_sources: one row per source (a portal domain, a partner feed or
--     the agent's own file). Readable by admins.
--   · Registering a source and editing its mapping: platform.configure with a
--     GLOBAL grant (sources are platform-wide).
--   · Changing terms_status (unreviewed / allowed / agent_supplied_only /
--     forbidden) is a legal call: legal.publish (global), stamped with who and
--     when, by a BEFORE trigger that reads NEW/OLD only (hard rule 4).
--   · Audited from the Hub.
--
-- Rollback: drop the trigger, function and table.
-- =============================================================================

create table if not exists public.listing_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9][a-z0-9.\-_]{1,80}$'),
  display_name text not null check (length(display_name) between 2 and 120),
  kind text not null check (kind in ('portal', 'partner_feed', 'agent_file', 'other')),
  country_code text,
  terms_status text not null default 'unreviewed' check (terms_status in ('unreviewed', 'allowed', 'agent_supplied_only', 'forbidden')),
  terms_note text check (terms_note is null or length(terms_note) <= 1000),
  terms_reviewed_by uuid references auth.users(id),
  terms_reviewed_at timestamptz,
  field_mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(field_mapping) = 'object'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listing_sources enable row level security;

drop policy if exists "sources admin read" on public.listing_sources;
create policy "sources admin read" on public.listing_sources
  for select to authenticated using (public.is_platform_admin());
drop policy if exists "sources configure insert" on public.listing_sources;
create policy "sources configure insert" on public.listing_sources
  for insert to authenticated with check (public.has_global_capability('platform.configure') or public.has_global_capability('legal.publish'));
drop policy if exists "sources configure update" on public.listing_sources;
create policy "sources configure update" on public.listing_sources
  for update to authenticated
  using (public.has_global_capability('platform.configure') or public.has_global_capability('legal.publish'))
  with check (public.has_global_capability('platform.configure') or public.has_global_capability('legal.publish'));
-- No delete: a source that was used stays on record.

create or replace function public.guard_listing_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.terms_status <> 'unreviewed' and not public.has_global_capability('legal.publish') then
      raise exception 'terms_review_requires_legal' using errcode = '42501';
    end if;
  elsif new.terms_status is distinct from old.terms_status or new.terms_note is distinct from old.terms_note then
    if not public.has_global_capability('legal.publish') then
      raise exception 'terms_review_requires_legal' using errcode = '42501';
    end if;
  end if;
  -- Mapping and naming are configuration, not a legal call.
  if (tg_op = 'INSERT' or new.field_mapping is distinct from old.field_mapping or new.display_name is distinct from old.display_name or new.kind is distinct from old.kind)
     and not public.has_global_capability('platform.configure') then
    raise exception 'source_config_requires_platform_configure' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.terms_status is distinct from old.terms_status then
    new.terms_reviewed_by := case when new.terms_status = 'unreviewed' then null else auth.uid() end;
    new.terms_reviewed_at := case when new.terms_status = 'unreviewed' then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listing_sources_guard on public.listing_sources;
create trigger trg_listing_sources_guard
  before insert or update on public.listing_sources
  for each row execute function public.guard_listing_source();
