-- =============================================================================
-- 00104 — Agent verification documents: admins read only within their scope
--
-- FOUND IN STAGING VALIDATION OF P0-a (10 Nov 2026)
--   P0-a stopped a MY country admin from opening an ID agent's page in the
--   hub. The storage policy from 00002 still let them read the files
--   directly: "verif docs read own or admin" allowed any is_platform_admin(),
--   so createSignedUrl() through the storage API returned a working link to
--   an ID agent's licence for an admin scoped to {MY}. Reproduced on staging
--   with the standing test accounts; the hub page was not involved.
--
-- NOW
--   The owner still reads their own folder. An admin reads a folder only if
--   they hold agent.verify for the folder owner's country —
--   has_capability_in() (00060), so global holders (super_admin, admin, and
--   compliance_admin without country codes) are unaffected, and an owner with
--   no country is readable only by global holders.
--
--   The country lookup is a SECURITY DEFINER helper that reads
--   public.profiles, never storage.objects, so the policy does not query its
--   own table (the 42P17 rule).
--
--   Writes are unchanged: owner-folder only, as in 00002.
-- =============================================================================

create or replace function public.can_review_agent_folder(p_owner text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_capability_in(
    'agent.verify',
    (select p.country_code from public.profiles p where p.id::text = p_owner)
  );
$$;

comment on function public.can_review_agent_folder(text) is
  'May the caller read verification files in this owner''s folder? agent.verify for the owner''s country (00104).';

revoke all on function public.can_review_agent_folder(text) from public, anon;
grant execute on function public.can_review_agent_folder(text) to authenticated;

drop policy if exists "verif docs read own or admin" on storage.objects;

create policy "verif docs read own or scoped admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agent-verification-private'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_review_agent_folder((storage.foldername(name))[1])
    )
  );
