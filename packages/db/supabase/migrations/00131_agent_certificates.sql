-- =============================================================================
-- 00131 — Agent certificates: optional, proof required, admin-approved,
-- shown publicly as "Certified" (owner, 17 Nov 2026)
--
-- The Indonesian government requires agents to hold a certificate and number.
-- On the platform it is optional to enter; if entered, proof is required and
-- an admin approves or rejects it. Approved and unexpired, the public profile
-- shows "Certified" with the number; otherwise it shows nothing. It is NOT the
-- Verified badge (personal identification, agent_status = 'verified').
--
--   1. agent_certificates: one row per submission, never edited by the agent
--      (hard rule 8): a new submission supersedes an earlier pending one; a
--      new approval supersedes the earlier approved one. Reviewer and actor
--      columns point at auth.users (hard rule 6).
--   2. Which certificate types a country has is configuration:
--      countries.terminology.certificate_types (ID → SERTIFIKAT_KOMPETENSI).
--      A country without the setting offers no certificate.
--   3. Proof files live in the private bucket agent-certificates-private,
--      <user_id>/<file>; the owner may add files to their own folder (never
--      overwrite), and only agent.verify for the agent's country may read
--      them (can_review_agent_folder, 00104).
--   4. agent_submit_certificate / admin_review_certificate: the only writes.
--      Country-scoped, audited, the agent is notified of the decision.
--   5. public_agent_profiles gains is_certified, certificate_type,
--      certificate_number and certificate_expires_on — approved and not yet
--      expired only. Expiry needs no job: the view stops showing it.
--   6. certificates_due_reminder(): approved certificates expiring within 30
--      days and not yet reminded; marks them and returns them (service only)
--      so the Hub cron can notify the agent by in-app, push and email.
--
-- No policy subqueries its own table (hard rule 4).
-- Rollback: recreate public_agent_profiles from 00129; drop the functions,
-- the table, the storage policies and the bucket.
-- =============================================================================

create table if not exists public.agent_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null references public.countries(code),
  cert_type text not null,
  cert_number text not null,
  expires_on date not null,
  document_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'superseded')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_certificates_user on public.agent_certificates (user_id, created_at desc);
create index if not exists idx_agent_certificates_pending on public.agent_certificates (country_code, created_at) where status = 'pending';
create index if not exists idx_agent_certificates_number on public.agent_certificates (country_code, lower(cert_number));

alter table public.agent_certificates enable row level security;
drop policy if exists "agent certificates read" on public.agent_certificates;
create policy "agent certificates read" on public.agent_certificates
  for select to authenticated
  using (user_id = auth.uid() or public.admin_sees_user(user_id));
revoke insert, update, delete on public.agent_certificates from anon, authenticated;

-- 3. Private proof bucket -----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agent-certificates-private', 'agent-certificates-private', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "certificate proof owner add" on storage.objects;
create policy "certificate proof owner add" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agent-certificates-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "certificate proof read own or scoped admin" on storage.objects;
create policy "certificate proof read own or scoped admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agent-certificates-private'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_review_agent_folder((storage.foldername(name))[1])
    )
  );

