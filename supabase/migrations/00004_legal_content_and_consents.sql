-- =============================================================================
-- 00004 — Versioned legal content + consent records · spec §28–31, §68
-- Declarations are version-controlled and immutable: new wording = new version
-- row; consent records reference the exact accepted version.
-- =============================================================================

create table public.declarations (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,     -- supply_agent_submission | requesting_agent_presentation | client_disclaimer
  name text not null,
  created_at timestamptz not null default now()
);

create table public.declaration_versions (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references public.declarations(id) on delete cascade,
  version_number int not null,
  locale text not null references public.languages(code),
  body text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (declaration_id, locale, version_number)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  declaration_id uuid not null references public.declarations(id),
  declaration_version_id uuid not null references public.declaration_versions(id),
  accepted_text text not null,       -- exact wording snapshot (§31)
  language text not null,
  request_ref uuid,                  -- soft refs; hard FKs added when those tables exist
  submission_ref uuid,
  presentation_ref uuid,
  session_ref text,
  country_code text,
  status text not null default 'accepted' check (status in ('accepted','revoked')),
  created_at timestamptz not null default now()
);

alter table public.declarations enable row level security;
alter table public.declaration_versions enable row level security;
alter table public.consent_records enable row level security;

-- Client disclaimer must be readable pre-auth (presentation pages)
create policy "declarations public read" on public.declarations
  for select to anon, authenticated using (true);
create policy "declaration_versions public read" on public.declaration_versions
  for select to anon, authenticated using (active = true or public.is_platform_admin());
create policy "declarations admin insert" on public.declarations
  for insert to authenticated with check (public.is_platform_admin());
create policy "declaration_versions admin insert" on public.declaration_versions
  for insert to authenticated with check (public.is_platform_admin());
create policy "declaration_versions admin update" on public.declaration_versions
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
-- NOTE: content immutability is procedural (new version rows); the update
-- policy exists to flip the `active` flag only. No delete policies.

create policy "consent_records self insert" on public.consent_records
  for insert to authenticated with check (user_id = auth.uid());
create policy "consent_records read own or admin" on public.consent_records
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
-- no update/delete: consent history is immutable for normal roles

-- Admin may manage country settings from the console (§35)
create policy "countries admin update" on public.countries
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Seed declaration types + version 1 wording (operational draft — §68 requires
-- qualified legal review per country before commercial launch)
-- ---------------------------------------------------------------------------

insert into public.declarations (key, name) values
  ('supply_agent_submission', 'Supply Agent property submission declaration'),
  ('requesting_agent_presentation', 'Requesting Agent client presentation declaration'),
  ('client_disclaimer', 'Client presentation disclaimer');

-- §28 Supply Agent declaration
insert into public.declaration_versions (declaration_id, version_number, locale, body)
select d.id, 1, v.locale, v.body
from public.declarations d,
(values
  ('en', $en$I confirm that all information, descriptions, prices, availability details, photographs, documents and representations provided in this property submission are true, accurate and current to the best of my knowledge.
I confirm that I have the authority, permission or legitimate professional basis to submit and represent this property.
I understand that I am fully responsible for any false, misleading, outdated, unauthorised or inaccurate information submitted by me.
I agree to promptly update or withdraw the property submission if the property is no longer available or if any material information changes.
I acknowledge that the Platform Administrator acts as a technology and collaboration facilitator and is not responsible for verifying every representation made by me.
I agree not to directly approach, solicit, contact or bypass the buyer, tenant or client represented by the Requesting Agent without written consent through the platform.
I agree not to share confidential client, agent, owner or property information outside the authorised transaction.
I understand that a breach of this declaration may result in removal of my submission, account restriction, suspension, termination of access, investigation or other action determined by the Platform Administrator.$en$),
  ('ms', $ms$Saya mengesahkan bahawa semua maklumat, keterangan, harga, status ketersediaan, gambar, dokumen dan representasi yang diberikan dalam penyerahan hartanah ini adalah benar, tepat dan terkini sepanjang pengetahuan saya.
Saya mengesahkan bahawa saya mempunyai kuasa, kebenaran atau asas profesional yang sah untuk menyerahkan dan mewakili hartanah ini.
Saya memahami bahawa saya bertanggungjawab sepenuhnya terhadap sebarang maklumat palsu, mengelirukan, tidak terkini, tidak dibenarkan atau tidak tepat yang diserahkan oleh saya.
Saya bersetuju untuk mengemas kini atau menarik balik penyerahan hartanah dengan segera sekiranya hartanah tersebut tidak lagi tersedia atau terdapat perubahan penting terhadap maklumatnya.
Saya mengakui bahawa Pentadbir Platform bertindak sebagai penyedia teknologi dan fasilitator kerjasama serta tidak bertanggungjawab untuk mengesahkan setiap representasi yang dibuat oleh saya.
Saya bersetuju untuk tidak mendekati, memujuk, menghubungi atau memintas pembeli, penyewa atau pelanggan yang diwakili oleh Requesting Agent tanpa persetujuan bertulis melalui platform.
Saya bersetuju untuk tidak berkongsi maklumat sulit pelanggan, ejen, pemilik atau hartanah di luar urusan yang dibenarkan.
Saya memahami bahawa pelanggaran terhadap deklarasi ini boleh menyebabkan penyerahan saya dipadamkan, akaun dihadkan, digantung, akses ditamatkan, siasatan dijalankan atau tindakan lain yang ditentukan oleh Pentadbir Platform.$ms$),
  ('id', $id$Saya menyatakan bahwa seluruh informasi, deskripsi, harga, status ketersediaan, foto, dokumen dan pernyataan yang diberikan dalam pengajuan properti ini adalah benar, akurat dan terkini berdasarkan pengetahuan terbaik saya.
Saya menyatakan bahwa saya memiliki kewenangan, izin atau dasar profesional yang sah untuk mengajukan dan mewakili properti ini.
Saya memahami bahwa saya bertanggung jawab penuh atas setiap informasi palsu, menyesatkan, tidak terkini, tanpa izin atau tidak akurat yang saya ajukan.
Saya setuju untuk segera memperbarui atau menarik kembali pengajuan properti apabila properti tersebut tidak lagi tersedia atau terdapat perubahan penting terhadap informasinya.
Saya memahami bahwa Administrator Platform bertindak sebagai penyedia teknologi dan fasilitator kolaborasi serta tidak bertanggung jawab untuk memverifikasi setiap pernyataan yang saya berikan.
Saya setuju untuk tidak mendekati, menawarkan, menghubungi atau melewati agen yang mewakili pembeli, penyewa atau klien tanpa persetujuan tertulis melalui platform.
Saya setuju untuk tidak membagikan informasi rahasia mengenai klien, agen, pemilik atau properti di luar transaksi yang diizinkan.
Saya memahami bahwa pelanggaran terhadap pernyataan ini dapat mengakibatkan penghapusan pengajuan, pembatasan akun, penangguhan, penghentian akses, pemeriksaan atau tindakan lain yang ditentukan oleh Administrator Platform.$id$)
) as v(locale, body)
where d.key = 'supply_agent_submission';

