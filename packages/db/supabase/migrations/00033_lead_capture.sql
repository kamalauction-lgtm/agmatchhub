-- =============================================================================
-- 00033 — Lead capture: inquiries → contacts → leads
--
-- Master prompt §11 (buyer journey steps 5–9), §13 (GHL event flow), §28
-- (acceptance journey steps 9–14).
--
-- The privilege model, continuing 00031: anon has NO table grants here. The
-- public marketplace's entire write surface is ONE function,
-- submit_public_inquiry(), SECURITY DEFINER, with validation, rate limiting
-- and consent recording inside the database where the caller cannot skip
-- them. The function is the queue boundary the Stage A architecture requires
-- — the privileged work happens in its body, not in the caller.
--
-- GHL sync is deliberately NOT here. The lead row carries ghl_sync_pending
-- (the proven writeback pattern from the superapp worker); a privileged
-- consumer drains it asynchronously. An inquiry must never fail because GHL
-- is down.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- contacts — one row per person, deduplicated by normalised phone
-- -----------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,            -- CON-2026-000001

  full_name text not null,
  -- E.164, so +62812... Uniqueness is per person, not per inquiry: a repeat
  -- inquirer updates their contact row rather than duplicating it.
  phone text not null unique,
  email text,
  preferred_language text not null default 'id' references public.languages(code),

  source text not null default 'marketplace_inquiry',
  marketing_consent boolean not null default false,

  ghl_contact_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_contacts_updated before update on public.contacts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- leads — one row per inquiry that reached an agent
-- -----------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  human_readable_id text not null unique,            -- LEAD-2026-000001

  contact_id uuid not null references public.contacts(id),
  listing_id uuid not null references public.listings(id),
  -- The single profiles FK (embed rule from 00028); audit columns go to
  -- auth.users.
  agent_id uuid not null references public.profiles(id),

  status text not null default 'new' check (status in
    ('new','contact_attempted','contacted','qualified','property_matched',
     'viewing_proposed','viewing_confirmed','viewed','negotiating','booking',
     'financing','closed_won','closed_lost','nurture','spam')),

  message text,
  inquiry_type text not null default 'general' check (inquiry_type in
    ('general','viewing_request','price_question','availability','financing')),
  source text not null default 'marketplace',
  locale text not null default 'id',

  consent_record_id uuid references public.consent_records(id),

  -- Response SLA (§13 step 9). first_response_due drives the "unanswered
  -- leads" dashboard; first_responded_at freezes the outcome.
  first_response_due timestamptz,
  first_responded_at timestamptz,

  -- Async GHL writeback, superapp pattern. A privileged consumer drains rows
  -- where ghl_sync_pending and records ids/attempts here.
  ghl_sync_pending boolean not null default true,
  ghl_opportunity_id text,
  ghl_last_error text,
  ghl_attempts int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_leads_agent on public.leads (agent_id, status, created_at desc);
create index idx_leads_listing on public.leads (listing_id);
create index idx_leads_contact on public.leads (contact_id);
create index idx_leads_ghl_pending on public.leads (created_at)
  where ghl_sync_pending;
create index idx_leads_unanswered on public.leads (first_response_due)
  where first_responded_at is null;

create trigger trg_leads_updated before update on public.leads
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- lead_events — append-only trail of everything that happened to a lead
-- -----------------------------------------------------------------------------
create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id),           -- null = system/public
  created_at timestamptz not null default now()
);

create index idx_lead_events on public.lead_events (lead_id, created_at);

-- -----------------------------------------------------------------------------
-- inquiry_rate_limits — sliding-window counters for the public function.
-- Service-role only; pruned opportunistically on insert.
-- -----------------------------------------------------------------------------
create table public.inquiry_rate_limits (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,                              -- 'phone:<e164>' | 'ip:<hash>'
  created_at timestamptz not null default now()
);

create index idx_inquiry_rate on public.inquiry_rate_limits (bucket, created_at);

-- -----------------------------------------------------------------------------
-- Buyer-inquiry declaration (§11 step 6): privacy + communication consent,
-- versioned exactly like the three agent declarations from 00004.
-- -----------------------------------------------------------------------------
insert into public.declarations (key, name) values
  ('buyer_inquiry', 'Buyer inquiry privacy and contact consent');

