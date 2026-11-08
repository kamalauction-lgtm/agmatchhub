-- =============================================================================
-- 00079 — The AI Workforce catalogue (Stage B, E1 · 7 Nov 2026)
--
-- The directive describes "an AI Manager and 36 specialised AI employee
-- roles" across twelve areas. They are ROWS, not thirty-six code paths: an
-- agent browses a directory, a role that is live opens an existing surface
-- (`route`) and draws on a metered feature (`feature`), and a role that is
-- planned says so. Kamal renames, reorders, retires or launches a role from
-- the admin page without a deploy.
--
-- Every role starts `planned`. A role flips to `live` in the migration that
-- ships its capability (E2–E7), never earlier — the directory must not promise
-- something the dashboard cannot yet do.
-- =============================================================================

create table public.ai_roles (
  key            text primary key,
  category       text not null,
  sort           integer not null,
  name           jsonb not null,          -- {"en": …, "id": …, "ms": …}
  description    jsonb not null,
  status         text not null default 'planned' check (status in ('live', 'planned', 'hidden')),
  tier           text not null default 'core' check (tier in ('core', 'premium')),
  route          text,                    -- where a live role opens
  external_url   text,                    -- a Hero module, for linked agents
  feature        text references public.ai_models(feature) on delete set null,
  country_codes  text[] not null default array['ID', 'MY'],
  updated_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now()
);

alter table public.ai_roles enable row level security;
create policy "ai roles read"  on public.ai_roles for select to authenticated using (status <> 'hidden' or public.has_capability('ai.manage'));
create policy "ai roles admin" on public.ai_roles for all to authenticated
  using (public.has_capability('ai.manage')) with check (public.has_capability('ai.manage'));
revoke all on public.ai_roles from anon;

insert into public.ai_roles (key, category, sort, name, description, tier, route, feature, external_url) values
-- 1 · Listing research & acquisition
('listing_researcher',   'listing_research', 10, '{"en":"Listing Researcher","id":"Peneliti Listing","ms":"Penyelidik Penyenaraian"}',
  '{"en":"Finds comparable listings and recent asking prices around a property.","id":"Mencari listing pembanding dan harga penawaran terbaru di sekitar properti.","ms":"Mencari penyenaraian setara dan harga tawaran terkini di sekitar hartanah."}', 'core', null, 'listing_copy', null),
('owner_outreach',       'listing_research', 20, '{"en":"Owner Outreach Drafter","id":"Penyusun Pesan Pemilik","ms":"Penggubal Mesej Pemilik"}',
  '{"en":"Drafts the first message to an owner who may want to sell or let.","id":"Menyusun pesan pertama kepada pemilik yang mungkin ingin menjual atau menyewakan.","ms":"Menggubal mesej pertama kepada pemilik yang mungkin mahu menjual atau menyewakan."}', 'core', null, 'secretary_reply', null),
('comparables_analyst',  'listing_research', 30, '{"en":"Comparables Analyst","id":"Analis Pembanding","ms":"Penganalisis Perbandingan"}',
  '{"en":"Explains where an asking price sits against similar units, with the reason.","id":"Menjelaskan posisi harga penawaran dibanding unit serupa, beserta alasannya.","ms":"Menerangkan kedudukan harga tawaran berbanding unit serupa, dengan sebabnya."}', 'core', null, 'listing_copy', null),
-- 2 · Property management
('quality_auditor',      'property_management', 10, '{"en":"Listing Quality Auditor","id":"Auditor Kualitas Listing","ms":"Juruaudit Kualiti Penyenaraian"}',
  '{"en":"Scores a listing and names the specific fixes, not a grade.","id":"Menilai listing dan menyebut perbaikan spesifiknya, bukan sekadar nilai.","ms":"Menilai penyenaraian dan menamakan pembaikan khusus, bukan sekadar gred."}', 'core', '/listings', 'listing_copy', null),