-- 4. Submit and review ---------------------------------------------------------------
create or replace function public.agent_submit_certificate(
  p_type text, p_number text, p_expires date, p_document_path text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_country text;
  v_types jsonb;
  v_number text := upper(regexp_replace(trim(coalesce(p_number, '')), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if v_uid is null or not public.agent_has_access(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  select p.country_code into v_country from public.profiles p where p.id = v_uid;
  if v_country is null then
    return jsonb_build_object('ok', false, 'error', 'no_country');
  end if;
  select c.terminology->'certificate_types' into v_types from public.countries c where c.code = v_country;
  if v_types is null or jsonb_typeof(v_types) <> 'array' or not (v_types ? coalesce(p_type, '')) then
    return jsonb_build_object('ok', false, 'error', 'type_not_offered');
  end if;
  if length(v_number) < 3 or length(v_number) > 60 or v_number !~ '^[A-Z0-9][A-Z0-9./ -]*$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_number');
  end if;
  if p_expires is null or p_expires <= current_date then
    return jsonb_build_object('ok', false, 'error', 'invalid_expiry');
  end if;
  if p_document_path is null or split_part(p_document_path, '/', 1) <> v_uid::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'agent-certificates-private' and o.name = p_document_path) then
    return jsonb_build_object('ok', false, 'error', 'proof_required');
  end if;

  update public.agent_certificates set status = 'superseded'
   where user_id = v_uid and status = 'pending';
  insert into public.agent_certificates (user_id, country_code, cert_type, cert_number, expires_on, document_path)
  values (v_uid, v_country, p_type, v_number, p_expires, p_document_path)
  returning id into v_id;
  perform public.log_audit('agent.certificate_submitted', 'agent_certificate', v_id::text, null,
    jsonb_build_object('cert_type', p_type, 'expires_on', p_expires, 'country_code', v_country), null);
  return jsonb_build_object('ok', true, 'certificate', v_id);
end;
$$;

create or replace function public.admin_review_certificate(p_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_c record;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_status text;
begin
  select * into v_c from public.agent_certificates where id = p_id for update;
  if v_c.id is null or not public.has_capability_in('agent.verify', v_c.country_code) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_c.user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  if v_c.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;
  if p_decision not in ('approve', 'reject') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_decision = 'reject' and (v_note is null or length(v_note) < 3) then
    return jsonb_build_object('ok', false, 'error', 'note_required');
  end if;
  if v_note is not null and length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long');
  end if;

  v_status := case p_decision when 'approve' then 'approved' else 'rejected' end;
  if v_status = 'approved' then
    update public.agent_certificates set status = 'superseded'
     where user_id = v_c.user_id and status = 'approved';
  end if;
  update public.agent_certificates
     set status = v_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
  perform public.log_audit('agent.certificate_' || v_status, 'agent_certificate', p_id::text,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', v_status, 'user_id', v_c.user_id), v_note);
  insert into public.notifications (user_id, kind, payload, href)
  values (v_c.user_id, 'agent.certificate_' || v_status, jsonb_build_object('ref', v_c.cert_number), '/profile#certificate');
  return jsonb_build_object('ok', true, 'status', v_status, 'user', v_c.user_id);
end;
$$;

-- 6. Reminders ---------------------------------------------------------------------------
create or replace function public.certificates_due_reminder()
returns table (user_id uuid, cert_number text, expires_on date)
language sql security definer set search_path = public as $$
  update public.agent_certificates c
     set reminder_sent_at = now()
   where c.status = 'approved'
     and c.reminder_sent_at is null
     and c.expires_on >= current_date
     and c.expires_on <= current_date + 30
  returning c.user_id, c.cert_number, c.expires_on;
$$;

revoke all on function public.agent_submit_certificate(text, text, date, text) from public, anon;
revoke all on function public.admin_review_certificate(uuid, text, text) from public, anon;
revoke all on function public.certificates_due_reminder() from public, anon, authenticated;
grant execute on function public.agent_submit_certificate(text, text, date, text) to authenticated;
grant execute on function public.admin_review_certificate(uuid, text, text) to authenticated;
grant execute on function public.certificates_due_reminder() to service_role;

-- 5. Public profile: Certified (approved, unexpired) ------------------------------------
create or replace view public.public_agent_profiles with (security_invoker = false) as
 select pr.id,
    pr.public_slug,
    pr.display_name,
    pr.avatar_url,
    pr.country_code,
    pr.preferred_language,
    pr.agent_status = 'verified'::text as is_verified,
    agp.agency_name,
    agp.city,
    agp.state_region,
    agp.biography,
    agp.profile_photo_path,
    agp.markets_served,
    agp.property_categories,
    ( select count(*) as count
           from listings l
          where l.agent_id = pr.id and l.status = 'published'::text and l.moderation_state = 'approved'::text and l.archived_at is null) as published_listing_count,
    cert.id is not null as is_certified,
    cert.cert_type as certificate_type,
    cert.cert_number as certificate_number,
    cert.expires_on as certificate_expires_on
   from profiles pr
     left join agent_profiles agp on agp.user_id = pr.id
     left join lateral (
       select c.id, c.cert_type, c.cert_number, c.expires_on
         from agent_certificates c
        where c.user_id = pr.id and c.status = 'approved' and c.expires_on >= current_date
        order by c.reviewed_at desc nulls last
        limit 1
     ) cert on true
  where public.agent_access_ok(pr.agent_status, pr.access_granted_at);

grant select on public.public_agent_profiles to anon, authenticated;

-- 2. Configuration for Indonesia (the country whose government requires it) ----------
update public.countries
   set terminology = coalesce(terminology, '{}'::jsonb)
                     || jsonb_build_object('certificate_types', jsonb_build_array('SERTIFIKAT_KOMPETENSI'))
 where code = 'ID';
