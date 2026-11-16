-- =============================================================================
-- 00111 — the inquiry consent is recorded in the listing's own country (D8)
--
-- submit_public_inquiry (00033) stamped every buyer_inquiry consent with
-- country_code = 'ID', so a consent given on a Malaysian listing was filed as
-- Indonesian. The country now comes from the inquired listing's property,
-- which the function already joins to check the listing is public.
--
-- The body below is the live staging definition (pg_get_functiondef,
-- 11 Nov 2026) with exactly two changes: the listing select also reads
-- p.country_code, and the consent insert uses it instead of 'ID'. Same
-- signature, same SECURITY DEFINER and search_path, same grants.
--
-- Rollback: re-run the 00033 definition.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_public_inquiry(p_listing_slug text, p_full_name text, p_phone text, p_email text, p_message text, p_inquiry_type text, p_locale text, p_consent_version_id uuid, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  select l.id, l.agent_id, l.title, p.country_code into v_listing
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
         'contact:' || v_contact_id, v_listing.country_code
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
$function$;

revoke execute on function public.submit_public_inquiry(
  text, text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.submit_public_inquiry(
  text, text, text, text, text, text, text, uuid, text) to anon;
