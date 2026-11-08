-- =============================================================================
-- 00014 — Collaboration: messaging, offers, viewings, contact release,
-- notifications · spec §24–27, §40
-- =============================================================================

-- Participant check: the two transaction agents (+ admins) of a submission
create or replace function public.is_submission_participant(p_submission_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.property_submissions s
    where s.id = p_submission_id
      and (s.supply_agent_id = auth.uid() or public.owns_request(s.request_id))
  );
$$;

-- ---------------------------------------------------------------------------
-- Messaging (§24): one thread per submission
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.property_submissions(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
create policy "conversations participants" on public.conversations
  for select to authenticated using (public.is_submission_participant(submission_id));
create policy "conversations participant insert" on public.conversations
  for insert to authenticated with check (public.is_submission_participant(submission_id));
create policy "conversations participant update" on public.conversations
  for update to authenticated using (public.is_submission_participant(submission_id));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  kind text not null default 'text' check (kind in ('text','system')),
  body text not null,
  -- §24 contact-detection: Warning mode — delivered but flagged for review
  flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz not null default now()
);
create index idx_messages_conversation on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;
create policy "messages participants read" on public.messages
  for select to authenticated
  using (exists (select 1 from public.conversations c
         where c.id = conversation_id
           and public.is_submission_participant(c.submission_id)));
create policy "messages participant insert" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.conversations c
        where c.id = conversation_id
          and public.is_submission_participant(c.submission_id))
  );
-- no update/delete: message history immutable for normal roles (§24 audit)