-- §29 Requesting Agent declaration
insert into public.declaration_versions (declaration_id, version_number, locale, body)
select d.id, 1, v.locale, v.body
from public.declarations d,
(values
  ('en', $en$I confirm that I am authorised to represent or assist the buyer or tenant connected to this property requirement.
I agree to use submitted property information only for the legitimate purpose of serving the relevant client.
I agree not to misuse, copy, distribute or commercially exploit another agent's confidential information outside the authorised transaction.
I agree not to bypass or remove the Supply Agent from a transaction involving a property submitted by that agent.
I acknowledge that property availability, price, specifications and terms remain subject to confirmation.$en$),
  ('ms', $ms$Saya mengesahkan bahawa saya diberi kuasa untuk mewakili atau membantu pembeli atau penyewa yang berkaitan dengan keperluan hartanah ini.
Saya bersetuju untuk menggunakan maklumat hartanah yang diserahkan hanya untuk tujuan sah melayani pelanggan berkenaan.
Saya bersetuju untuk tidak menyalahgunakan, menyalin, mengedarkan atau mengeksploitasi secara komersial maklumat sulit ejen lain di luar urusan yang dibenarkan.
Saya bersetuju untuk tidak memintas atau menyingkirkan Supply Agent daripada urusan yang melibatkan hartanah yang diserahkan oleh ejen tersebut.
Saya mengakui bahawa ketersediaan hartanah, harga, spesifikasi dan terma adalah tertakluk kepada pengesahan.$ms$),
  ('id', $id$Saya menyatakan bahwa saya berwenang untuk mewakili atau membantu pembeli atau penyewa yang terkait dengan kebutuhan properti ini.
Saya setuju untuk menggunakan informasi properti yang diajukan hanya untuk tujuan sah melayani klien terkait.
Saya setuju untuk tidak menyalahgunakan, menyalin, menyebarkan atau mengeksploitasi secara komersial informasi rahasia agen lain di luar transaksi yang diizinkan.
Saya setuju untuk tidak melewati atau menyingkirkan Supply Agent dari transaksi yang melibatkan properti yang diajukan oleh agen tersebut.
Saya mengakui bahwa ketersediaan properti, harga, spesifikasi dan ketentuan tetap tunduk pada konfirmasi.$id$)
) as v(locale, body)
where d.key = 'requesting_agent_presentation';

-- §30 Client disclaimer
insert into public.declaration_versions (declaration_id, version_number, locale, body)
select d.id, 1, v.locale, v.body
from public.declarations d,
(values
  ('en', $en$Property information, price, availability, dimensions and terms are subject to confirmation and may change without prior notice.
The information presented is for preliminary evaluation and comparison only and does not constitute a binding offer, contract, valuation, financial advice or legal advice.
Please contact your representing agent to confirm current availability, arrange a viewing, submit an offer or obtain additional information.$en$),
  ('ms', $ms$Maklumat hartanah, harga, ketersediaan, ukuran dan terma adalah tertakluk kepada pengesahan dan boleh berubah tanpa notis terlebih dahulu.
Maklumat yang dipaparkan adalah untuk penilaian dan perbandingan awal sahaja dan tidak merupakan tawaran mengikat, kontrak, penilaian rasmi, nasihat kewangan atau nasihat undang-undang.
Sila hubungi ejen yang mewakili anda untuk mengesahkan ketersediaan semasa, mengatur lawatan, mengemukakan tawaran atau mendapatkan maklumat tambahan.$ms$),
  ('id', $id$Informasi properti, harga, ketersediaan, dimensi dan ketentuan tunduk pada konfirmasi dan dapat berubah tanpa pemberitahuan sebelumnya.
Informasi yang disajikan hanya untuk evaluasi dan perbandingan awal dan bukan merupakan penawaran mengikat, kontrak, penilaian resmi, nasihat keuangan atau nasihat hukum.
Silakan hubungi agen yang mewakili Anda untuk mengonfirmasi ketersediaan saat ini, mengatur kunjungan, mengajukan penawaran atau memperoleh informasi tambahan.$id$)
) as v(locale, body)
where d.key = 'client_disclaimer';
