-- =============================================================================
-- 00120 — buyers can report a marketplace listing; moderators work the flags (D9)
--
-- Approved backlog D9 (screens 9 and 10): "a public report path through a
-- definer function and a flag queue" in moderation.
--
--   1. listing_reports: one buyer report on one public listing. RLS on.
--      Readable only by admins who see that listing's country; NO client may
--      insert, update or delete rows directly — writes go through the two
--      functions below. The reporter is anonymous: only a salted IP hash is
--      kept, for rate limiting and de-duplication, never shown in the Hub.
--      The listing's agent never sees reports (no policy for them).
--   2. submit_listing_report(slug, reason, details, locale, ip_hash) —
--      SECURITY DEFINER, callable by anon (apps/www writes nothing directly;
--      this is the enqueue, like submit_public_inquiry). Only for a listing
--      that is publicly visible; a closed reason list; details ≤ 1,000
--      characters; at most 5 reports an hour per IP hash, and one open report
--      per listing per IP hash (a repeat returns ok without a new row).
--   3. admin_decide_report(report, outcome, note) — listing.moderate in the
--      listing's country; 'dismissed' or 'actioned'; audited. Acting on the
--      listing itself (reject, request a change) stays the normal moderation.
--
-- Rollback: drop the two functions and the table.
-- =============================================================================

create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reason_code text not null check (reason_code in (
    'wrong_info', 'already_sold', 'duplicate', 'wrong_photos', 'scam_or_fraud', 'offensive', 'other')),
  details text check (details is null or length(details) <= 1000),
  locale text not null default 'id' check (locale in ('id', 'en', 'ms')),
  ip_hash text,
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_listing_reports_open on public.listing_reports (listing_id) where status = 'open';
create index if not exists idx_listing_reports_ip on public.listing_reports (ip_hash, created_at);

alter table public.listing_reports enable row level security;

drop policy if exists "listing reports admin read" on public.listing_reports;
create policy "listing reports admin read" on public.listing_reports
  for select to authenticated using (public.admin_sees_listing(listing_id));

revoke insert, update, delete on public.listing_reports from anon, authenticated;

comment on table public.listing_reports is
  'D9: anonymous buyer reports on public listings. Written only by submit_listing_report (anon) and admin_decide_report (listing.moderate). ip_hash is salted by apps/www and never displayed.';

-- -----------------------------------------------------------------------------

create or replace function public.submit_listing_report(
  p_listing_slug text,
  p_reason text,
  p_details text,
  p_locale text,
  p_ip_hash text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_listing uuid;
  v_details text := nullif(trim(coalesce(p_details, '')), '');
  v_locale text := case when p_locale in ('id', 'en', 'ms') then p_locale else 'id' end;
  v_hash text := nullif(trim(coalesce(p_ip_hash, '')), '');
  v_recent int;
begin
  if p_reason is null or p_reason not in ('wrong_info', 'already_sold', 'duplicate', 'wrong_photos', 'scam_or_fraud', 'offensive', 'other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;
  if v_details is not null and length(v_details) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'details_too_long');
  end if;
  if p_reason = 'other' and v_details is null then
    return jsonb_build_object('ok', false, 'error', 'details_required');
  end if;

  -- Rate limit before anything else is read, inside the definer boundary.
  if v_hash is not null then
    select count(*) into v_recent from public.listing_reports
     where ip_hash = v_hash and created_at > now() - interval '1 hour';
    if v_recent >= 5 then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
  end if;

  select l.id into v_listing
    from public.listings l join public.properties p on p.id = l.property_id
   where l.slug = p_listing_slug
     and l.status = 'published' and l.moderation_state = 'approved'
     and l.archived_at is null and p.archived_at is null
     and (l.expires_at is null or l.expires_at > now());
  if v_listing is null then
    return jsonb_build_object('ok', false, 'error', 'listing_not_found');
  end if;

  if v_hash is not null and exists (
    select 1 from public.listing_reports r
     where r.listing_id = v_listing and r.ip_hash = v_hash and r.status = 'open') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  insert into public.listing_reports (listing_id, reason_code, details, locale, ip_hash)
  values (v_listing, p_reason, v_details, v_locale, v_hash);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_listing_report(text, text, text, text, text) from public;
grant execute on function public.submit_listing_report(text, text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------

create or replace function public.admin_decide_report(p_report uuid, p_outcome text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_report record;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select r.id, r.listing_id, r.status, r.reason_code into v_report from public.listing_reports r where r.id = p_report;
  if v_report.id is null or not public.has_capability_in('listing.moderate', public.listing_country(v_report.listing_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_outcome not in ('dismissed', 'actioned') then
    return jsonb_build_object('ok', false, 'error', 'invalid_outcome');
  end if;
  if v_report.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if v_note is not null and length(v_note) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long');
  end if;
  update public.listing_reports
     set status = p_outcome, decided_by = auth.uid(), decided_at = now(), decision_note = v_note
   where id = p_report;
  perform public.log_audit('listing.report_decided', 'listing', v_report.listing_id::text,
    jsonb_build_object('report', p_report, 'status', 'open'),
    jsonb_build_object('report', p_report, 'status', p_outcome, 'reason_code', v_report.reason_code), v_note);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_decide_report(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_report(uuid, text, text) to authenticated;
