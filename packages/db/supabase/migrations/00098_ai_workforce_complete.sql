-- =============================================================================
-- 00098 — The rest of the AI Workforce goes live (8 Nov 2026)
--
-- Nineteen roles were still "planned". Each one now has a surface and, where
-- a model helps, a metered feature behind the one engine (runAi). The rules
-- below are what makes them trustworthy rather than merely present:
--
--   * every text role keeps a deterministic floor (no key → still useful);
--   * legal and procedural FACTS live in tables, seeded as DRAFT, and are
--     shown as draft until an admin marks them verified — the model may only
--     rephrase a fact it was given, never supply one;
--   * nothing is written to a listing, a lead or a client without the agent;
--   * new tables carry RLS; writes that matter go through guarded functions.
--
-- Owner decision 8 Nov 2026: the characters are the same in every market and
-- stand beside the agent on the screen where they work.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Features the new roles draw on (admin re-routes them from /admin/ai)
-- -----------------------------------------------------------------------------
update public.ai_models
   set provider = 'gemini', model = 'gemini-3.8-flash',
       fallback_provider = 'anthropic', fallback_model = 'claude-sonnet-5-5',
       max_output_tokens = 1400, description = 'Video Script Writer: a 30-second walkthrough script with a shot list',
       updated_at = now()
 where feature = 'video_script';

update public.ai_models
   set description = 'Reserved for AI-generated poster artwork. Template posters render in the agent''s browser and need no model.',
       updated_at = now()
 where feature = 'poster_image';

