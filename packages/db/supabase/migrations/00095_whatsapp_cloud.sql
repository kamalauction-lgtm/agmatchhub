-- =============================================================================
-- 00095 — WhatsApp Cloud API scaffold (Stage B, E12 · 8 Nov 2026)
--
-- OWNER DECISION 8 (7 Nov 2026): WhatsApp through Meta's official Cloud API,
-- directly. GoHighLevel is NOT cancelled and no active number is migrated
-- until the replacement passes testing. No unsolicited or paid WhatsApp;
-- outbound WhatsApp needs its own approval. Design: docs/whatsapp-cloud-api-design.md.
--
-- WHAT THIS IS
--   wa_accounts         one row per country number (MY, ID), mode off · test ·
--                       live. 'test' = Meta's developer test number: it can only
--                       reach the recipients listed on the row, and the send
--                       check enforces that list in SQL, not just at Meta.
--   wa_templates        the registry of message templates and their Meta
--                       approval status. Outside the 24-hour customer-service
--                       window only an APPROVED template may be sent.
--   wa_opt_outs         global and permanent (Hero's lesson, Sept 2026): a
--                       number that said STOP is never messaged again by any
--                       path. Keyed by phone, not by contact.
--   wa_messages         every message in or out, with Meta's id (wamid) unique
--                       so a redelivered webhook never records twice.
--   wa_webhook_events   every delivery as received, verified or not; hash of
--                       the raw body unique, admin-read, service-write.
--   contacts.wa_last_inbound_at   the fact the 24-hour window is computed from.
--
-- THE RULES, IN ONE PLACE — wa_send_check(lead, kind, template)
--   feature flag `whatsapp_cloud` on for the agent → account for the lead's
--   country switched on → caller owns the lead → number not opted out →
--   session text only while the window is open → template only when approved
--   for that account → marketing template only with contact consent AND flag
--   `whatsapp_marketing` → in test mode only to the row's test recipients.
--   Returns 'ok' or the reason; nothing is sent on anything but 'ok'.
--
-- WHAT THIS IS NOT
--   No bulk send, no campaign table, no scheduler: one message, one lead, one
--   agent action (Decision 8: no mass campaigns without explicit approval).
--   No token in the database: the Worker holds WHATSAPP_ACCESS_TOKEN,
--   WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Switches (both OFF)
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, name, description, enabled) values
  ('whatsapp_cloud',     'WhatsApp Cloud API',       'Sending and receiving WhatsApp through the platform number. Off until the pilot approves it.', false),
  ('whatsapp_marketing', 'WhatsApp marketing sends', 'Marketing-category templates (paid, consent-gated). Off until separately approved.', false)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 1. Accounts — one number per country
-- -----------------------------------------------------------------------------
create table public.wa_accounts (
  id               uuid primary key default gen_random_uuid(),
  country_code     text not null unique references public.countries(code),
  display_phone    text,                      -- +60 19-… as shown to people; null until a number exists
  phone_number_id  text unique,               -- Meta's id for the number; the send URL uses it
  waba_id          text,                      -- WhatsApp Business Account id
  mode             text not null default 'off' check (mode in ('off', 'test', 'live')),
  -- Meta's test number reaches only verified recipients; listing them here
  -- makes the platform refuse everyone else BEFORE calling Meta.
  test_recipients  text[] not null default '{}',
  quality_rating   text,                      -- GREEN / YELLOW / RED as Meta reports it
  settings         jsonb not null default '{}'::jsonb,
  updated_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger wa_accounts_updated_at before update on public.wa_accounts
  for each row execute function public.set_updated_at();

insert into public.wa_accounts (country_code) select code from public.countries where code in ('MY', 'ID')
on conflict (country_code) do nothing;

alter table public.wa_accounts enable row level security;
create policy "wa accounts readable" on public.wa_accounts for select to authenticated using (true);
create policy "wa accounts managed" on public.wa_accounts for update to authenticated
  using (public.has_capability('platform.configure')) with check (public.has_capability('platform.configure'));
revoke all on public.wa_accounts from anon, authenticated;
grant select, update on public.wa_accounts to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Templates — the registry and Meta's verdict on each
-- -----------------------------------------------------------------------------
create table public.wa_templates (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.wa_accounts(id) on delete cascade,
  name             text not null,             -- Meta template name (snake_case)
  language         text not null,             -- en · ms · id (Meta codes: en, ms, id)
  category         text not null check (category in ('utility', 'marketing', 'authentication')),
  status           text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'paused')),
  body             text not null,             -- with {{1}} … {{n}} placeholders, as submitted to Meta
  variables        integer not null default 0 check (variables between 0 and 10),
  meta_template_id text,
  note             text,
  updated_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (account_id, name, language)
);
create trigger wa_templates_updated_at before update on public.wa_templates
  for each row execute function public.set_updated_at();

