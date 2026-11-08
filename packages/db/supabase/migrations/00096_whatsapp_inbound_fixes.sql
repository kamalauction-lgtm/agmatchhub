-- =============================================================================
-- 00096 — WhatsApp inbound: two faults the first webhook proof found (8 Nov 2026)
--
-- 1. Dedupe only VERIFIED deliveries. An unsigned POST carrying the same body
--    as the real one was recorded first and its hash then made the genuine,
--    signed delivery a "duplicate" — an attacker who can guess a body could
--    suppress it. Unverified rows are kept for the log but never block.
-- 2. wa_record_inbound used an unassigned record for the lead when the sender
--    was unknown (no contact → no lead lookup) and raised. Scalars instead.
-- =============================================================================

alter table public.wa_webhook_events drop constraint if exists wa_webhook_events_body_hash_key;
create unique index if not exists idx_wa_webhook_events_verified_body on public.wa_webhook_events (body_hash) where signature_valid;

create or replace function public.wa_record_inbound(
  p_phone_number_id text, p_from text, p_wa_message_id text, p_kind text, p_body text, p_media_type text, p_ts timestamptz
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_acct public.wa_accounts;
  v_contact_id uuid; v_lead_id uuid; v_agent_id uuid; v_lead_ref text;
  v_out text := 'unmatched'; v_stop boolean;
begin
  if auth.uid() is not null then raise exception 'service only' using errcode = '42501'; end if;
  select * into v_acct from public.wa_accounts a where a.phone_number_id = p_phone_number_id;
  if v_acct.id is null then return 'unknown_account'; end if;
  if exists (select 1 from public.wa_messages m where m.wa_message_id = p_wa_message_id) then return 'duplicate'; end if;

  select c.id into v_contact_id from public.contacts c where c.phone = p_from;
  if v_contact_id is not null then
    select l.id, l.agent_id, l.human_readable_id into v_lead_id, v_agent_id, v_lead_ref from public.leads l
     where l.contact_id = v_contact_id and l.status not in ('closed_won', 'closed_lost', 'spam')
     order by l.created_at desc limit 1;
    update public.contacts set wa_last_inbound_at = coalesce(p_ts, now()) where id = v_contact_id;
    v_out := case when v_lead_id is null then 'unmatched' else 'matched' end;
  end if;

  v_stop := p_kind = 'text' and upper(btrim(coalesce(p_body, ''))) in ('STOP', 'BERHENTI', 'HENTI', 'UNSUBSCRIBE', 'STOP ALL');
  if v_stop then
    insert into public.wa_opt_outs (phone, source, note) values (p_from, 'inbound_stop', left(p_body, 100)) on conflict (phone) do nothing;
    v_out := 'opted_out';
  end if;

  insert into public.wa_messages (account_id, contact_id, lead_id, agent_id, direction, kind, body, media_type, wa_message_id,
                                  from_phone, to_phone, status, sent_at)
  values (v_acct.id, v_contact_id, v_lead_id, v_agent_id, 'in', p_kind, left(p_body, 4096), p_media_type, p_wa_message_id,
          p_from, coalesce(v_acct.display_phone, p_phone_number_id), 'received', coalesce(p_ts, now()));

  if v_lead_id is not null then
    insert into public.lead_events (lead_id, kind, detail, actor_id)
    values (v_lead_id, case when v_stop then 'whatsapp.opted_out' else 'whatsapp.received' end,
            jsonb_build_object('kind', p_kind, 'length', length(coalesce(p_body, ''))), null);
    if not v_stop then
      insert into public.notifications (user_id, kind, payload, href)
      values (v_agent_id, 'whatsapp_received', jsonb_build_object('ref', v_lead_ref), '/leads');
    end if;
  end if;
  return v_out;
end $$;
revoke all on function public.wa_record_inbound(text, text, text, text, text, text, timestamptz) from public, anon, authenticated;