('photo_checker',        'property_management', 20, '{"en":"Photo Checker","id":"Pemeriksa Foto","ms":"Pemeriksa Foto"}',
  '{"en":"Flags blurry, duplicate or personal-information photos before they publish.","id":"Menandai foto buram, ganda, atau berisi data pribadi sebelum tayang.","ms":"Menanda foto kabur, berganda atau mengandungi maklumat peribadi sebelum diterbitkan."}', 'premium', null, 'poster_image', null),
('refresh_planner',      'property_management', 30, '{"en":"Listing Refresh Planner","id":"Perencana Pembaruan Listing","ms":"Perancang Penyegaran Penyenaraian"}',
  '{"en":"Tells you which listings expire or go stale this week and what to do.","id":"Memberi tahu listing mana yang kedaluwarsa atau basi minggu ini dan apa yang harus dilakukan.","ms":"Memberitahu penyenaraian mana yang tamat atau usang minggu ini dan apa yang perlu dibuat."}', 'core', '/dashboard', 'brief', null),
-- 3 · Marketing & content
('listing_copywriter',   'marketing_content', 10, '{"en":"Listing Copywriter","id":"Penulis Naskah Listing","ms":"Penulis Salinan Penyenaraian"}',
  '{"en":"Writes titles, description and selling points from the fields you entered.","id":"Menulis judul, deskripsi, dan poin jual dari data yang Anda isi.","ms":"Menulis tajuk, keterangan dan kelebihan daripada medan yang anda isi."}', 'core', '/listings/new', 'listing_copy', null),
('caption_writer',       'marketing_content', 20, '{"en":"Caption Writer","id":"Penulis Caption","ms":"Penulis Kapsyen"}',
  '{"en":"Facebook, Instagram and TikTok text for one listing, in your language.","id":"Teks Facebook, Instagram, dan TikTok untuk satu listing, dalam bahasa Anda.","ms":"Teks Facebook, Instagram dan TikTok untuk satu penyenaraian, dalam bahasa anda."}', 'core', '/studio', 'studio_copy', null),
('brochure_writer',      'marketing_content', 30, '{"en":"Brochure Writer","id":"Penulis Brosur","ms":"Penulis Risalah"}',
  '{"en":"The text of a one-page brochure, ready for the print view.","id":"Teks brosur satu halaman, siap untuk tampilan cetak.","ms":"Teks risalah satu muka, sedia untuk paparan cetak."}', 'core', '/studio', 'studio_copy', null),
-- 4 · Posters, video & social
('poster_designer',      'posters_video_social', 10, '{"en":"Poster Designer","id":"Desainer Poster","ms":"Pereka Poster"}',
  '{"en":"Template posters for a listing, exported as images.","id":"Poster template untuk listing, diekspor sebagai gambar.","ms":"Poster templat untuk penyenaraian, dieksport sebagai imej."}', 'premium', '/studio', 'poster_image', null),
('video_scriptwriter',   'posters_video_social', 20, '{"en":"Video Script Writer","id":"Penulis Naskah Video","ms":"Penulis Skrip Video"}',
  '{"en":"A 30-second walkthrough script and shot list.","id":"Naskah video 30 detik dan daftar pengambilan gambar.","ms":"Skrip video 30 saat dan senarai syot."}', 'premium', null, 'video_script', null),
('social_planner',       'posters_video_social', 30, '{"en":"Social Calendar Planner","id":"Perencana Kalender Sosial","ms":"Perancang Kalendar Sosial"}',
  '{"en":"A week of posts across your listings, scheduled through the Studio.","id":"Seminggu unggahan dari listing Anda, dijadwalkan lewat Studio.","ms":"Seminggu hantaran merentasi penyenaraian anda, dijadualkan melalui Studio."}', 'core', '/studio/scheduled', 'studio_copy', null),
