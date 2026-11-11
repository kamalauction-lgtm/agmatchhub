-- =============================================================================
-- 00115 — change requests between moderation and the agent (P1-b, screen 14)
--
-- The approved plan's `listing_change_requests`: a moderator asks the
-- listing's agent for a correction, or for an original photo, instead of
-- rejecting outright; the agent answers; the moderator resolves or
-- withdraws. Every step is a row change through a SECURITY DEFINER function
-- that checks who may take it — there are NO insert/update policies, so no
-- client can write a request or change its status directly, and no policy
-- subqueries its own table (hard rule 4).
--
--   admin_request_change(listing, kind, field, body)   moderator, listing.moderate
--                                                      for the listing's country
--   agent_answer_change(request, answer)                the listing's agent
--   admin_close_change(request, outcome)                moderator, same scope:
--                                                      'resolved' or 'withdrawn'
--
-- Read: the listing's agent, and admins who see the listing (00105 scope).
-- Actor columns point at auth.users (hard rule 6). Every step is audited.
--
-- Rollback: drop the functions and the table.
-- =============================================================================

create table if not exists public.listing_change_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  kind text not null check (kind in ('correction', 'photo_original')),
  field text check (field is null or field in ('title', 'description', 'price', 'location', 'property_details', 'photos', 'other')),
  body text not null check (length(trim(body)) between 3 and 2000),
  status text not null default 'open' check (status in ('open', 'answered', 'resolved', 'withdrawn')),
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  answer text check (answer is null or length(answer) <= 2000),
  answered_by uuid references auth.users(id),
  answered_at timestamptz,
  closed_by uuid references auth.users(id),
  closed_at timestamptz
);
create index if not exists idx_listing_change_requests_listing on public.listing_change_requests (listing_id, status);
create index if not exists idx_listing_change_requests_open on public.listing_change_requests (status, opened_at) where status in ('open', 'answered');

alter table public.listing_change_requests enable row level security;

drop policy if exists "change requests read owner or scoped admin" on public.listing_change_requests;
create policy "change requests read owner or scoped admin" on public.listing_change_requests
  for select to authenticated
  using (public.owns_listing(listing_id) or public.admin_sees_listing(listing_id));

revoke insert, update, delete on public.listing_change_requests from anon, authenticated;
grant select on public.listing_change_requests to authenticated;

create or replace function public.listing_country(p_listing uuid)
returns text
language sql stable security definer set search_path = public as $$
  select p.country_code from public.listings l join public.properties p on p.id = l.property_id where l.id = p_listing;
$$;
revoke all on function public.listing_country(uuid) from public, anon;
grant execute on function public.listing_country(uuid) to authenticated;

create or replace function public.admin_request_change(p_listing uuid, p_kind text, p_field text, p_body text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_country text := public.listing_country(p_listing);
  v_status text;
  v_agent uuid;
  v_id uuid;
begin
  if v_country is null or not public.has_capability_in('listing.moderate', v_country) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select status, agent_id into v_status, v_agent from public.listings where id = p_listing;
  if v_status not in ('pending_review', 'published', 'rejected', 'draft') then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;
  if p_kind not in ('correction', 'photo_original') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if coalesce(length(trim(p_body)), 0) < 3 or length(p_body) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'body_required');
  end if;
  insert into public.listing_change_requests (listing_id, kind, field, body, opened_by)
  values (p_listing, p_kind, nullif(p_field, ''), trim(p_body), auth.uid())
  returning id into v_id;
  perform public.log_audit('listing.change_requested', 'listing', p_listing::text, null,
    jsonb_build_object('request', v_id, 'kind', p_kind, 'field', nullif(p_field, '')));
  return jsonb_build_object('ok', true, 'id', v_id, 'agent', v_agent);
end;
$$;

create or replace function public.agent_answer_change(p_request uuid, p_answer text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_req record;
begin
  select id, listing_id, status, opened_by into v_req from public.listing_change_requests where id = p_request;
  if v_req.id is null or not public.owns_listing(v_req.listing_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.status not in ('open', 'answered') then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if coalesce(length(trim(p_answer)), 0) < 1 or length(p_answer) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'answer_required');
  end if;
  update public.listing_change_requests
     set status = 'answered', answer = trim(p_answer), answered_by = auth.uid(), answered_at = now()
   where id = p_request;
  perform public.log_audit('listing.change_answered', 'listing', v_req.listing_id::text, null,
    jsonb_build_object('request', p_request));
  return jsonb_build_object('ok', true, 'opened_by', v_req.opened_by);
end;
$$;

create or replace function public.admin_close_change(p_request uuid, p_outcome text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_req record;
  v_agent uuid;
begin
  select id, listing_id, status into v_req from public.listing_change_requests where id = p_request;
  if v_req.id is null or not public.has_capability_in('listing.moderate', public.listing_country(v_req.listing_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_outcome not in ('resolved', 'withdrawn') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_req.status not in ('open', 'answered') then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  update public.listing_change_requests
     set status = p_outcome, closed_by = auth.uid(), closed_at = now()
   where id = p_request;
  select agent_id into v_agent from public.listings where id = v_req.listing_id;
  perform public.log_audit('listing.change_' || p_outcome, 'listing', v_req.listing_id::text,
    jsonb_build_object('status', v_req.status), jsonb_build_object('request', p_request, 'status', p_outcome));
  return jsonb_build_object('ok', true, 'agent', v_agent);
end;
$$;

revoke all on function public.admin_request_change(uuid, text, text, text) from public, anon;
revoke all on function public.agent_answer_change(uuid, text) from public, anon;
revoke all on function public.admin_close_change(uuid, text) from public, anon;
grant execute on function public.admin_request_change(uuid, text, text, text) to authenticated;
grant execute on function public.agent_answer_change(uuid, text) to authenticated;
grant execute on function public.admin_close_change(uuid, text) to authenticated;