-- ---------------------------------------------------------------------------
-- Offers (§27) — created by RA; SA responds; state machine via definer fn
-- ---------------------------------------------------------------------------

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,        -- OFF-2026-000001
  submission_id uuid not null references public.property_submissions(id) on delete cascade,
  offered_by uuid not null references public.profiles(id),
  offer_type text not null check (offer_type in ('purchase','rental')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null references public.currencies(code),
  lease_term_months int,
  conditions text,
  valid_until date,
  status text not null default 'submitted' check (status in
    ('submitted','countered','accepted','rejected','withdrawn','expired')),
  counter_amount numeric(14,2) check (counter_amount is null or counter_amount >= 0),
  counter_terms text,
  responded_by uuid references public.profiles(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_offers_updated before update on public.offers
  for each row execute function public.set_updated_at();
create index idx_offers_submission on public.offers (submission_id, created_at desc);

alter table public.offers enable row level security;
create policy "offers participants read" on public.offers
  for select to authenticated using (public.is_submission_participant(submission_id));
create policy "offers ra insert" on public.offers
  for insert to authenticated
  with check (
    offered_by = auth.uid()
    and exists (select 1 from public.property_submissions s
        where s.id = submission_id and public.owns_request(s.request_id))
  );
-- all status transitions via respond_to_offer()

create or replace function public.respond_to_offer(
  p_offer_id uuid, p_action text,
  p_amount numeric default null, p_terms text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub uuid; v_status text; v_is_sa boolean; v_is_ra boolean;
begin
  select o.submission_id, o.status into v_sub, v_status
  from public.offers o where o.id = p_offer_id;
  if v_sub is null then raise exception 'offer not found'; end if;

  select exists (select 1 from public.property_submissions s
                 where s.id = v_sub and s.supply_agent_id = auth.uid()) into v_is_sa;
  select exists (select 1 from public.property_submissions s
                 where s.id = v_sub and public.owns_request(s.request_id)) into v_is_ra;
  if not (v_is_sa or v_is_ra) then raise exception 'not authorised'; end if;

  if v_is_sa and p_action = 'accept' and v_status = 'submitted' then
    update public.offers set status = 'accepted', responded_by = auth.uid(), responded_at = now()
      where id = p_offer_id;
  elsif v_is_sa and p_action = 'reject' and v_status = 'submitted' then
    update public.offers set status = 'rejected', responded_by = auth.uid(), responded_at = now()
      where id = p_offer_id;
  elsif v_is_sa and p_action = 'counter' and v_status = 'submitted' and p_amount is not null then
    update public.offers set status = 'countered', counter_amount = p_amount,
      counter_terms = p_terms, responded_by = auth.uid(), responded_at = now()
      where id = p_offer_id;
  elsif v_is_ra and p_action = 'withdraw' and v_status in ('submitted','countered') then
    update public.offers set status = 'withdrawn', responded_by = auth.uid(), responded_at = now()
      where id = p_offer_id;
  elsif v_is_ra and p_action = 'accept_counter' and v_status = 'countered' then
    update public.offers set status = 'accepted', responded_by = auth.uid(), responded_at = now()
      where id = p_offer_id;
  elsif v_is_ra and p_action = 'reject_counter' and v_status = 'countered' then
    update public.offers set status = 'rejected', responded_by = auth.uid(), responded_at = now()
      where id = p_offer_id;
  else
    raise exception 'transition not allowed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Viewings (§26)
-- ---------------------------------------------------------------------------

create table public.viewing_appointments (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,        -- VIEW-2026-000001
  submission_id uuid not null references public.property_submissions(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id),
  proposed_date date not null,
  proposed_time text,
  viewing_type text not null default 'physical' check (viewing_type in ('physical','virtual')),
  meeting_point text,
  notes text,
  status text not null default 'requested' check (status in
    ('requested','confirmed','reschedule_requested','completed','cancelled')),
  responded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_viewings_updated before update on public.viewing_appointments
  for each row execute function public.set_updated_at();
create index idx_viewings_submission on public.viewing_appointments (submission_id, created_at desc);

alter table public.viewing_appointments enable row level security;
create policy "viewings participants read" on public.viewing_appointments
  for select to authenticated using (public.is_submission_participant(submission_id));
create policy "viewings participant insert" on public.viewing_appointments
  for insert to authenticated
  with check (proposed_by = auth.uid() and public.is_submission_participant(submission_id));
create policy "viewings participant update" on public.viewing_appointments
  for update to authenticated
  using (public.is_submission_participant(submission_id))
  with check (public.is_submission_participant(submission_id));

-- ---------------------------------------------------------------------------
-- Contact release (§25): dual-acceptance handshake
-- ---------------------------------------------------------------------------

create table public.contact_release_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.property_submissions(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  accepted_by_ra boolean not null default false,
  accepted_by_sa boolean not null default false,
  status text not null default 'requested' check (status in
    ('requested','approved','rejected','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_contact_release_updated before update on public.contact_release_requests
  for each row execute function public.set_updated_at();

alter table public.contact_release_requests enable row level security;
create policy "contact release participants" on public.contact_release_requests
  for select to authenticated using (public.is_submission_participant(submission_id));

create or replace function public.request_contact_release(p_submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_is_sa boolean; v_is_ra boolean;
begin
  select exists (select 1 from public.property_submissions s
                 where s.id = p_submission_id and s.supply_agent_id = auth.uid()) into v_is_sa;
  select exists (select 1 from public.property_submissions s
                 where s.id = p_submission_id and public.owns_request(s.request_id)) into v_is_ra;
  if not (v_is_sa or v_is_ra) then raise exception 'not authorised'; end if;

  insert into public.contact_release_requests
    (submission_id, requested_by, accepted_by_ra, accepted_by_sa)
  values (p_submission_id, auth.uid(), v_is_ra, v_is_sa)
  on conflict (submission_id) do update
    set accepted_by_ra = public.contact_release_requests.accepted_by_ra or excluded.accepted_by_ra,
        accepted_by_sa = public.contact_release_requests.accepted_by_sa or excluded.accepted_by_sa
    where public.contact_release_requests.status = 'requested';

  update public.contact_release_requests
    set status = 'approved'
    where submission_id = p_submission_id
      and status = 'requested' and accepted_by_ra and accepted_by_sa;
end $$;

-- After approval, each side may read the other's contact details (§25).
-- Client/buyer contact is NOT covered — it lives nowhere the SA can reach.
create policy "users_private contact release read" on public.users_private
  for select to authenticated
  using (exists (
    select 1
    from public.contact_release_requests cr
    join public.property_submissions s on s.id = cr.submission_id
    join public.property_requests r on r.id = s.request_id
    where cr.status = 'approved'
      and ((s.supply_agent_id = users_private.user_id and r.requesting_agent_id = auth.uid())
        or (r.requesting_agent_id = users_private.user_id and s.supply_agent_id = auth.uid()))
  ));

-- ---------------------------------------------------------------------------
-- Notifications (§40): in-app; inserts via service client from server actions
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,    -- no confidential values (§40)
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;
create policy "notifications own read" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications own mark read" on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- inserts via service client only (prevents cross-user spam)