insert into public.ai_models (feature, description, provider, model, fallback_provider, fallback_model, max_output_tokens, tier) values
  ('social_plan',        'Social Calendar Planner: a week of posts across the agent''s listings',          'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 2200, 'standard'),
  ('photo_check',        'Photo Checker: blur, people, documents, plates and watermarks in listing photos', 'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-haiku-5-5',  900,  'premium'),
  ('listing_research',   'Listing Researcher: comparables around a property, summarised',                 'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-haiku-5-5',  600,  'standard'),
  ('owner_outreach',     'Owner Outreach Drafter: the first message to a prospective owner',             'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 600,  'standard'),
  ('owner_report',       'Owner Report Writer: the weekly update to a listing''s owner',                  'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 900,  'standard'),
  ('document_summary',   'Document Summariser: a long document the agent uploads, summarised',           'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 1400, 'premium'),
  ('translate',          'Translation Assistant: a listing or a reply in the other language',            'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 1600, 'standard'),
  ('crossborder_brief',  'Cross-border Researcher: verified market facts tailored to one listing',       'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 1000, 'standard'),
  ('requirement_extract','Buyer Profile Builder: a chat turned into a structured requirement',           'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-haiku-5-5',  700,  'standard'),
  ('coach',              'Objection Coach and Team Coach: practice with feedback',                       'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-sonnet-5-5', 1100, 'standard'),
  ('offer_summary',      'Offer Summary Writer: an offer in plain language for owner and buyer',         'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-haiku-5-5',  700,  'standard'),
  ('weekly_review',      'Performance Reviewer: a weekly insight against the agent''s own past',         'gemini', 'gemini-3.8-flash', 'anthropic', 'claude-haiku-5-5',  600,  'standard')
on conflict (feature) do nothing;

-- -----------------------------------------------------------------------------
-- 2 · Market facts — what a buyer from the other market needs to know
--     Seeded as DRAFT. An admin verifies each one on /admin/ai; agents see the
--     draft label until then. Retired rows disappear from agents.
-- -----------------------------------------------------------------------------
create table public.market_facts (
  id            uuid primary key default gen_random_uuid(),
  country_code  text not null references public.countries(code),
  audience      text not null default 'foreign_buyer'
                check (audience in ('foreign_buyer', 'local_buyer', 'landlord', 'tenant')),
  topic         text not null,
  position      integer not null default 0,
  body          jsonb not null,            -- {"en": …, "id": …, "ms": …}
  source_url    text,
  status        text not null default 'draft' check (status in ('draft', 'verified', 'retired')),
  verified_by   uuid references auth.users(id) on delete set null,
  verified_at   timestamptz,
  updated_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now()
);
create index idx_market_facts_country on public.market_facts (country_code, audience, position);
alter table public.market_facts enable row level security;
create policy "market facts read"  on public.market_facts for select to authenticated
  using (status <> 'retired' or public.has_capability('ai.manage'));
create policy "market facts admin" on public.market_facts for all to authenticated
  using (public.has_capability('ai.manage')) with check (public.has_capability('ai.manage'));
revoke all on public.market_facts from anon;
create trigger market_facts_updated_at before update on public.market_facts
  for each row execute function public.set_updated_at();

insert into public.market_facts (country_code, audience, topic, position, body) values
-- Malaysia, for a buyer from abroad -------------------------------------------
('MY', 'foreign_buyer', 'eligibility', 10, $j${"en":"Foreign individuals and foreign companies may buy residential property in Malaysia, but every purchase needs the consent of the State Authority of the state where the property sits. Consent is applied for per transaction and takes weeks to months depending on the state.","id":"Warga negara asing dan perusahaan asing boleh membeli properti hunian di Malaysia, tetapi setiap pembelian memerlukan persetujuan Otoritas Negara Bagian tempat properti berada. Persetujuan diajukan per transaksi dan memakan waktu beberapa minggu hingga bulan tergantung negara bagian.","ms":"Individu asing dan syarikat asing boleh membeli hartanah kediaman di Malaysia, tetapi setiap pembelian memerlukan kebenaran Pihak Berkuasa Negeri tempat hartanah itu terletak. Kebenaran dipohon bagi setiap transaksi dan mengambil masa beberapa minggu hingga bulan bergantung pada negeri."}$j$),
('MY', 'foreign_buyer', 'minimum_price', 20, $j${"en":"Each state sets a minimum purchase price for foreign buyers. RM1,000,000 is the common floor; some states and zones set it higher (parts of Selangor and Penang island, for example) and some lower for MM2H holders. Confirm the current threshold of the state before quoting a unit as available to a foreigner.","id":"Setiap negara bagian menetapkan harga pembelian minimum untuk pembeli asing. RM1.000.000 adalah batas bawah yang umum; beberapa negara bagian dan zona menetapkannya lebih tinggi (misalnya sebagian Selangor dan Pulau Pinang) dan sebagian lebih rendah untuk pemegang MM2H. Pastikan ambang batas negara bagian yang berlaku sebelum menawarkan unit kepada orang asing.","ms":"Setiap negeri menetapkan harga belian minimum untuk pembeli asing. RM1,000,000 ialah paras lazim; sesetengah negeri dan zon menetapkannya lebih tinggi (sebahagian Selangor dan Pulau Pinang, misalnya) dan sesetengahnya lebih rendah untuk pemegang MM2H. Sahkan ambang semasa negeri berkenaan sebelum menawarkan unit kepada warga asing."}$j$),
('MY', 'foreign_buyer', 'restrictions', 30, $j${"en":"Foreigners cannot buy Malay Reserve land, units under the Bumiputera quota, low- and medium-cost housing, or most agricultural land. Properties on state-alienated land may carry extra conditions in the title.","id":"Orang asing tidak dapat membeli tanah Rizab Melayu, unit kuota Bumiputera, perumahan murah dan menengah, atau sebagian besar tanah pertanian. Properti di atas tanah negara bagian dapat memuat syarat tambahan dalam sertifikatnya.","ms":"Warga asing tidak boleh membeli tanah Rizab Melayu, unit kuota Bumiputera, perumahan kos rendah dan sederhana, atau kebanyakan tanah pertanian. Hartanah di atas tanah kerajaan negeri mungkin membawa syarat tambahan dalam hak milik."}$j$),
('MY', 'foreign_buyer', 'title_types', 40, $j${"en":"Freehold and leasehold (typically 99 years) both exist; apartments and condominiums carry strata titles. A leasehold transfer needs state consent for every buyer; a foreign buyer needs it for every title type.","id":"Freehold dan leasehold (umumnya 99 tahun) keduanya ada; apartemen dan kondominium memiliki sertifikat strata. Pengalihan leasehold memerlukan persetujuan negara bagian untuk setiap pembeli; pembeli asing memerlukannya untuk semua jenis sertifikat.","ms":"Pegangan bebas dan pajakan (lazimnya 99 tahun) kedua-duanya wujud; pangsapuri dan kondominium membawa hak milik strata. Pindah milik pajakan memerlukan kebenaran negeri bagi setiap pembeli; pembeli asing memerlukannya bagi semua jenis hak milik."}$j$),
('MY', 'foreign_buyer', 'taxes_buying', 50, $j${"en":"Stamp duty on the transfer is a flat 4% of the price for foreign buyers (from 1 January 2024), plus 0.5% on the loan agreement and legal fees on a scale. The Sale and Purchase Agreement is normally signed within 14 days of the booking.","id":"Bea meterai atas pengalihan adalah 4% tetap dari harga untuk pembeli asing (sejak 1 Januari 2024), ditambah 0,5% atas perjanjian pinjaman dan biaya hukum berskala. Perjanjian Jual Beli biasanya ditandatangani dalam 14 hari sejak pemesanan.","ms":"Duti setem pindah milik ialah kadar rata 4% daripada harga untuk pembeli asing (mulai 1 Januari 2024), ditambah 0.5% atas perjanjian pinjaman dan yuran guaman mengikut skala. Perjanjian Jual Beli biasanya ditandatangani dalam 14 hari selepas tempahan."}$j$),
('MY', 'foreign_buyer', 'taxes_selling', 60, $j${"en":"Real Property Gains Tax for non-citizens is 30% on a disposal within five years of purchase and 10% from the sixth year. The buyer's lawyer retains 7% of the price for the tax authority at sale.","id":"Pajak Keuntungan Properti (RPGT) untuk bukan warga negara adalah 30% jika dijual dalam lima tahun sejak pembelian dan 10% mulai tahun keenam. Pengacara pembeli menahan 7% dari harga untuk otoritas pajak saat penjualan.","ms":"Cukai Keuntungan Harta Tanah untuk bukan warganegara ialah 30% bagi pelupusan dalam tempoh lima tahun dari pembelian dan 10% mulai tahun keenam. Peguam pembeli menahan 7% daripada harga untuk pihak berkuasa cukai semasa jualan."}$j$),
('MY', 'foreign_buyer', 'financing', 70, $j${"en":"Local banks lend to foreigners selectively, typically 60–70% of value against income documents; MM2H holders get better terms. Budget cash for the balance, the stamp duties and the legal fees.","id":"Bank lokal memberi pinjaman kepada orang asing secara selektif, umumnya 60–70% dari nilai dengan dokumen penghasilan; pemegang MM2H mendapat syarat lebih baik. Siapkan dana tunai untuk sisanya, bea meterai dan biaya hukum.","ms":"Bank tempatan memberi pinjaman kepada warga asing secara terpilih, lazimnya 60–70% daripada nilai dengan dokumen pendapatan; pemegang MM2H mendapat terma lebih baik. Peruntukkan tunai untuk baki, duti setem dan yuran guaman."}$j$),
('MY', 'foreign_buyer', 'process', 80, $j${"en":"Booking and earnest deposit → Sale and Purchase Agreement within 14 days → state consent application → loan → stamping → Memorandum of Transfer (Form 14A) at the land office → vacant possession. Expect three to six months for a completed unit.","id":"Pemesanan dan uang tanda jadi → Perjanjian Jual Beli dalam 14 hari → permohonan persetujuan negara bagian → pinjaman → meterai → Memorandum Pengalihan (Form 14A) di kantor pertanahan → serah terima. Perkirakan tiga hingga enam bulan untuk unit yang sudah jadi.","ms":"Tempahan dan deposit cagaran → Perjanjian Jual Beli dalam 14 hari → permohonan kebenaran negeri → pinjaman → penyeteman → Memorandum Pindah Milik (Borang 14A) di pejabat tanah → milikan kosong. Jangkakan tiga hingga enam bulan bagi unit siap."}$j$),
('MY', 'foreign_buyer', 'holding_costs', 90, $j${"en":"Owners pay annual quit rent and assessment to the state and local council, plus strata maintenance and sinking fund for apartments. Rental income is taxed in Malaysia: a non-resident pays a flat 30% with no reliefs and needs a local tax file.","id":"Pemilik membayar cukai tanah dan cukai pintu tahunan kepada negara bagian dan dewan kota, ditambah biaya pemeliharaan strata dan dana cadangan untuk apartemen. Pendapatan sewa dikenai pajak di Malaysia: bukan penduduk membayar 30% tetap tanpa keringanan dan perlu nomor pajak lokal.","ms":"Pemilik membayar cukai tanah dan cukai taksiran tahunan kepada negeri dan pihak berkuasa tempatan, serta caj penyenggaraan strata dan kumpulan wang penjelas bagi pangsapuri. Pendapatan sewa dicukai di Malaysia: bukan pemastautin membayar kadar rata 30% tanpa pelepasan dan memerlukan fail cukai tempatan."}$j$),
('MY', 'foreign_buyer', 'visas', 100, $j${"en":"Buying property gives no right to live in Malaysia. The long-stay route is Malaysia My Second Home (MM2H), revised in 2024 into tiers with their own deposit and purchase conditions.","id":"Membeli properti tidak memberi hak tinggal di Malaysia. Jalur tinggal jangka panjang adalah Malaysia My Second Home (MM2H), yang direvisi pada 2024 menjadi beberapa tingkatan dengan syarat deposit dan pembelian masing-masing.","ms":"Membeli hartanah tidak memberi hak menetap di Malaysia. Laluan tinggal jangka panjang ialah Malaysia My Second Home (MM2H), yang disemak pada 2024 kepada beberapa peringkat dengan syarat deposit dan pembelian tersendiri."}$j$),
-- Indonesia, for a buyer from abroad ------------------------------------------
('ID', 'foreign_buyer', 'eligibility', 10, $j${"en":"A foreigner who holds an Indonesian visa or stay permit (a visit visa is enough since Government Regulation 18/2021; KITAS/KITAP also qualify) may own a landed house or an apartment on Hak Pakai (right to use) title, or a strata unit built on Hak Pakai land. Hak Milik (freehold) is for Indonesian citizens only.","id":"Orang asing yang memiliki visa atau izin tinggal Indonesia (visa kunjungan sudah cukup sejak PP 18/2021; KITAS/KITAP juga memenuhi syarat) dapat memiliki rumah tapak atau apartemen dengan Hak Pakai, atau satuan rumah susun di atas tanah Hak Pakai. Hak Milik hanya untuk Warga Negara Indonesia.","ms":"Warga asing yang memegang visa atau permit tinggal Indonesia (visa lawatan memadai sejak Peraturan Kerajaan 18/2021; KITAS/KITAP juga layak) boleh memiliki rumah bertanah atau pangsapuri di bawah hak milik Hak Pakai (hak guna), atau unit strata di atas tanah Hak Pakai. Hak Milik (pegangan bebas) hanya untuk warganegara Indonesia."}$j$),
('ID', 'foreign_buyer', 'minimum_price', 20, $j${"en":"Minimum prices for foreign buyers are set per province by the Ministry of Agrarian Affairs (ATR/BPN). In DKI Jakarta the floor is IDR 5 billion for a landed house and IDR 3 billion for an apartment; other provinces are lower. Check the current ministerial decree for the province before quoting.","id":"Harga minimum untuk pembeli asing ditetapkan per provinsi oleh Kementerian ATR/BPN. Di DKI Jakarta batasnya Rp5 miliar untuk rumah tapak dan Rp3 miliar untuk apartemen; provinsi lain lebih rendah. Periksa keputusan menteri yang berlaku untuk provinsi tersebut sebelum menawarkan.","ms":"Harga minimum untuk pembeli asing ditetapkan mengikut wilayah oleh Kementerian Agraria (ATR/BPN). Di DKI Jakarta parasnya IDR 5 bilion untuk rumah bertanah dan IDR 3 bilion untuk pangsapuri; wilayah lain lebih rendah. Semak keputusan menteri semasa bagi wilayah itu sebelum menawarkan."}$j$),
('ID', 'foreign_buyer', 'restrictions', 30, $j${"en":"One landed house per person or family, within the land-area cap in the regulation, not subsidised housing, and in a residential zone. Holding property through an Indonesian nominee is unlawful and the arrangement is unenforceable.","id":"Satu rumah tapak per orang atau keluarga, dalam batas luas tanah menurut peraturan, bukan rumah subsidi, dan berada di zona hunian. Memiliki properti lewat nominee WNI melanggar hukum dan perjanjiannya tidak dapat dipaksakan.","ms":"Satu rumah bertanah bagi setiap orang atau keluarga, dalam had keluasan tanah mengikut peraturan, bukan perumahan bersubsidi, dan dalam zon kediaman. Memegang hartanah melalui nomini warga Indonesia adalah menyalahi undang-undang dan perjanjian itu tidak boleh dikuatkuasakan."}$j$),
('ID', 'foreign_buyer', 'title_types', 40, $j${"en":"Hak Milik (freehold, citizens only); Hak Guna Bangunan (right to build, 30 + 20 + 30 years, Indonesian companies including PT PMA); Hak Pakai (right to use, 30 + 20 + 30 years, the title a foreign individual holds); strata units follow the land title they stand on.","id":"Hak Milik (hanya WNI); Hak Guna Bangunan (30 + 20 + 30 tahun, badan hukum Indonesia termasuk PT PMA); Hak Pakai (30 + 20 + 30 tahun, hak yang dipegang orang asing perorangan); satuan rumah susun mengikuti hak atas tanah tempatnya berdiri.","ms":"Hak Milik (pegangan bebas, warganegara sahaja); Hak Guna Bangunan (hak membina, 30 + 20 + 30 tahun, syarikat Indonesia termasuk PT PMA); Hak Pakai (hak guna, 30 + 20 + 30 tahun, hak milik yang dipegang individu asing); unit strata mengikut hak tanah tempat ia berdiri."}$j$),
('ID', 'foreign_buyer', 'taxes_buying', 50, $j${"en":"The buyer pays BPHTB (acquisition duty) of 5% on the price above the regional tax-free threshold; new units from a developer carry VAT (PPN) of 11% and, above the thresholds, luxury sales tax (PPnBM). Notary/PPAT fees are around 1% and the name transfer at BPN has its own fee.","id":"Pembeli membayar BPHTB 5% atas harga di atas NPOPTKP daerah; unit baru dari pengembang dikenai PPN 11% dan, di atas ambang tertentu, PPnBM. Biaya notaris/PPAT sekitar 1% dan balik nama di BPN memiliki biaya tersendiri.","ms":"Pembeli membayar BPHTB (duti pemerolehan) 5% ke atas harga melebihi ambang bebas cukai wilayah; unit baharu daripada pemaju dikenakan PPN 11% dan, melebihi ambang, cukai jualan mewah (PPnBM). Yuran notari/PPAT sekitar 1% dan pindah nama di BPN ada yurannya sendiri."}$j$),
('ID', 'foreign_buyer', 'taxes_selling', 60, $j${"en":"The seller pays final income tax (PPh) of 2.5% of the transaction value. The deed of sale (AJB) is signed before a PPAT only after both the seller's PPh and the buyer's BPHTB are paid.","id":"Penjual membayar PPh final 2,5% dari nilai transaksi. Akta Jual Beli (AJB) ditandatangani di hadapan PPAT hanya setelah PPh penjual dan BPHTB pembeli dibayar.","ms":"Penjual membayar cukai pendapatan muktamad (PPh) 2.5% daripada nilai transaksi. Surat ikatan jualan (AJB) ditandatangani di hadapan PPAT hanya selepas PPh penjual dan BPHTB pembeli dibayar."}$j$),
('ID', 'foreign_buyer', 'financing', 70, $j$ {"en":"Indonesian banks rarely lend to foreign individuals; plan for a cash purchase or a developer instalment scheme. Funds for the deed must pass through an Indonesian bank account in rupiah.","id":"Bank di Indonesia jarang memberi KPR kepada orang asing perorangan; rencanakan pembelian tunai atau skema cicilan pengembang. Dana untuk akta harus melalui rekening bank Indonesia dalam rupiah.","ms":"Bank Indonesia jarang memberi pinjaman kepada individu asing; rancang pembelian tunai atau skim ansuran pemaju. Dana untuk surat ikatan mesti melalui akaun bank Indonesia dalam rupiah."}$j$),
('ID', 'foreign_buyer', 'process', 80, $j${"en":"Booking → PPJB (binding sale agreement before a notary) → payment → tax payments (seller PPh, buyer BPHTB) → AJB before the PPAT → registration of the title at BPN (balik nama). One to three months for a completed unit; off-plan follows the developer's schedule.","id":"Pemesanan → PPJB di hadapan notaris → pembayaran → pembayaran pajak (PPh penjual, BPHTB pembeli) → AJB di hadapan PPAT → pendaftaran balik nama di BPN. Satu hingga tiga bulan untuk unit siap; unit inden mengikuti jadwal pengembang.","ms":"Tempahan → PPJB (perjanjian jualan mengikat di hadapan notari) → bayaran → bayaran cukai (PPh penjual, BPHTB pembeli) → AJB di hadapan PPAT → pendaftaran hak milik di BPN (balik nama). Satu hingga tiga bulan bagi unit siap; unit dalam pembinaan mengikut jadual pemaju."}$j$),
('ID', 'foreign_buyer', 'holding_costs', 90, $j${"en":"Owners pay annual land and building tax (PBB), strata service charges and sinking fund, and utilities. Rental income from Indonesian property is taxed in Indonesia at a final 10% of gross rent for individuals, usually withheld by a corporate tenant.","id":"Pemilik membayar PBB tahunan, iuran pengelolaan dan dana cadangan rumah susun, serta utilitas. Pendapatan sewa dari properti di Indonesia dikenai PPh final 10% dari sewa bruto untuk orang pribadi, biasanya dipotong oleh penyewa badan usaha.","ms":"Pemilik membayar cukai tanah dan bangunan tahunan (PBB), caj perkhidmatan strata dan kumpulan wang penjelas, serta utiliti. Pendapatan sewa daripada hartanah Indonesia dicukai di Indonesia pada kadar muktamad 10% daripada sewa kasar bagi individu, biasanya dipotong oleh penyewa korporat."}$j$),
('ID', 'foreign_buyer', 'visas', 100, $j${"en":"Owning property gives no right to stay. A visit visa is enough to buy; living in Indonesia needs a limited stay permit (KITAS) or the Second Home visa, each with its own financial conditions.","id":"Memiliki properti tidak memberi hak tinggal. Visa kunjungan cukup untuk membeli; tinggal di Indonesia memerlukan KITAS atau visa Second Home, masing-masing dengan syarat keuangan tersendiri.","ms":"Memiliki hartanah tidak memberi hak menetap. Visa lawatan memadai untuk membeli; menetap di Indonesia memerlukan permit tinggal terhad (KITAS) atau visa Second Home, masing-masing dengan syarat kewangan tersendiri."}$j$);

-- -----------------------------------------------------------------------------
-- 3 · Closing steps — accepted offer to keys, per country and transaction
--     Seeded DRAFT; verified by an admin. Agents tick them per deal.
-- -----------------------------------------------------------------------------
create table public.closing_steps (
  id               uuid primary key default gen_random_uuid(),
  country_code     text not null references public.countries(code),
  transaction_type text not null check (transaction_type in ('sale', 'rent')),
  position         integer not null,
  title            jsonb not null,
  detail           jsonb not null default '{}'::jsonb,
  owner_party      text not null default 'agent'
                   check (owner_party in ('agent', 'buyer', 'seller', 'landlord', 'tenant', 'lawyer', 'notary', 'bank', 'authority')),
  typical_days     integer,
  status           text not null default 'draft' check (status in ('draft', 'verified', 'retired')),
  verified_by      uuid references auth.users(id) on delete set null,
  verified_at      timestamptz,
  updated_by       uuid references auth.users(id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (country_code, transaction_type, position)
);
alter table public.closing_steps enable row level security;
create policy "closing steps read"  on public.closing_steps for select to authenticated
  using (status <> 'retired' or public.has_capability('ai.manage'));
create policy "closing steps admin" on public.closing_steps for all to authenticated
  using (public.has_capability('ai.manage')) with check (public.has_capability('ai.manage'));
revoke all on public.closing_steps from anon;
create trigger closing_steps_updated_at before update on public.closing_steps
  for each row execute function public.set_updated_at();

insert into public.closing_steps (country_code, transaction_type, position, owner_party, typical_days, title, detail) values
-- Malaysia · sale
('MY', 'sale', 10, 'buyer',     1,  $j${"en":"Letter of Offer signed and earnest deposit paid","id":"Letter of Offer ditandatangani dan uang tanda jadi dibayar","ms":"Surat Tawaran ditandatangani dan deposit cagaran dibayar"}$j$, $j${"en":"Usually 2–3% of the price, held by the agency or the lawyer as stakeholder.","id":"Biasanya 2–3% dari harga, dipegang agensi atau pengacara sebagai pemegang dana.","ms":"Lazimnya 2–3% daripada harga, dipegang oleh agensi atau peguam sebagai pemegang amanah."}$j$),
('MY', 'sale', 20, 'lawyer',    3,  $j${"en":"Lawyers appointed; title search and caveat check","id":"Pengacara ditunjuk; pengecekan sertifikat dan kaveat","ms":"Peguam dilantik; carian hak milik dan semakan kaveat"}$j$, $j${"en":"Confirms the registered owner, encumbrances, restrictions in interest and any private caveat.","id":"Memastikan pemilik terdaftar, beban, pembatasan kepentingan dan kaveat pribadi.","ms":"Mengesahkan pemilik berdaftar, bebanan, sekatan kepentingan dan sebarang kaveat persendirian."}$j$),
('MY', 'sale', 30, 'buyer',     14, $j${"en":"Sale and Purchase Agreement signed; deposit topped up to 10%","id":"Perjanjian Jual Beli ditandatangani; uang muka digenapkan 10%","ms":"Perjanjian Jual Beli ditandatangani; deposit dicukupkan kepada 10%"}$j$, $j${"en":"Within 14 days of the Letter of Offer unless extended in writing.","id":"Dalam 14 hari sejak Letter of Offer kecuali diperpanjang tertulis.","ms":"Dalam 14 hari dari Surat Tawaran melainkan dilanjutkan secara bertulis."}$j$),
('MY', 'sale', 40, 'bank',      30, $j${"en":"Loan application and bank Letter of Offer (if financing)","id":"Pengajuan pinjaman dan Letter of Offer bank (jika dibiayai)","ms":"Permohonan pinjaman dan Surat Tawaran bank (jika dibiayai)"}$j$, $j${"en":"Valuation, income documents, approval. Diary the loan condition deadline in the SPA.","id":"Penilaian, dokumen penghasilan, persetujuan. Catat tenggat syarat pinjaman dalam SPA.","ms":"Penilaian, dokumen pendapatan, kelulusan. Catat tarikh akhir syarat pinjaman dalam SPA."}$j$),
('MY', 'sale', 50, 'authority', 60, $j${"en":"State Authority consent (foreign buyer or leasehold title)","id":"Persetujuan Otoritas Negara Bagian (pembeli asing atau leasehold)","ms":"Kebenaran Pihak Berkuasa Negeri (pembeli asing atau hak milik pajakan)"}$j$, $j${"en":"Applied for by the lawyer; one to three months is normal. The completion period usually runs from consent.","id":"Diajukan oleh pengacara; satu hingga tiga bulan adalah normal. Masa penyelesaian biasanya dihitung sejak persetujuan.","ms":"Dipohon oleh peguam; satu hingga tiga bulan adalah biasa. Tempoh penyempurnaan lazimnya bermula dari kebenaran."}$j$),
('MY', 'sale', 60, 'lawyer',    30, $j${"en":"SPA adjudicated and stamped; stamp duty paid","id":"SPA dinilai dan dimeterai; bea meterai dibayar","ms":"SPA ditaksir dan disetem; duti setem dibayar"}$j$, $j${"en":"Buyer pays the transfer duty (flat 4% for foreigners, scaled for citizens) within 30 days of adjudication.","id":"Pembeli membayar bea pengalihan (4% tetap untuk orang asing, berskala untuk warga negara) dalam 30 hari sejak penilaian.","ms":"Pembeli membayar duti pindah milik (kadar rata 4% untuk warga asing, berskala untuk warganegara) dalam 30 hari dari taksiran."}$j$),
('MY', 'sale', 70, 'lawyer',    30, $j${"en":"Loan and charge documents signed; RPGT forms lodged with LHDN","id":"Dokumen pinjaman dan charge ditandatangani; formulir RPGT dilaporkan ke LHDN","ms":"Dokumen pinjaman dan gadaian ditandatangani; borang CKHT difailkan dengan LHDN"}$j$, $j${"en":"Seller's and buyer's RPGT forms (CKHT 1A / 2A) within 60 days of the SPA; 7% retention for non-citizen sellers.","id":"Formulir RPGT penjual dan pembeli (CKHT 1A / 2A) dalam 60 hari sejak SPA; retensi 7% untuk penjual bukan warga negara.","ms":"Borang CKHT penjual dan pembeli (CKHT 1A / 2A) dalam 60 hari dari SPA; penahanan 7% bagi penjual bukan warganegara."}$j$),
('MY', 'sale', 80, 'bank',      90, $j${"en":"Balance purchase price released","id":"Sisa harga beli dicairkan","ms":"Baki harga belian dilepaskan"}$j$, $j${"en":"Typically three months from the unconditional date, with one month's extension at interest.","id":"Umumnya tiga bulan sejak tanggal tanpa syarat, dengan perpanjangan satu bulan berbunga.","ms":"Lazimnya tiga bulan dari tarikh tanpa syarat, dengan lanjutan sebulan berfaedah."}$j$),
('MY', 'sale', 90, 'authority', 42, $j${"en":"Memorandum of Transfer (Form 14A) presented; title registered in the buyer's name","id":"Memorandum Pengalihan (Form 14A) diajukan; sertifikat terdaftar atas nama pembeli","ms":"Memorandum Pindah Milik (Borang 14A) dikemukakan; hak milik didaftarkan atas nama pembeli"}$j$, $j${"en":"At the land office; two to eight weeks depending on the state.","id":"Di kantor pertanahan; dua hingga delapan minggu tergantung negara bagian.","ms":"Di pejabat tanah; dua hingga lapan minggu bergantung pada negeri."}$j$),
('MY', 'sale', 100, 'agent',    1,  $j${"en":"Vacant possession and keys; utilities and assessment transferred","id":"Serah terima dan kunci; utilitas dan cukai pintu dialihkan","ms":"Milikan kosong dan kunci; utiliti dan cukai taksiran dipindahkan"}$j$, $j${"en":"Inspect, record meter readings, hand over access cards and the maintenance account.","id":"Periksa, catat angka meter, serahkan kartu akses dan akun pemeliharaan.","ms":"Periksa, catat bacaan meter, serahkan kad akses dan akaun penyenggaraan."}$j$),
-- Malaysia · rent
('MY', 'rent', 10, 'tenant',    1,  $j${"en":"Letter of Offer and earnest deposit (one month)","id":"Letter of Offer dan uang tanda jadi (satu bulan)","ms":"Surat Tawaran dan deposit cagaran (satu bulan)"}$j$, $j${"en":"Becomes the first month's rent on signing.","id":"Menjadi sewa bulan pertama saat penandatanganan.","ms":"Menjadi sewa bulan pertama semasa menandatangani."}$j$),
('MY', 'rent', 20, 'agent',     7,  $j${"en":"Tenancy agreement signed and stamped at LHDN","id":"Perjanjian sewa ditandatangani dan dimeterai di LHDN","ms":"Perjanjian sewaan ditandatangani dan disetem di LHDN"}$j$, $j${"en":"Stamp duty on the annual rent scale; the stamped copy is what a court accepts.","id":"Bea meterai menurut skala sewa tahunan; salinan bermeterai yang diterima pengadilan.","ms":"Duti setem mengikut skala sewa tahunan; salinan bersetem itulah yang diterima mahkamah."}$j$),
('MY', 'rent', 30, 'tenant',    1,  $j${"en":"Security deposit (two months) and utility deposit (half month) paid","id":"Deposit jaminan (dua bulan) dan deposit utilitas (setengah bulan) dibayar","ms":"Deposit sekuriti (dua bulan) dan deposit utiliti (setengah bulan) dibayar"}$j$, $j${"en":"Held by the landlord; refundable at the end less agreed deductions.","id":"Dipegang pemilik; dikembalikan di akhir dikurangi potongan yang disepakati.","ms":"Dipegang tuan rumah; dipulangkan pada akhir tempoh tolak potongan yang dipersetujui."}$j$),
('MY', 'rent', 40, 'agent',     1,  $j${"en":"Handover inspection: inventory and meter readings recorded","id":"Inspeksi serah terima: inventaris dan angka meter dicatat","ms":"Pemeriksaan serahan: inventori dan bacaan meter direkodkan"}$j$, $j${"en":"Photos of every room and defect, signed by both sides.","id":"Foto setiap ruangan dan kerusakan, ditandatangani kedua pihak.","ms":"Gambar setiap bilik dan kecacatan, ditandatangani kedua-dua pihak."}$j$),
('MY', 'rent', 50, 'landlord',  1,  $j${"en":"Keys and access cards handed over; move-in","id":"Kunci dan kartu akses diserahkan; pindah masuk","ms":"Kunci dan kad akses diserahkan; pindah masuk"}$j$, $j${"en":"Register the tenant with the management office where required.","id":"Daftarkan penyewa ke kantor pengelola bila diperlukan.","ms":"Daftarkan penyewa dengan pejabat pengurusan jika diperlukan."}$j$),
('MY', 'rent', 60, 'agent',     1,  $j${"en":"Renewal notice date diarised","id":"Tanggal pemberitahuan perpanjangan dicatat","ms":"Tarikh notis pembaharuan dicatat"}$j$, $j${"en":"Typically two to three months before expiry, as the agreement states.","id":"Biasanya dua hingga tiga bulan sebelum berakhir, sesuai perjanjian.","ms":"Lazimnya dua hingga tiga bulan sebelum tamat, seperti dalam perjanjian."}$j$),
-- Indonesia · sale
('ID', 'sale', 10, 'buyer',     1,  $j${"en":"Booking fee (tanda jadi) and reservation form","id":"Tanda jadi dan formulir pemesanan","ms":"Yuran tempahan (tanda jadi) dan borang tempahan"}$j$, $j${"en":"Agree in writing whether it is refundable and against what.","id":"Sepakati tertulis apakah dapat dikembalikan dan dengan syarat apa.","ms":"Persetujui secara bertulis sama ada ia boleh dipulangkan dan atas syarat apa."}$j$),
('ID', 'sale', 20, 'notary',    5,  $j${"en":"Document check: certificate (SHM/HGB/Hak Pakai), building permit (IMB/PBG), PBB receipts, seller's identity and spousal consent","id":"Pengecekan dokumen: sertifikat (SHM/HGB/Hak Pakai), IMB/PBG, bukti PBB, identitas penjual dan persetujuan pasangan","ms":"Semakan dokumen: sijil (SHM/HGB/Hak Pakai), permit bangunan (IMB/PBG), resit PBB, identiti penjual dan persetujuan pasangan"}$j$, $j${"en":"KTP, KK, NPWP and marriage certificate; the certificate is checked at BPN (pengecekan sertifikat).","id":"KTP, KK, NPWP dan buku nikah; sertifikat dicek di BPN (pengecekan sertifikat).","ms":"KTP, KK, NPWP dan sijil nikah; sijil disemak di BPN (pengecekan sertifikat)."}$j$),
('ID', 'sale', 30, 'notary',    7,  $j${"en":"PPJB (binding sale agreement) signed before a notary; down payment","id":"PPJB ditandatangani di hadapan notaris; uang muka","ms":"PPJB (perjanjian jualan mengikat) ditandatangani di hadapan notari; bayaran pendahuluan"}$j$, $j${"en":"Sets the price, the schedule and the AJB date; used when the balance or the documents are not ready yet.","id":"Menetapkan harga, jadwal dan tanggal AJB; dipakai bila pelunasan atau dokumen belum siap.","ms":"Menetapkan harga, jadual dan tarikh AJB; digunakan apabila baki atau dokumen belum sedia."}$j$),
('ID', 'sale', 40, 'bank',      30, $j${"en":"KPR (mortgage) application and approval, if financing","id":"Pengajuan dan persetujuan KPR, jika dibiayai","ms":"Permohonan dan kelulusan KPR (gadai janji), jika dibiayai"}$j$, $j${"en":"Appraisal and credit check; the bank's notary may handle the AJB.","id":"Appraisal dan BI checking; notaris bank dapat menangani AJB.","ms":"Penilaian dan semakan kredit; notari bank mungkin mengendalikan AJB."}$j$),
('ID', 'sale', 50, 'seller',    7,  $j${"en":"Taxes paid: seller's final PPh 2.5%, buyer's BPHTB 5%","id":"Pajak dibayar: PPh final penjual 2,5%, BPHTB pembeli 5%","ms":"Cukai dibayar: PPh muktamad penjual 2.5%, BPHTB pembeli 5%"}$j$, $j${"en":"Both receipts are validated before the PPAT will sign the deed.","id":"Kedua bukti bayar divalidasi sebelum PPAT menandatangani akta.","ms":"Kedua-dua resit disahkan sebelum PPAT menandatangani surat ikatan."}$j$),
('ID', 'sale', 60, 'notary',    1,  $j${"en":"AJB (deed of sale) signed before the PPAT; balance paid","id":"AJB ditandatangani di hadapan PPAT; pelunasan","ms":"AJB (surat ikatan jualan) ditandatangani di hadapan PPAT; baki dibayar"}$j$, $j${"en":"Ownership passes here; the seller hands over the original certificate.","id":"Kepemilikan beralih di sini; penjual menyerahkan sertifikat asli.","ms":"Pemilikan berpindah di sini; penjual menyerahkan sijil asal."}$j$),
('ID', 'sale', 70, 'authority', 42, $j${"en":"Balik nama: title transferred and registered at BPN","id":"Balik nama: sertifikat dialihkan dan didaftarkan di BPN","ms":"Balik nama: hak milik dipindahkan dan didaftarkan di BPN"}$j$, $j${"en":"Two to eight weeks; a foreign buyer's title is issued as Hak Pakai.","id":"Dua hingga delapan minggu; sertifikat pembeli asing diterbitkan sebagai Hak Pakai.","ms":"Dua hingga lapan minggu; hak milik pembeli asing dikeluarkan sebagai Hak Pakai."}$j$),
('ID', 'sale', 80, 'agent',     1,  $j${"en":"Handover (serah terima): keys, utilities and PBB account transferred","id":"Serah terima: kunci, utilitas dan PBB dialihkan","ms":"Serahan: kunci, utiliti dan akaun PBB dipindahkan"}$j$, $j${"en":"Signed handover record with meter readings and photos.","id":"Berita acara serah terima dengan angka meter dan foto.","ms":"Rekod serahan bertandatangan dengan bacaan meter dan gambar."}$j$),
-- Indonesia · rent
('ID', 'rent', 10, 'tenant',    1,  $j${"en":"Terms agreed: rent, deposit, period and payment schedule","id":"Kesepakatan: sewa, deposit, jangka waktu dan jadwal pembayaran","ms":"Terma dipersetujui: sewa, deposit, tempoh dan jadual bayaran"}$j$, $j${"en":"Rent is commonly paid a year in advance; agree what the deposit covers.","id":"Sewa umumnya dibayar setahun di muka; sepakati cakupan deposit.","ms":"Sewa lazimnya dibayar setahun lebih awal; persetujui apa yang diliputi deposit."}$j$),
('ID', 'rent', 20, 'agent',     5,  $j${"en":"Rental agreement (perjanjian sewa) signed, notarised if the parties want","id":"Perjanjian sewa ditandatangani, dinotariskan bila para pihak menghendaki","ms":"Perjanjian sewa ditandatangani, dinotarikan jika pihak-pihak mahu"}$j$, $j${"en":"Include the handover record, the house rules and the renewal clause.","id":"Sertakan berita acara, tata tertib dan klausul perpanjangan.","ms":"Sertakan rekod serahan, peraturan rumah dan klausa pembaharuan."}$j$),
('ID', 'rent', 30, 'tenant',    1,  $j${"en":"Deposit and first payment; landlord's final rental tax (PPh 10%) noted","id":"Deposit dan pembayaran pertama; PPh final sewa 10% pemilik dicatat","ms":"Deposit dan bayaran pertama; cukai sewa muktamad tuan rumah (PPh 10%) dicatat"}$j$, $j${"en":"A corporate tenant withholds the tax; an individual landlord self-reports.","id":"Penyewa badan usaha memotong pajaknya; pemilik perorangan melapor sendiri.","ms":"Penyewa korporat memotong cukai; tuan rumah individu melaporkan sendiri."}$j$),
('ID', 'rent', 40, 'agent',     1,  $j${"en":"Handover inspection (berita acara serah terima) with inventory and meter readings","id":"Berita acara serah terima dengan inventaris dan angka meter","ms":"Pemeriksaan serahan (berita acara serah terima) dengan inventori dan bacaan meter"}$j$, $j${"en":"Photos of every room and defect, signed by both sides.","id":"Foto setiap ruangan dan kerusakan, ditandatangani kedua pihak.","ms":"Gambar setiap bilik dan kecacatan, ditandatangani kedua-dua pihak."}$j$),
('ID', 'rent', 50, 'landlord',  1,  $j${"en":"Keys and building access handed over","id":"Kunci dan akses gedung diserahkan","ms":"Kunci dan akses bangunan diserahkan"}$j$, $j${"en":"Register the tenant with building management; a domicile letter if needed.","id":"Daftarkan penyewa ke pengelola gedung; surat domisili bila perlu.","ms":"Daftarkan penyewa dengan pengurusan bangunan; surat domisil jika perlu."}$j$),
('ID', 'rent', 60, 'agent',     1,  $j${"en":"Renewal or termination notice date diarised","id":"Tanggal pemberitahuan perpanjangan atau pengakhiran dicatat","ms":"Tarikh notis pembaharuan atau penamatan dicatat"}$j$, $j${"en":"As the agreement states, usually one to three months before the end.","id":"Sesuai perjanjian, biasanya satu hingga tiga bulan sebelum berakhir.","ms":"Seperti dalam perjanjian, lazimnya satu hingga tiga bulan sebelum tamat."}$j$);

-- The agent's own checklist per deal: which steps are done, for which lead.
create table public.closing_checklists (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references auth.users(id) on delete cascade,
  label            text not null check (char_length(label) between 1 and 120),
  country_code     text not null references public.countries(code),
  transaction_type text not null check (transaction_type in ('sale', 'rent')),
  lead_id          uuid references public.leads(id) on delete set null,
  listing_id       uuid references public.listings(id) on delete set null,
  done_step_ids    uuid[] not null default '{}',
  notes            text check (notes is null or char_length(notes) <= 2000),
  status           text not null default 'open' check (status in ('open', 'completed', 'archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_closing_checklists_agent on public.closing_checklists (agent_id, status, created_at desc);
alter table public.closing_checklists enable row level security;
create policy "closing checklists owner" on public.closing_checklists for all to authenticated
  using (agent_id = auth.uid()) with check (agent_id = auth.uid());
create policy "closing checklists admin read" on public.closing_checklists for select to authenticated
  using (public.is_platform_admin());
revoke all on public.closing_checklists from anon;
create trigger closing_checklists_updated_at before update on public.closing_checklists
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4 · Weekly review cache (Performance Reviewer) — one row per agent per week
-- -----------------------------------------------------------------------------
create table public.ai_weekly_reviews (
  user_id      uuid not null references auth.users(id) on delete cascade,
  week_start   date not null,
  locale       text not null,
  source       text not null check (source in ('ai', 'rules')),
  paragraph    text,
  metrics      jsonb not null default '{}'::jsonb,
  metrics_hash text,
  model        text,
  reason       text,
  created_at   timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.ai_weekly_reviews enable row level security;
create policy "weekly reviews owner read" on public.ai_weekly_reviews for select to authenticated
  using (user_id = auth.uid() or public.has_capability('ai.manage'));
revoke all on public.ai_weekly_reviews from anon;

create or replace function public.ai_upsert_weekly_review(
  p_user uuid, p_week date, p_locale text, p_source text, p_paragraph text,
  p_metrics jsonb, p_hash text, p_model text, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ai_may_act_for(p_user) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.ai_weekly_reviews (user_id, week_start, locale, source, paragraph, metrics, metrics_hash, model, reason)
  values (p_user, p_week, p_locale, p_source, p_paragraph, coalesce(p_metrics, '{}'::jsonb), p_hash, p_model, p_reason)
  on conflict (user_id, week_start) do update
    set locale = excluded.locale, source = excluded.source, paragraph = excluded.paragraph,
        metrics = excluded.metrics, metrics_hash = excluded.metrics_hash, model = excluded.model,
        reason = excluded.reason, created_at = now();
end $$;
revoke execute on function public.ai_upsert_weekly_review(uuid, date, text, text, text, jsonb, text, text, text) from public, anon;

create or replace function public.ai_clear_weekly_review(p_user uuid, p_week date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ai_may_act_for(p_user) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.ai_weekly_reviews where user_id = p_user and week_start = p_week;
end $$;
revoke execute on function public.ai_clear_weekly_review(uuid, date) from public, anon;

/**
 * The numbers behind the weekly review: the last seven days against the
 * seven before, for the signed-in agent, plus anonymised peer medians over
 * verified agents in the same country (null unless at least five peers had
 * any activity — nobody is comparable to a crowd of two).
 */
create or replace function public.my_weekly_review()
returns table (
  leads_this int, leads_last int,
  replied_this int, replied_last int,
  response_minutes_this numeric, response_minutes_last numeric,
  published_this int, published_last int,
  views_this int, views_last int,
  inquiries_this int, inquiries_last int,
  peers int, peer_leads_median numeric, peer_response_minutes_median numeric, peer_published_median numeric
) language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  b as (
    select now() - interval '7 days' as this_from, now() as this_to,
           now() - interval '14 days' as last_from, now() - interval '7 days' as last_to
  ),
  mine as (select l.* from public.leads l, me where l.agent_id = me.id),
  peers as (
    select p.id from public.profiles p, me
    where p.agent_status = 'verified'
      and p.id <> me.id
      and p.country_code is not distinct from (select country_code from public.profiles where id = me.id)
  ),
  peer_rows as (
    select pr.id,
      (select count(*) from public.leads l, b where l.agent_id = pr.id and l.created_at between b.this_from and b.this_to) as leads,
      (select percentile_cont(0.5) within group (order by extract(epoch from (l.first_responded_at - l.created_at)) / 60)
         from public.leads l, b where l.agent_id = pr.id and l.first_responded_at is not null and l.created_at between b.this_from and b.this_to) as resp,
      (select count(*) from public.listings x, b where x.agent_id = pr.id and x.status = 'published' and x.published_at between b.this_from and b.this_to) as published
    from peers pr
  ),
  active_peers as (select * from peer_rows where leads > 0 or published > 0 or resp is not null)
  select
    (select count(*)::int from mine, b where created_at between b.this_from and b.this_to),
    (select count(*)::int from mine, b where created_at between b.last_from and b.last_to),
    (select count(*)::int from mine, b where first_responded_at between b.this_from and b.this_to),
    (select count(*)::int from mine, b where first_responded_at between b.last_from and b.last_to),
    (select round(percentile_cont(0.5) within group (order by extract(epoch from (first_responded_at - created_at)) / 60)::numeric, 0)
       from mine, b where first_responded_at is not null and created_at between b.this_from and b.this_to),
    (select round(percentile_cont(0.5) within group (order by extract(epoch from (first_responded_at - created_at)) / 60)::numeric, 0)
       from mine, b where first_responded_at is not null and created_at between b.last_from and b.last_to),
    (select count(*)::int from public.listings x, me, b where x.agent_id = me.id and x.status = 'published' and x.published_at between b.this_from and b.this_to),
    (select count(*)::int from public.listings x, me, b where x.agent_id = me.id and x.status = 'published' and x.published_at between b.last_from and b.last_to),
    (select coalesce(sum(s.views), 0)::int from public.listing_statistics s join public.listings x on x.id = s.listing_id, me, b
       where x.agent_id = me.id and s.stat_date >= b.this_from::date and s.stat_date < b.this_to::date + 1),
    (select coalesce(sum(s.views), 0)::int from public.listing_statistics s join public.listings x on x.id = s.listing_id, me, b
       where x.agent_id = me.id and s.stat_date >= b.last_from::date and s.stat_date < b.last_to::date),
    (select coalesce(sum(s.inquiries), 0)::int from public.listing_statistics s join public.listings x on x.id = s.listing_id, me, b
       where x.agent_id = me.id and s.stat_date >= b.this_from::date and s.stat_date < b.this_to::date + 1),
    (select coalesce(sum(s.inquiries), 0)::int from public.listing_statistics s join public.listings x on x.id = s.listing_id, me, b
       where x.agent_id = me.id and s.stat_date >= b.last_from::date and s.stat_date < b.last_to::date),
    (select count(*)::int from active_peers),
    (select case when count(*) >= 5 then percentile_cont(0.5) within group (order by leads) end from active_peers),
    (select case when count(*) >= 5 then round(percentile_cont(0.5) within group (order by resp)::numeric, 0) end from active_peers where resp is not null),
    (select case when count(*) >= 5 then percentile_cont(0.5) within group (order by published) end from active_peers);
$$;
revoke all on function public.my_weekly_review() from public, anon;
grant execute on function public.my_weekly_review() to authenticated;

-- -----------------------------------------------------------------------------
-- 5 · Listing Refresh Planner — rules only, the agent's own listings
-- -----------------------------------------------------------------------------
create or replace function public.my_refresh_plan()
returns table (
  listing_id uuid, human_readable_id text, title text, status text,
  reason text, due_at timestamptz, photos int, views_14d int, inquiries_30d int
) language sql stable security definer set search_path = public as $$
  with mine as (
    select l.id, l.human_readable_id, l.title, l.status, l.expires_at, l.published_at, l.renewed_at, l.last_verified_at, l.updated_at, l.created_at,
           (select count(*)::int from public.listing_media m where m.listing_id = l.id and m.kind = 'image') as photos,
           (select coalesce(sum(s.views), 0)::int from public.listing_statistics s where s.listing_id = l.id and s.stat_date >= current_date - 14) as views_14d,
           (select coalesce(sum(s.inquiries), 0)::int from public.listing_statistics s where s.listing_id = l.id and s.stat_date >= current_date - 30) as inquiries_30d,
           (select count(*)::int from public.leads ld where ld.listing_id = l.id and ld.created_at >= now() - interval '30 days') as leads_30d
    from public.listings l
    where l.agent_id = auth.uid() and l.status in ('draft', 'published')
  ),
  flagged as (
    select m.*,
      case
        when m.status = 'published' and m.expires_at is not null and m.expires_at < now() + interval '7 days' then 'expiring'
        when m.photos = 0 then 'no_photos'
        when m.status = 'published' and coalesce(m.last_verified_at, m.published_at) < now() - interval '60 days' then 'reverify'
        when m.status = 'published' and coalesce(m.renewed_at, m.published_at) < now() - interval '30 days'
             and m.views_14d < 5 and m.inquiries_30d = 0 and m.leads_30d = 0 then 'stale'
        when m.status = 'draft' and m.updated_at < now() - interval '7 days' then 'old_draft'
      end as reason,
      case
        when m.status = 'published' and m.expires_at is not null and m.expires_at < now() + interval '7 days' then m.expires_at
        when m.status = 'published' and coalesce(m.last_verified_at, m.published_at) < now() - interval '60 days' then coalesce(m.last_verified_at, m.published_at) + interval '60 days'
        else null
      end as due_at
    from mine m
  )
  select id, human_readable_id, title, status, reason, due_at, photos, views_14d, inquiries_30d
  from flagged
  where reason is not null
  order by case reason when 'expiring' then 0 when 'no_photos' then 1 when 'reverify' then 2 when 'stale' then 3 else 4 end, due_at nulls last, title;
$$;
revoke all on function public.my_refresh_plan() from public, anon;
grant execute on function public.my_refresh_plan() to authenticated;

-- -----------------------------------------------------------------------------
-- 6 · Onboarding Guide — the first listing, lead and viewing, as live facts
-- -----------------------------------------------------------------------------
create or replace function public.my_onboarding_steps()
returns table (step text, pos int, done boolean)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id)
  select 'profile', 10, exists (select 1 from public.agent_profiles ap, me where ap.user_id = me.id and nullif(ap.full_legal_name, '') is not null)
  union all select 'verified', 20, exists (select 1 from public.profiles p, me where p.id = me.id and p.agent_status = 'verified')
  union all select 'first_listing', 30, exists (select 1 from public.listings l, me where l.agent_id = me.id)
  union all select 'first_photo', 40, exists (select 1 from public.listings l join public.listing_media m on m.listing_id = l.id, me where l.agent_id = me.id)
  union all select 'first_published', 50, exists (select 1 from public.listings l, me where l.agent_id = me.id and l.status = 'published')
  union all select 'first_share', 60, exists (select 1 from public.ai_jobs j, me where j.user_id = me.id and j.feature in ('studio_copy', 'social_plan', 'video_script'))
                                   or exists (select 1 from public.scheduled_posts s, me where s.user_id = me.id)
  union all select 'first_lead', 70, exists (select 1 from public.leads l, me where l.agent_id = me.id)
  union all select 'first_reply', 80, exists (select 1 from public.leads l, me where l.agent_id = me.id and l.first_responded_at is not null)
  union all select 'first_task', 90, exists (select 1 from public.agent_tasks t, me where t.agent_id = me.id)
  union all select 'first_viewing', 100, exists (select 1 from public.viewing_appointments v, me where v.lead_id is not null and v.proposed_by = me.id)
                                      or exists (select 1 from public.viewing_appointments v join public.property_submissions ps on ps.id = v.submission_id, me where ps.supply_agent_id = me.id)
  union all select 'first_guide', 110, exists (select 1 from public.training_progress tp, me where tp.user_id = me.id);
$$;
revoke all on function public.my_onboarding_steps() from public, anon;
grant execute on function public.my_onboarding_steps() to authenticated;

-- -----------------------------------------------------------------------------
-- 7 · Listing Researcher — the comparable listings themselves (public facts)
-- -----------------------------------------------------------------------------
create or replace function public.listing_comparables_list(
  p_country text, p_listing_type text, p_property_type text, p_regency text,
  p_bedrooms integer default null, p_exclude uuid default null, p_limit integer default 12
) returns table (
  id uuid, human_readable_id text, title text, slug text, price numeric, currency text, rent_period text,
  bedrooms int, bathrooms int, building_size numeric, land_size numeric,
  regency_name text, district_name text, published_at timestamptz, mine boolean
) language sql stable security definer set search_path = public as $$
  select l.id, l.human_readable_id, l.title, l.slug, l.price, l.currency, l.rent_period,
         p.bedrooms, p.bathrooms, p.building_size, p.land_size,
         p.regency_name, p.district_name, l.published_at, l.agent_id = auth.uid()
  from public.listings l
  join public.properties p on p.id = l.property_id
  where l.status = 'published'
    and l.price > 0
    and p.country_code = p_country
    and l.listing_type = p_listing_type
    and p.property_type = p_property_type
    and (p_regency is null or p.regency_name = p_regency)
    and (p_bedrooms is null or p.bedrooms is null or p.bedrooms = p_bedrooms)
    and (p_exclude is null or l.id <> p_exclude)
  order by l.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 12), 30));
$$;
revoke execute on function public.listing_comparables_list(text, text, text, text, integer, uuid, integer) from public, anon;
grant execute on function public.listing_comparables_list(text, text, text, text, integer, uuid, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8 · Partner Finder — agents in the OTHER market who co-broke in your category
--     Reads only what the public profile already shows (public_agent_profiles).
-- -----------------------------------------------------------------------------
create or replace function public.my_partner_candidates(p_limit integer default 24)
returns table (
  id uuid, public_slug text, display_name text, avatar_url text, country_code text,
  agency_name text, city text, markets_served text[], property_categories text[],
  published_listing_count int, pool_offers int, shared_categories text[]
) language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, p.country_code, coalesce(ap.property_categories, '{}'::text[]) as cats
    from public.profiles p
    left join public.agent_profiles ap on ap.user_id = p.id
    where p.id = auth.uid()
  )
  select pa.id, pa.public_slug, pa.display_name, pa.avatar_url, pa.country_code,
         pa.agency_name, pa.city, pa.markets_served, pa.property_categories,
         pa.published_listing_count::int,
         (select count(*)::int from public.comarketing_offers o where o.listing_agent_id = pa.id and o.status = 'active') as pool_offers,
         (select coalesce(array_agg(c), '{}'::text[]) from unnest(coalesce(pa.property_categories, '{}'::text[])) c, me where c = any(me.cats)) as shared
  from public.public_agent_profiles pa, me
  where pa.id <> me.id
    and pa.country_code is not null
    and pa.country_code <> coalesce(me.country_code, '')
    and pa.is_verified
  order by (select count(*) from unnest(coalesce(pa.property_categories, '{}'::text[])) c, me where c = any(me.cats)) desc,
           pool_offers desc, pa.published_listing_count desc nulls last, pa.display_name
  limit greatest(1, least(coalesce(p_limit, 24), 60));
$$;
revoke all on function public.my_partner_candidates(integer) from public, anon;
grant execute on function public.my_partner_candidates(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 9 · Owner report — the listing's week in numbers, for its owner's agent only
-- -----------------------------------------------------------------------------
create or replace function public.my_listing_owner_report(p_listing uuid, p_days integer default 7)
returns table (
  views int, unique_views int, saves int, shares int, inquiries int, whatsapp_clicks int,
  views_prev int, inquiries_prev int,
  leads_total int, leads_new int, leads_contacted int, leads_viewing int, leads_negotiating int,
  viewings_upcoming int, price_changes int, days_live int
) language sql stable security definer set search_path = public as $$
  with l as (
    select id, published_at from public.listings
    where id = p_listing and (agent_id = auth.uid() or public.is_platform_admin())
  ),
  d as (select greatest(coalesce(p_days, 7), 1) as n)
  select
    (select coalesce(sum(s.views), 0)::int from public.listing_statistics s, l, d where s.listing_id = l.id and s.stat_date >= current_date - d.n),
    (select coalesce(sum(s.unique_views), 0)::int from public.listing_statistics s, l, d where s.listing_id = l.id and s.stat_date >= current_date - d.n),
    (select coalesce(sum(s.saves), 0)::int from public.listing_statistics s, l, d where s.listing_id = l.id and s.stat_date >= current_date - d.n),
    (select coalesce(sum(s.shares), 0)::int from public.listing_statistics s, l, d where s.listing_id = l.id and s.stat_date >= current_date - d.n),
    (select coalesce(sum(s.inquiries), 0)::int from public.listing_statistics s, l, d where s.listing_id = l.id and s.stat_date >= current_date - d.n),
    (select coalesce(sum(s.whatsapp_clicks), 0)::int from public.listing_statistics s, l, d where s.listing_id = l.id and s.stat_date >= current_date - d.n),
    (select coalesce(sum(s.views), 0)::int from public.listing_statistics s, l, d where s.listing_id = l.id and s.stat_date >= current_date - 2 * d.n and s.stat_date < current_date - d.n),
    (select coalesce(sum(s.inquiries), 0)::int from public.listing_statistics s, l, d where s.listing_id = l.id and s.stat_date >= current_date - 2 * d.n and s.stat_date < current_date - d.n),
    (select count(*)::int from public.leads x, l where x.listing_id = l.id),
    (select count(*)::int from public.leads x, l, d where x.listing_id = l.id and x.created_at >= now() - d.n * interval '1 day'),
    (select count(*)::int from public.leads x, l where x.listing_id = l.id and x.status in ('contacted', 'qualified', 'property_matched')),
    (select count(*)::int from public.leads x, l where x.listing_id = l.id and x.status in ('viewing_proposed', 'viewing_confirmed', 'viewed')),
    (select count(*)::int from public.leads x, l where x.listing_id = l.id and x.status in ('negotiating', 'booking', 'financing')),
    (select count(*)::int from public.viewing_appointments v, l where v.listing_id = l.id and v.status in ('proposed', 'confirmed') and v.proposed_date >= current_date),
    (select count(*)::int from public.listing_price_history h, l, d where h.listing_id = l.id and h.created_at >= now() - d.n * interval '1 day'),
    (select coalesce(extract(day from now() - l.published_at), 0)::int from l);
$$;
revoke all on function public.my_listing_owner_report(uuid, integer) from public, anon;
grant execute on function public.my_listing_owner_report(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 10 · The roles go live
-- -----------------------------------------------------------------------------
update public.ai_roles set status = 'live', updated_at = now(),
  route = v.route, feature = v.feature
from (values
  ('owner_report_writer',    '/listings',                'owner_report'),
  ('document_summariser',    '/ai/documents',            'document_summary'),
  ('crossborder_researcher', '/ai/crossborder',          'crossborder_brief'),
  ('translation_assistant',  '/listings',                'translate'),
  ('partner_finder',         '/collab/partners',         null),
  ('listing_researcher',     '/ai/research',             'listing_research'),
  ('owner_outreach',         '/ai/outreach',             'owner_outreach'),
  ('poster_designer',        '/studio',                  'poster_image'),
  ('video_scriptwriter',     '/studio',                  'video_script'),
  ('social_planner',         '/studio/plan',             'social_plan'),
  ('photo_checker',          '/listings',                'photo_check'),
  ('refresh_planner',        '/listings',                null),
  ('buyer_profiler',         '/requests/new',            'requirement_extract'),
  ('objection_coach',        '/ai/coach?mode=objection', 'coach'),
  ('offer_summariser',       '/requests',                'offer_summary'),
  ('closing_checklist',      '/ai/closing',              null),
  ('team_coach',             '/ai/coach',                'coach'),
  ('onboarding_guide',       '/training',                null),
  ('performance_reviewer',   '/ai/review',               'weekly_review')
) as v(key, route, feature)
where public.ai_roles.key = v.key;
