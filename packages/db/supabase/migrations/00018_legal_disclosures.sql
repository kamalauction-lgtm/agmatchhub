-- =============================================================================
-- 00018 — Legal & material disclosures · spec §79–81, §86 modules 11–13
-- Agent-to-agent information: never auto-shown to the client. The RA decides
-- what reaches the client via an explicit client-safe summary (§81).
-- =============================================================================

create table public.legal_disclosures (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.property_submissions(id) on delete cascade,
  category text not null check (category in
    ('ownership_status','authority_to_sell','title_status','tenure','encumbrances',
     'caveats','existing_tenancy','vacant_possession','outstanding_charges',
     'litigation','auction_foreclosure','developer_restrictions',
     'renovation_restrictions','usage_restrictions','zoning','structural_defects',
     'known_material_defects','flood_history','foreign_purchaser_restrictions',
     'financing_limitations','service_charges','other')),
  description text not null,
  information_source text,
  mandatory_disclosure boolean not null default false,
  client_shareable boolean not null default false,
  requires_legal_verification boolean not null default false,
  status text not null default 'declared' check (status in
    ('declared','evidence_pending','under_review','confirmed',
     'requires_legal_verification','disputed','updated','withdrawn')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_legal_disclosures_updated before update on public.legal_disclosures
  for each row execute function public.set_updated_at();
create index idx_disclosures_submission on public.legal_disclosures (submission_id, created_at);

create table public.legal_disclosure_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  disclosure_id uuid not null references public.legal_disclosures(id) on delete cascade,
  acknowledged_by uuid not null references public.profiles(id),
  action text not null check (action in
    ('received','reviewed','clarification_required','document_required',
     'legal_review_required','ready_for_client','not_applicable','disputed')),
  notes text,
  -- §81: RA-authored client-safe wording, used only with action=ready_for_client
  client_safe_summary text,
  created_at timestamptz not null default now()
);
create index idx_disclosure_acks on public.legal_disclosure_acknowledgements (disclosure_id, created_at desc);

alter table public.legal_disclosures enable row level security;
alter table public.legal_disclosure_acknowledgements enable row level security;

create policy "disclosures participants read" on public.legal_disclosures
  for select to authenticated using (public.is_submission_participant(submission_id));
create policy "disclosures sa insert" on public.legal_disclosures
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.property_submissions s
        where s.id = submission_id and s.supply_agent_id = auth.uid())
  );
create policy "disclosures sa update" on public.legal_disclosures
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
create policy "disclosures admin update" on public.legal_disclosures
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "disclosure acks participants read" on public.legal_disclosure_acknowledgements
  for select to authenticated
  using (exists (select 1 from public.legal_disclosures d
         where d.id = legal_disclosure_acknowledgements.disclosure_id
           and public.is_submission_participant(d.submission_id)));
create policy "disclosure acks ra insert" on public.legal_disclosure_acknowledgements
  for insert to authenticated
  with check (
    acknowledged_by = auth.uid()
    and exists (select 1 from public.legal_disclosures d
        join public.property_submissions s on s.id = d.submission_id
        where d.id = legal_disclosure_acknowledgements.disclosure_id
          and public.owns_request(s.request_id))
  );
-- acknowledgements are immutable (history of review actions)

-- ---------------------------------------------------------------------------
-- §80 Supply Agent disclosure declaration (v1, EN/MS/ID). MS/ID are working
-- translations pending legal review (§68).
-- ---------------------------------------------------------------------------

insert into public.declarations (key, name) values
  ('supply_agent_disclosure', 'Supply Agent legal disclosure declaration');

insert into public.declaration_versions (declaration_id, version_number, locale, body)
select d.id, 1, v.locale, v.body
from public.declarations d,
(values
  ('en', $en$I confirm that I have disclosed to the Requesting Agent all known legal, ownership, authority, restriction, encumbrance, tenancy, condition and material information that may reasonably affect the proposed sale, purchase, rental, lease, use, occupation or negotiation of this property.
I understand that I must not knowingly conceal or misrepresent material information.
Where I am uncertain about any legal matter, I will clearly identify it as requiring confirmation or independent legal verification.
I understand that the Platform does not provide legal advice and that the relevant parties should obtain independent professional advice where necessary.$en$),
  ('ms', $ms$Saya mengesahkan bahawa saya telah mendedahkan kepada Requesting Agent semua maklumat undang-undang, pemilikan, kuasa, sekatan, bebanan, penyewaan, keadaan dan maklumat material yang diketahui yang mungkin secara munasabah menjejaskan cadangan penjualan, pembelian, penyewaan, pajakan, penggunaan, pendudukan atau rundingan hartanah ini.
Saya memahami bahawa saya tidak boleh dengan sengaja menyembunyikan atau menyalahnyatakan maklumat material.
Sekiranya saya tidak pasti tentang sebarang perkara undang-undang, saya akan mengenal pastinya dengan jelas sebagai memerlukan pengesahan atau verifikasi undang-undang bebas.
Saya memahami bahawa Platform tidak memberikan nasihat undang-undang dan pihak berkaitan harus mendapatkan nasihat profesional bebas di mana perlu.$ms$),
  ('id', $id$Saya menyatakan bahwa saya telah mengungkapkan kepada Requesting Agent seluruh informasi hukum, kepemilikan, kewenangan, pembatasan, beban, sewa-menyewa, kondisi dan informasi material yang diketahui yang secara wajar dapat memengaruhi rencana penjualan, pembelian, penyewaan, sewa guna, penggunaan, penempatan atau negosiasi properti ini.
Saya memahami bahwa saya tidak boleh dengan sengaja menyembunyikan atau salah menyatakan informasi material.
Apabila saya tidak yakin mengenai suatu masalah hukum, saya akan dengan jelas menandainya sebagai memerlukan konfirmasi atau verifikasi hukum independen.
Saya memahami bahwa Platform tidak memberikan nasihat hukum dan pihak terkait sebaiknya memperoleh nasihat profesional independen bila diperlukan.$id$)
) as v(locale, body)
where d.key = 'supply_agent_disclosure';