alter table public.wa_templates enable row level security;
-- Agents see approved templates (they pick one); admins see all.
create policy "wa templates approved readable" on public.wa_templates for select to authenticated
  using (status = 'approved' or public.has_capability('platform.configure'));
create policy "wa templates managed" on public.wa_templates for all to authenticated
  using (public.has_capability('platform.configure')) with check (public.has_capability('platform.configure'));
revoke all on public.wa_templates from anon, authenticated;
grant select, insert, update, delete on public.wa_templates to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Opt-outs — global, permanent
-- -----------------------------------------------------------------------------
create table public.wa_opt_outs (
  phone       text primary key,               -- E.164
  source      text not null check (source in ('inbound_stop', 'agent', 'admin')),
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.wa_opt_outs enable row level security;
create policy "wa opt outs admin read" on public.wa_opt_outs for select to authenticated
  using (public.has_capability('platform.configure'));
create policy "wa opt outs admin add" on public.wa_opt_outs for insert to authenticated
  with check (public.has_capability('platform.configure'));
-- No update, no delete for anyone through the API: permanent means permanent.
revoke all on public.wa_opt_outs from anon, authenticated;
grant select, insert on public.wa_opt_outs to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Messages
-- -----------------------------------------------------------------------------
alter table public.contacts add column if not exists wa_last_inbound_at timestamptz;

create table public.wa_messages (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.wa_accounts(id),
  contact_id      uuid references public.contacts(id) on delete set null,   -- null = unknown sender
  lead_id         uuid references public.leads(id) on delete set null,
  agent_id        uuid references public.profiles(id) on delete set null,   -- who sent it / whose lead
  direction       text not null check (direction in ('in', 'out')),
  kind            text not null check (kind in ('session', 'template', 'text', 'media', 'reaction', 'other')),
  template_id     uuid references public.wa_templates(id) on delete set null,
  body            text,                       -- text as sent/received; media = caption or null
  media_type      text,                       -- image / document / audio / video / sticker
  wa_message_id   text unique,                -- Meta's wamid; null only for a send Meta never acknowledged
  from_phone      text not null,
  to_phone        text not null,
  status          text not null default 'received'
    check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error           text,
  pricing_category text,                      -- Meta's billing category from the status webhook
  conversation_id text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_wa_messages_lead on public.wa_messages (lead_id, created_at desc);
create index idx_wa_messages_contact on public.wa_messages (contact_id, created_at desc);
create index idx_wa_messages_account on public.wa_messages (account_id, created_at desc);
create index idx_wa_messages_unmatched on public.wa_messages (created_at desc) where lead_id is null and direction = 'in';
create trigger wa_messages_updated_at before update on public.wa_messages
  for each row execute function public.set_updated_at();

alter table public.wa_messages enable row level security;
-- The agent reads the thread of a lead that is theirs. Buyer PII stays behind
-- the lead, exactly like contacts (00033). Never a subquery of wa_messages.
create policy "wa messages via own lead" on public.wa_messages for select to authenticated
  using (
    (lead_id is not null and exists (select 1 from public.leads l where l.id = lead_id and l.agent_id = auth.uid()))
    or public.has_capability('platform.configure')
  );
-- No writes for anyone: inbound and outbound both go through the functions.
revoke all on public.wa_messages from anon, authenticated;
grant select on public.wa_messages to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Webhook deliveries — append-only, service-only
-- -----------------------------------------------------------------------------
create table public.wa_webhook_events (
  id               uuid primary key default gen_random_uuid(),
  body_hash        text not null unique,      -- sha256 of the raw body: Meta retries verbatim
  phone_number_id  text,
  signature_valid  boolean not null,
  messages         integer not null default 0,
  statuses         integer not null default 0,
  payload          jsonb,
  outcome          text not null,
  received_at      timestamptz not null default now()
);
alter table public.wa_webhook_events enable row level security;
create policy "wa webhook events admin read" on public.wa_webhook_events for select to authenticated
  using (public.has_capability('platform.configure'));
revoke all on public.wa_webhook_events from anon, authenticated;
grant select on public.wa_webhook_events to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Functions
-- -----------------------------------------------------------------------------

/** The account that serves a country, if switched on. */
create or replace function public.wa_account_for_country(p_country text)
returns public.wa_accounts language sql stable security definer set search_path = public as $$
  select a.* from public.wa_accounts a where a.country_code = p_country and a.mode <> 'off' and a.phone_number_id is not null limit 1;
$$;

/**
 * May THIS agent send THIS kind of message on THIS lead right now?
 * The only function the UI and the send action consult. Order matters: the
 * cheapest, most absolute refusals come first.
 */
create or replace function public.wa_send_check(p_lead uuid, p_kind text, p_template uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_lead record;
  v_contact record;
  v_acct public.wa_accounts;
  v_tpl public.wa_templates;
  v_country text;
begin
  select l.id, l.agent_id, l.contact_id into v_lead from public.leads l where l.id = p_lead;
  if v_lead.id is null then return 'not_found'; end if;
  if auth.uid() is not null and auth.uid() <> v_lead.agent_id then return 'not_your_lead'; end if;
  if not public.is_feature_enabled('whatsapp_cloud', v_lead.agent_id) then return 'feature_off'; end if;

  select country_code into v_country from public.profiles where id = v_lead.agent_id;
  v_acct := public.wa_account_for_country(v_country);
  if v_acct.id is null then return 'no_account'; end if;

  select c.phone, c.marketing_consent, c.wa_last_inbound_at into v_contact from public.contacts c where c.id = v_lead.contact_id;
  if v_contact.phone is null then return 'no_phone'; end if;
  if exists (select 1 from public.wa_opt_outs o where o.phone = v_contact.phone) then return 'opted_out'; end if;
  if v_acct.mode = 'test' and not (v_contact.phone = any (v_acct.test_recipients)) then return 'not_test_recipient'; end if;

  if p_kind = 'session' then
    if v_contact.wa_last_inbound_at is null or v_contact.wa_last_inbound_at < now() - interval '24 hours' then
      return 'window_closed';
    end if;
    return 'ok';
  elsif p_kind = 'template' then
    select * into v_tpl from public.wa_templates t where t.id = p_template and t.account_id = v_acct.id;
    if v_tpl.id is null then return 'template_unknown'; end if;
    if v_tpl.status <> 'approved' then return 'template_not_approved'; end if;
    if v_tpl.category = 'marketing' then
      if not public.is_feature_enabled('whatsapp_marketing', v_lead.agent_id) then return 'marketing_not_approved'; end if;
      if not coalesce(v_contact.marketing_consent, false) then return 'no_marketing_consent'; end if;
    end if;
    return 'ok';
  end if;
  return 'bad_kind';
end $$;

/** Service only: record a send the adapter made (or failed to make). Stamps the first response. */
create or replace function public.wa_record_outbound(
  p_lead uuid, p_kind text, p_template uuid, p_body text, p_wa_message_id text, p_status text, p_error text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lead record; v_acct public.wa_accounts; v_phone text; v_id uuid; v_country text;
begin
  if auth.uid() is not null then raise exception 'service only' using errcode = '42501'; end if;
  select l.id, l.agent_id, l.contact_id, l.first_responded_at into v_lead from public.leads l where l.id = p_lead;
  if v_lead.id is null then raise exception 'lead not found'; end if;
  select country_code into v_country from public.profiles where id = v_lead.agent_id;
  v_acct := public.wa_account_for_country(v_country);
  select phone into v_phone from public.contacts where id = v_lead.contact_id;

  insert into public.wa_messages (account_id, contact_id, lead_id, agent_id, direction, kind, template_id, body, wa_message_id,
                                  from_phone, to_phone, status, error, sent_at)
  values (v_acct.id, v_lead.contact_id, v_lead.id, v_lead.agent_id, 'out', p_kind, p_template, left(p_body, 4096), p_wa_message_id,
          coalesce(v_acct.display_phone, v_acct.phone_number_id), v_phone, p_status, left(p_error, 300),
          case when p_status in ('sent', 'queued') then now() end)
  returning id into v_id;

  insert into public.lead_events (lead_id, kind, detail, actor_id)
  values (v_lead.id, case when p_status = 'failed' then 'whatsapp.failed' else 'whatsapp.sent' end,
          jsonb_build_object('kind', p_kind, 'template', p_template, 'length', length(coalesce(p_body, '')), 'mode', v_acct.mode), v_lead.agent_id);

  if p_status <> 'failed' and v_lead.first_responded_at is null then
    update public.leads set first_responded_at = now(), status = case when status = 'new' then 'contacted' else status end where id = v_lead.id;
    insert into public.lead_events (lead_id, kind, detail, actor_id) values (v_lead.id, 'lead.responded', '{"via":"whatsapp"}'::jsonb, v_lead.agent_id);
  end if;

  perform public.log_audit(case when p_status = 'failed' then 'whatsapp.send_failed' else 'whatsapp.sent' end, 'lead', v_lead.id::text, null,
    jsonb_build_object('kind', p_kind, 'template', p_template, 'mode', v_acct.mode, 'message', v_id), p_error,
    case when p_status = 'failed' then 'failure' else 'success' end);
  return v_id;
end $$;

/**
 * Service only: a message a person sent to one of our numbers.
 *   · dedup on wamid
 *   · STOP / BERHENTI / HENTI / UNSUBSCRIBE in any case → permanent opt-out
 *   · known contact → open the 24 h window, attach to their most recent open
 *     lead, notify that agent, write the lead event
 *   · unknown number → recorded with no lead for the admin inbox; nobody is
 *     messaged back (no auto-reply in this scaffold)
 * Returns matched · unmatched · opted_out · duplicate · unknown_account.
 */
create or replace function public.wa_record_inbound(
  p_phone_number_id text, p_from text, p_wa_message_id text, p_kind text, p_body text, p_media_type text, p_ts timestamptz
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_acct public.wa_accounts; v_contact record; v_lead record; v_out text := 'unmatched'; v_stop boolean;
begin
  if auth.uid() is not null then raise exception 'service only' using errcode = '42501'; end if;
  select * into v_acct from public.wa_accounts a where a.phone_number_id = p_phone_number_id;
  if v_acct.id is null then return 'unknown_account'; end if;
  if exists (select 1 from public.wa_messages m where m.wa_message_id = p_wa_message_id) then return 'duplicate'; end if;

  select c.id, c.phone into v_contact from public.contacts c where c.phone = p_from;
  if v_contact.id is not null then
    select l.id, l.agent_id into v_lead from public.leads l
     where l.contact_id = v_contact.id and l.status not in ('closed_won', 'closed_lost', 'spam')
     order by l.created_at desc limit 1;
    update public.contacts set wa_last_inbound_at = coalesce(p_ts, now()) where id = v_contact.id;
    v_out := case when v_lead.id is null then 'unmatched' else 'matched' end;
  end if;

  v_stop := p_kind = 'text' and upper(btrim(coalesce(p_body, ''))) in ('STOP', 'BERHENTI', 'HENTI', 'UNSUBSCRIBE', 'STOP ALL');
  if v_stop then
    insert into public.wa_opt_outs (phone, source, note) values (p_from, 'inbound_stop', left(p_body, 100)) on conflict (phone) do nothing;
    v_out := 'opted_out';
  end if;

  insert into public.wa_messages (account_id, contact_id, lead_id, agent_id, direction, kind, body, media_type, wa_message_id,
                                  from_phone, to_phone, status, sent_at)
  values (v_acct.id, v_contact.id, v_lead.id, v_lead.agent_id, 'in', p_kind, left(p_body, 4096), p_media_type, p_wa_message_id,
          p_from, coalesce(v_acct.display_phone, p_phone_number_id), 'received', coalesce(p_ts, now()));

  if v_lead.id is not null then
    insert into public.lead_events (lead_id, kind, detail, actor_id)
    values (v_lead.id, case when v_stop then 'whatsapp.opted_out' else 'whatsapp.received' end,
            jsonb_build_object('kind', p_kind, 'length', length(coalesce(p_body, ''))), null);
    if not v_stop then
      insert into public.notifications (user_id, kind, payload, href)
      select v_lead.agent_id, 'whatsapp_received', jsonb_build_object('ref', l.human_readable_id), '/leads'
      from public.leads l where l.id = v_lead.id;
    end if;
  end if;
  return v_out;
end $$;

/** Service only: Meta's delivery status for a message we sent. */
create or replace function public.wa_record_status(p_wa_message_id text, p_status text, p_error text, p_pricing text, p_conversation text, p_ts timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null then raise exception 'service only' using errcode = '42501'; end if;
  if p_status not in ('sent', 'delivered', 'read', 'failed') then return 'ignored'; end if;
  update public.wa_messages
     set status = case
           -- never let a late 'sent' overwrite 'delivered' or 'read'
           when status = 'read' then 'read'
           when status = 'delivered' and p_status = 'sent' then 'delivered'
           else p_status end,
         error = coalesce(p_error, error),
         pricing_category = coalesce(p_pricing, pricing_category),
         conversation_id = coalesce(p_conversation, conversation_id)
   where wa_message_id = p_wa_message_id and direction = 'out';
  get diagnostics n = row_count;
  return case when n = 0 then 'unknown_message' else 'updated' end;
end $$;

revoke all on function public.wa_account_for_country(text) from public, anon;
revoke all on function public.wa_send_check(uuid, text, uuid) from public, anon;
revoke all on function public.wa_record_outbound(uuid, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.wa_record_inbound(text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.wa_record_status(text, text, text, text, text, timestamptz) from public, anon, authenticated;

comment on function public.wa_send_check is
  'The WhatsApp rules in one place: flag, account, ownership, opt-out, test recipients, 24-hour window for session text, approved template otherwise, consent + flag for marketing. ok or the reason.';
comment on table public.wa_opt_outs is 'Global and permanent. A number that said STOP is never messaged again by any path; there is no delete.';