insert into public.declaration_versions (declaration_id, version_number, locale, body, active)
select d.id, 1, v.locale, v.body, true
from public.declarations d,
(values
  ('id', 'Saya setuju data saya (nama, nomor telepon, email) diteruskan kepada agen yang menangani properti ini agar agen dapat menghubungi saya mengenai pertanyaan saya. Data saya diproses sesuai kebijakan privasi dan tidak dibagikan kepada pihak lain tanpa persetujuan saya.'),
  ('en', 'I agree that my details (name, phone number, email) will be passed to the agent handling this property so the agent can contact me about my inquiry. My data is processed under the privacy policy and is not shared with other parties without my consent.'),
  ('ms', 'Saya bersetuju maklumat saya (nama, nombor telefon, e-mel) diserahkan kepada ejen yang mengendalikan hartanah ini supaya ejen boleh menghubungi saya mengenai pertanyaan saya. Data saya diproses mengikut dasar privasi dan tidak dikongsi dengan pihak lain tanpa persetujuan saya.')
) as v(locale, body)
where d.key = 'buyer_inquiry';

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.inquiry_rate_limits enable row level security;

-- Buyer PII: an agent sees a contact only through a lead assigned to them.
create or replace function public.has_lead_for_contact(p_contact_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.leads l
                 where l.contact_id = p_contact_id and l.agent_id = auth.uid());
$$;

create policy "contacts via own lead" on public.contacts
  for select to authenticated
  using (public.has_lead_for_contact(id) or public.is_platform_admin());

create policy "leads own read" on public.leads
  for select to authenticated
  using (agent_id = auth.uid() or public.is_platform_admin());

-- Agents update workflow fields on their own leads; a trigger (not a policy —
-- recursion rule) keeps assignment, sync state and identity out of reach.
create policy "leads own update" on public.leads
  for update to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

create policy "leads admin all" on public.leads
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.guard_lead_agent_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_platform_admin() then return new; end if;
  if new.agent_id      is distinct from old.agent_id
     or new.contact_id is distinct from old.contact_id
     or new.listing_id is distinct from old.listing_id
     or new.consent_record_id is distinct from old.consent_record_id
     or new.human_readable_id is distinct from old.human_readable_id
     or new.ghl_sync_pending  is distinct from old.ghl_sync_pending
     or new.ghl_opportunity_id is distinct from old.ghl_opportunity_id
     or new.ghl_attempts is distinct from old.ghl_attempts then
    raise exception 'lead assignment and sync fields are not agent-editable';
  end if;
  -- First response: set once, by responding. Never unset.
  if old.first_responded_at is not null
     and new.first_responded_at is distinct from old.first_responded_at then
    raise exception 'first response time cannot be rewritten';
  end if;
  return new;
end;
$$;

create trigger trg_leads_guard before update on public.leads
  for each row execute function public.guard_lead_agent_fields();

create policy "lead events via own lead" on public.lead_events
  for select to authenticated
  using (exists (select 1 from public.leads l
                 where l.id = lead_id and l.agent_id = auth.uid())
         or public.is_platform_admin());

-- inquiry_rate_limits: no policies at all — service role and definer fns only.

-- No anon grants on any of this, and none of Supabase's defaults survive:
revoke all on public.contacts from anon;
revoke all on public.leads from anon;
revoke all on public.lead_events from anon;
revoke all on public.inquiry_rate_limits from anon;