-- 5 · WhatsApp & e-mail
('reply_drafter',        'whatsapp_email', 10, '{"en":"Reply Drafter","id":"Penyusun Balasan","ms":"Penggubal Balasan"}',
  '{"en":"Drafts a WhatsApp or e-mail reply to an enquiry; you edit and send.","id":"Menyusun balasan WhatsApp atau email untuk pertanyaan; Anda edit lalu kirim.","ms":"Menggubal balasan WhatsApp atau e-mel kepada pertanyaan; anda sunting dan hantar."}', 'core', '/leads', 'secretary_reply', null),
('followup_scheduler',   'whatsapp_email', 20, '{"en":"Follow-up Scheduler","id":"Penjadwal Tindak Lanjut","ms":"Penjadual Susulan"}',
  '{"en":"Reminds you who has waited too long and proposes the next message.","id":"Mengingatkan siapa yang sudah menunggu terlalu lama dan mengusulkan pesan berikutnya.","ms":"Mengingatkan siapa yang telah menunggu terlalu lama dan mencadangkan mesej seterusnya."}', 'core', '/tasks', 'task_extract', null),
('email_composer',       'whatsapp_email', 30, '{"en":"E-mail Composer","id":"Penyusun Email","ms":"Penggubal E-mel"}',
  '{"en":"Longer-form e-mails: owner updates, viewing confirmations, offers.","id":"Email yang lebih panjang: pembaruan pemilik, konfirmasi kunjungan, penawaran.","ms":"E-mel lebih panjang: kemas kini pemilik, pengesahan lawatan, tawaran."}', 'core', '/leads', 'secretary_reply', null),
-- 6 · Leads, CRM & qualification
('lead_qualifier',       'leads_crm', 10, '{"en":"Lead Qualifier","id":"Penilai Prospek","ms":"Penilai Petunjuk"}',
  '{"en":"An intent score with the reason in words. It sorts; it never hides a lead.","id":"Skor minat dengan alasan dalam kata-kata. Mengurutkan, tidak pernah menyembunyikan prospek.","ms":"Skor niat dengan sebab dalam perkataan. Ia menyusun; tidak pernah menyembunyikan petunjuk."}', 'core', '/leads', 'lead_qualify', null),
('duplicate_detector',   'leads_crm', 20, '{"en":"Duplicate Detector","id":"Pendeteksi Duplikat","ms":"Pengesan Pendua"}',
  '{"en":"Warns when the same phone number arrives as two leads.","id":"Memperingatkan bila nomor telepon yang sama masuk sebagai dua prospek.","ms":"Memberi amaran apabila nombor telefon yang sama tiba sebagai dua petunjuk."}', 'core', '/leads', null, null),
('silence_radar',        'leads_crm', 30, '{"en":"Silence Radar","id":"Radar Senyap","ms":"Radar Senyap"}',
  '{"en":"Flags leads going cold before they are lost.","id":"Menandai prospek yang mulai dingin sebelum hilang.","ms":"Menanda petunjuk yang semakin dingin sebelum hilang."}', 'core', '/leads', null, null),
-- 7 · Property matching
('property_matcher',     'property_matching', 10, '{"en":"Property Matcher","id":"Pencocok Properti","ms":"Pemadan Hartanah"}',
  '{"en":"Your own and pool listings that fit a lead or requirement, same country only.","id":"Listing Anda dan listing pool yang cocok dengan prospek atau kebutuhan, hanya negara yang sama.","ms":"Penyenaraian anda dan kolam yang sepadan dengan petunjuk atau keperluan, negara yang sama sahaja."}', 'core', '/leads', 'match_rationale', null),
('buyer_profiler',       'property_matching', 20, '{"en":"Buyer Profile Builder","id":"Penyusun Profil Pembeli","ms":"Pembina Profil Pembeli"}',
  '{"en":"Turns a chat into a structured requirement you confirm.","id":"Mengubah percakapan menjadi kebutuhan terstruktur yang Anda konfirmasi.","ms":"Menukar perbualan menjadi keperluan berstruktur yang anda sahkan."}', 'core', '/requests/new', 'task_extract', null),
('alternative_finder',   'property_matching', 30, '{"en":"Alternative Finder","id":"Pencari Alternatif","ms":"Pencari Alternatif"}',
  '{"en":"Three alternatives when the first choice falls through.","id":"Tiga alternatif bila pilihan pertama gagal.","ms":"Tiga alternatif apabila pilihan pertama gagal."}', 'core', '/leads', 'match_rationale', null),
-- 8 · Appointments & follow-up
('task_planner',         'appointments', 10, '{"en":"Task Planner","id":"Perencana Tugas","ms":"Perancang Tugas"}',
  '{"en":"Proposes tasks from your leads and brief; you confirm each one.","id":"Mengusulkan tugas dari prospek dan brief Anda; Anda konfirmasi satu per satu.","ms":"Mencadangkan tugas daripada petunjuk dan taklimat anda; anda sahkan setiap satu."}', 'core', '/tasks', 'task_extract', null),
('viewing_coordinator',  'appointments', 20, '{"en":"Viewing Coordinator","id":"Koordinator Kunjungan","ms":"Penyelaras Lawatan"}',
  '{"en":"Proposes viewing slots and drafts the confirmation.","id":"Mengusulkan jadwal kunjungan dan menyusun konfirmasinya.","ms":"Mencadangkan slot lawatan dan menggubal pengesahan."}', 'core', '/tasks', 'secretary_reply', null),
('reminder_assistant',   'appointments', 30, '{"en":"Reminder Assistant","id":"Asisten Pengingat","ms":"Pembantu Peringatan"}',
  '{"en":"Reminds you and, with consent, the client before a viewing.","id":"Mengingatkan Anda dan, dengan persetujuan, klien sebelum kunjungan.","ms":"Mengingatkan anda dan, dengan persetujuan, pelanggan sebelum lawatan."}', 'core', '/tasks', null, null),
-- 9 · Sales & transaction
('objection_coach',      'sales_transaction', 10, '{"en":"Objection Coach","id":"Pelatih Keberatan","ms":"Jurulatih Bantahan"}',
  '{"en":"Practise the objection you are about to face. Opens AG Sales Lab for linked Hero agents.","id":"Berlatih menghadapi keberatan yang akan Anda temui. Membuka AG Sales Lab bagi agen Hero tertaut.","ms":"Berlatih bantahan yang bakal anda hadapi. Membuka AG Sales Lab untuk ejen Hero berpaut."}', 'core', null, null, 'https://hero.iqiaggroup.com/lab'),
('offer_summariser',     'sales_transaction', 20, '{"en":"Offer Summary Writer","id":"Penulis Ringkasan Penawaran","ms":"Penulis Ringkasan Tawaran"}',
  '{"en":"A plain-language summary of an offer for owner and buyer.","id":"Ringkasan penawaran dalam bahasa sederhana untuk pemilik dan pembeli.","ms":"Ringkasan tawaran dalam bahasa mudah untuk pemilik dan pembeli."}', 'core', null, 'secretary_reply', null),
('closing_checklist',    'sales_transaction', 30, '{"en":"Closing Checklist","id":"Daftar Periksa Penutupan","ms":"Senarai Semak Penutupan"}',
  '{"en":"The documents and steps between accepted offer and keys, per country.","id":"Dokumen dan langkah antara penawaran diterima hingga serah kunci, per negara.","ms":"Dokumen dan langkah antara tawaran diterima dan kunci, mengikut negara."}', 'core', null, null, null),
-- 10 · Administration & productivity
('ai_manager',           'admin_productivity', 10, '{"en":"AI Manager","id":"Manajer AI","ms":"Pengurus AI"}',
  '{"en":"Your morning brief: what to do now, in order, with a link to each.","id":"Brief pagi Anda: apa yang harus dilakukan sekarang, berurutan, dengan tautan ke masing-masing.","ms":"Taklimat pagi anda: apa yang perlu dibuat sekarang, mengikut urutan, dengan pautan ke setiap satu."}', 'core', '/dashboard', 'brief', null),