-- =============================================================================
-- submit_public_inquiry — the marketplace's single write path
-- =============================================================================
create or replace function public.submit_public_inquiry(
  p_listing_slug text,
  p_full_name text,
  p_phone text,                        -- already normalised to E.164 by the app
  p_email text,
  p_message text,
  p_inquiry_type text,
  p_locale text,
  p_consent_version_id uuid,
  p_ip_hash text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_listing record;
  v_contact_id uuid;
  v_lead_id uuid;
  v_lead_hid text;
  v_consent record;
  v_consent_id uuid;
  v_phone text;
  v_name text;
  v_email text;
  v_message text;
  v_locale text;
  v_recent int;
begin
  -- ---- validate ------------------------------------------------------------
  v_name := nullif(trim(p_full_name), '');
  v_phone := nullif(trim(p_phone), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_message := nullif(trim(coalesce(p_message, '')), '');
  v_locale := case when p_locale in ('id','en','ms') then p_locale else 'id' end;

  if v_name is null or length(v_name) < 2 or length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  if v_message is not null and length(v_message) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'message_too_long');
  end if;
  if p_inquiry_type not in ('general','viewing_request','price_question',
                            'availability','financing') then
    return jsonb_build_object('ok', false, 'error', 'invalid_inquiry_type');
  end if;

  -- ---- rate limit (sliding hour) --------------------------------------------
  -- Phone and IP buckets both apply. Counted BEFORE writing, inside the definer
  -- boundary, so the caller cannot skip it.
  select count(*) into v_recent from public.inquiry_rate_limits
   where bucket = 'phone:' || v_phone and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if p_ip_hash is not null and p_ip_hash <> '' then
    select count(*) into v_recent from public.inquiry_rate_limits
     where bucket = 'ip:' || p_ip_hash and created_at > now() - interval '1 hour';
    if v_recent >= 12 then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
  end if;

  -- ---- listing must actually be publicly visible ----------------------------
  select l.id, l.agent_id, l.title into v_listing
  from public.listings l
  join public.properties p on p.id = l.property_id
  where l.slug = p_listing_slug
    and l.status = 'published'
    and l.moderation_state = 'approved'
    and l.archived_at is null
    and p.archived_at is null
    and (l.expires_at is null or l.expires_at > now());
  if v_listing.id is null then
    return jsonb_build_object('ok', false, 'error', 'listing_not_found');
  end if;

  -- ---- consent version must be the active buyer_inquiry text ----------------
  select dv.id, dv.body, dv.locale into v_consent
  from public.declaration_versions dv
  join public.declarations d on d.id = dv.declaration_id
  where dv.id = p_consent_version_id
    and d.key = 'buyer_inquiry'
    and dv.active;
  if v_consent.id is null then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;

  -- ---- record rate-limit hits (also prunes stale rows opportunistically) ----
  delete from public.inquiry_rate_limits where created_at < now() - interval '2 hours';
  insert into public.inquiry_rate_limits (bucket) values ('phone:' || v_phone);
  if p_ip_hash is not null and p_ip_hash <> '' then
    insert into public.inquiry_rate_limits (bucket) values ('ip:' || p_ip_hash);
  end if;

  -- ---- upsert contact --------------------------------------------------------
  insert into public.contacts (human_readable_id, full_name, phone, email,
                               preferred_language, source)
  values (public.next_human_id('CON'), v_name, v_phone, v_email, v_locale,
          'marketplace_inquiry')
  on conflict (phone) do update
    set full_name = excluded.full_name,
        email = coalesce(excluded.email, public.contacts.email),
        preferred_language = excluded.preferred_language,
        updated_at = now()
  returning id into v_contact_id;

  -- ---- consent record (exact accepted text, §31) -----------------------------
  insert into public.consent_records
    (user_id, declaration_id, declaration_version_id, accepted_text, language,
     session_ref, country_code)
  select null, dv.declaration_id, dv.id, v_consent.body, v_consent.locale,
         'contact:' || v_contact_id, 'ID'
  from public.declaration_versions dv where dv.id = v_consent.id
  returning id into v_consent_id;

  -- ---- create the lead, assigned to the listing's agent ----------------------
  v_lead_hid := public.next_human_id('LEAD');
  insert into public.leads
    (human_readable_id, contact_id, listing_id, agent_id, status, message,
     inquiry_type, locale, consent_record_id, first_response_due)
  values
    (v_lead_hid, v_contact_id, v_listing.id, v_listing.agent_id, 'new',
     v_message, p_inquiry_type, v_locale, v_consent_id,
     now() + interval '4 hours')
  returning id into v_lead_id;

  insert into public.lead_events (lead_id, kind, detail)
  values (v_lead_id, 'inquiry.submitted',
          jsonb_build_object('inquiry_type', p_inquiry_type, 'locale', v_locale));

  -- ---- notify the agent (in-app; payload carries no buyer PII, §40) ----------
  insert into public.notifications (user_id, kind, payload, href)
  values (v_listing.agent_id, 'lead.new',
          jsonb_build_object('lead', v_lead_hid, 'listing', v_listing.title),
          '/leads');

  perform public.log_audit('lead.created', 'lead', v_lead_id::text, null,
    jsonb_build_object('listing_id', v_listing.id, 'source', 'marketplace'));

  -- The buyer's receipt: the lead reference and nothing about the agent
  -- beyond what the listing already showed.
  return jsonb_build_object('ok', true, 'lead_ref', v_lead_hid);
end;
$$;

-- Functions are EXECUTE-able by PUBLIC by default — same default-privilege
-- trap as the views in 00032, closed the same way.
revoke execute on function public.submit_public_inquiry(
  text, text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.submit_public_inquiry(
  text, text, text, text, text, text, text, uuid, text) to anon;

-- The active consent text has to be readable by the form that shows it.
-- declaration_versions already grants authenticated read (00004); extend the
-- ACTIVE rows only to anon via a narrow view.
create view public.public_active_declarations with (security_invoker = false) as
select d.key, dv.id as version_id, dv.version_number, dv.locale, dv.body
from public.declaration_versions dv
join public.declarations d on d.id = dv.declaration_id
where dv.active and d.key = 'buyer_inquiry';

revoke all on public.public_active_declarations from anon, authenticated;
grant select on public.public_active_declarations to anon, authenticated;

comment on function public.submit_public_inquiry is
  'The public marketplace''s single write path. Validation, rate limiting, consent capture, contact dedup, lead creation, agent notification and audit — all inside the definer boundary so no caller can skip any of it.';