('owner_report_writer',  'admin_productivity', 20, '{"en":"Owner Report Writer","id":"Penulis Laporan Pemilik","ms":"Penulis Laporan Pemilik"}',
  '{"en":"Weekly owner update: views, enquiries, viewings, next step.","id":"Laporan mingguan pemilik: tayangan, pertanyaan, kunjungan, langkah berikutnya.","ms":"Kemas kini mingguan pemilik: tontonan, pertanyaan, lawatan, langkah seterusnya."}', 'core', null, 'studio_copy', null),
('document_summariser',  'admin_productivity', 30, '{"en":"Document Summariser","id":"Peringkas Dokumen","ms":"Peringkas Dokumen"}',
  '{"en":"Summarises a long document you upload; you verify anything legal or financial.","id":"Meringkas dokumen panjang yang Anda unggah; Anda verifikasi hal hukum atau keuangan.","ms":"Meringkaskan dokumen panjang yang anda muat naik; anda sahkan perkara undang-undang atau kewangan."}', 'premium', null, null, null),
-- 11 · Team management & training
('team_coach',           'team_training', 10, '{"en":"Team Coach","id":"Pelatih Tim","ms":"Jurulatih Pasukan"}',
  '{"en":"Communication practice with feedback. Opens Hero AI Coach for linked agents.","id":"Latihan komunikasi dengan umpan balik. Membuka Hero AI Coach bagi agen tertaut.","ms":"Latihan komunikasi dengan maklum balas. Membuka Hero AI Coach untuk ejen berpaut."}', 'core', null, null, 'https://hero.iqiaggroup.com/coach-ai'),
('onboarding_guide',     'team_training', 20, '{"en":"Onboarding Guide","id":"Pemandu Orientasi","ms":"Panduan Penerimaan"}',
  '{"en":"Walks a new agent through their first listing, lead and viewing.","id":"Memandu agen baru melalui listing, prospek, dan kunjungan pertamanya.","ms":"Membimbing ejen baharu melalui penyenaraian, petunjuk dan lawatan pertama."}', 'core', '/training', null, null),
('performance_reviewer', 'team_training', 30, '{"en":"Performance Reviewer","id":"Peninjau Kinerja","ms":"Penilai Prestasi"}',
  '{"en":"A weekly insight against your own past first, anonymised peers second.","id":"Wawasan mingguan terhadap riwayat Anda sendiri dulu, lalu rekan anonim.","ms":"Pandangan mingguan berbanding rekod anda dahulu, rakan sebaya tanpa nama kemudian."}', 'core', '/dashboard', 'brief', null),
-- 12 · International research & collaboration
('crossborder_researcher','international', 10, '{"en":"Cross-border Researcher","id":"Peneliti Lintas Negara","ms":"Penyelidik Rentas Sempadan"}',
  '{"en":"What a buyer from the other market needs to know before they enquire.","id":"Apa yang perlu diketahui pembeli dari pasar lain sebelum bertanya.","ms":"Apa yang pembeli dari pasaran lain perlu tahu sebelum bertanya."}', 'core', null, null, null),
('translation_assistant','international', 20, '{"en":"Translation Assistant","id":"Asisten Terjemahan","ms":"Pembantu Terjemahan"}',
  '{"en":"Your listing or reply in the other language, kept factual.","id":"Listing atau balasan Anda dalam bahasa lain, tetap faktual.","ms":"Penyenaraian atau balasan anda dalam bahasa lain, kekal berfakta."}', 'core', null, 'secretary_reply', null),
('partner_finder',       'international', 30, '{"en":"Partner Finder","id":"Pencari Mitra","ms":"Pencari Rakan Kongsi"}',
  '{"en":"Agents in the other market who co-broke in your category.","id":"Agen di pasar lain yang berkolaborasi di kategori Anda.","ms":"Ejen di pasaran lain yang berkongsi broker dalam kategori anda."}', 'core', '/collab/pool', null, null);

comment on table public.ai_roles is 'The AI Workforce directory: 36 roles as data. status flips to live in the migration that ships the capability.';
