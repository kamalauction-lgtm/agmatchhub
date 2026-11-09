#!/usr/bin/env node
/**
 * Populate STAGING with clearly-labelled, fictional demonstration data so the
 * hub is visually complete for practical testing.
 *
 *   node scripts/seed-staging-demo.mjs --env=staging            # create / re-sync
 *   node scripts/seed-staging-demo.mjs --env=staging --remove   # delete every demo row
 *
 * What it lays down (all ids in the 8000xx range, all titles prefixed "[DEMO]",
 * every description ending with the DEMO / TEST DATA marker):
 *
 *   20 properties + listings   Jakarta, Depok, Bandung, Surabaya, Bali; houses,
 *                              apartments, shoplots, commercial, land; mixed
 *                              status (published, pending_review, draft, paused,
 *                              sold); one generated placeholder cover image each
 *   40 contacts + leads        example.com e-mails, reserved test phone range,
 *                              every supported status group, lead events,
 *                              rule-based lead_intelligence rows
 *   agent_tasks                linked to leads/listings, open and done
 *   viewing_appointments       for leads at viewing stage
 *   comarketing_offers         4 open-pool offers on demo listings
 *   MatchHub                   2 demo requirements + 2 demo submissions
 *
 * Owners are the EXISTING staging test agents (seed-test-users.mjs) and the
 * rehearsal accounts (seed-pilot-rehearsal.mjs). Nothing is created in auth.
 *
 * Safety: refuses production by ref; runs in one transaction through the
 * direct Postgres connection (triggers fire, RLS bypassed — same path as
 * seed-staging-scenario.mjs); idempotent via on-conflict on human ids and
 * delete-by-marker for rows without one. No outbound message is sent: inserting
 * leads/tasks fires no WhatsApp or e-mail; wa_messages is never touched.
 */
import pg from "pg";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./load-env.mjs";

const STAGING_REF = "aylzekkeurjsudazzxjv";
const PRODUCTION_REF = "jokyyhvtahiypuzmfydp";
const MARK = "DEMO / TEST DATA";
const MARK_ID = `${MARK} — properti fiktif untuk pengujian staging, bukan inventaris nyata.`;
const REMOVE = process.argv.includes("--remove");

const { url, isProduction, fileName, ref } = loadEnv();
if (isProduction || ref === PRODUCTION_REF) {
  console.error("Refusing: demo seed never runs against production.");
  process.exit(1);
}
if (ref !== STAGING_REF) {
  console.error(`Refusing: expected staging ref ${STAGING_REF}, got ${ref}.`);
  process.exit(1);
}
const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`${k} missing in ${fileName}`); process.exit(1); }
  return v;
};
const OWNER_EMAILS = {
  LA: need("TEST_LA_EMAIL"), MA: need("TEST_MA_EMAIL"), RA: need("TEST_RA_EMAIL"),
  SA: need("TEST_SA_EMAIL"), ADMIN: need("TEST_ADMIN_EMAIL"),
  MYA: process.env.PILOT_MY_A_EMAIL ?? "pilot-my-a@rehearsal.propertiguru.test",
  IDA: process.env.PILOT_ID_A_EMAIL ?? "pilot-id-a@rehearsal.propertiguru.test",
};
const SUPABASE_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");

const hid = (prefix, n) => `${prefix}-2026-${String(800000 + n).padStart(6, "0")}`;

// ---------------------------------------------------------------------------
// 20 listings. regency = locations.slug (level regency). Prices in IDR.
// ---------------------------------------------------------------------------
const L = [
  { n: 1, owner: "LA", regency: "jakarta-selatan", addr: "Kemang Timur", cat: "residential", type: "rumah", own: "shm", lt: "sale", st: "published", price: 4_200_000_000, land: 220, bld: 260, bed: 4, bath: 3, park: 2, floors: 2, year: 2018, furn: "partially", cond: "good", lng: 106.8166, lat: -6.2615, fac: ["taman", "carport 2 mobil", "keamanan 24 jam", "water heater"], title: "Rumah 2 lantai Kemang Timur, 4 kamar, carport 2 mobil", ksp: ["Dekat sekolah internasional", "Bebas banjir", "Lingkungan ekspatriat"], desc: "Rumah keluarga dua lantai di kawasan Kemang yang tenang. Ruang tamu luas, dapur bersih dan kotor, kamar pembantu, taman belakang. 10 menit ke Cilandak Town Square." },
  { n: 2, owner: "LA", regency: "jakarta-selatan", addr: "Senopati", cat: "residential", type: "apartemen", own: "strata", lt: "rent", period: "yearly", st: "published", price: 185_000_000, bld: 88, bed: 2, bath: 2, park: 1, floorLevel: "18", year: 2016, furn: "fully", cond: "excellent", lng: 106.8094, lat: -6.2325, fac: ["kolam renang", "gym", "akses lift privat", "concierge"], title: "Apartemen 2BR full furnished Senopati, lantai tinggi", ksp: ["View kota", "Siap huni", "Dekat SCBD"], desc: "Unit dua kamar dengan furnitur lengkap di tower premium Senopati. Cocok untuk eksekutif yang bekerja di SCBD. Termasuk 1 lot parkir." },
  { n: 3, owner: "LA", regency: "jakarta-pusat", addr: "Menteng", cat: "residential", type: "rumah", own: "shm", lt: "sale", st: "published", price: 18_500_000_000, land: 650, bld: 520, bed: 5, bath: 5, park: 4, floors: 2, year: 1975, furn: "unfurnished", cond: "needs_renovation", lng: 106.8356, lat: -6.1955, fac: ["taman luas", "garasi 4 mobil", "paviliun"], title: "Rumah tua Menteng, tanah 650 m², posisi hook", ksp: ["Lokasi premium", "Potensi renovasi", "Tanah luas"], desc: "Rumah lama di jantung Menteng, cocok untuk renovasi total atau bangun baru. Posisi hook dengan dua akses jalan." },
  { n: 4, owner: "LA", regency: "jakarta-barat", addr: "Puri Indah", cat: "commercial", type: "ruko", own: "hgb", lt: "sale", st: "published", price: 6_800_000_000, land: 90, bld: 270, bath: 3, park: 2, floors: 3, year: 2012, furn: "unfurnished", cond: "good", lng: 106.7372, lat: -6.1876, fac: ["listrik 16.500 VA", "parkir depan", "akses tol"], title: "Ruko 3 lantai Puri Indah, pinggir jalan utama", ksp: ["Traffic tinggi", "Cocok klinik / F&B", "Dekat mall"], desc: "Rukan tiga lantai di jalur utama Puri Indah. Sudah ada sekat ruang kantor di lantai 2 dan 3. Cocok untuk kantor cabang, klinik, atau usaha kuliner." },
  { n: 5, owner: "LA", regency: "jakarta-utara", addr: "Pantai Indah Kapuk", cat: "residential", type: "rumah", own: "hgb", lt: "sale", st: "pending_review", price: 7_900_000_000, land: 200, bld: 300, bed: 4, bath: 4, park: 2, floors: 3, year: 2021, furn: "partially", cond: "excellent", lng: 106.7415, lat: -6.1089, fac: ["rooftop", "smart home", "cluster one gate"], title: "Rumah baru 3 lantai PIK, cluster one-gate, rooftop", ksp: ["Baru selesai", "Smart home", "Dekat PIK Avenue"], desc: "Rumah modern tiga lantai di cluster tertutup PIK. Rooftop terbuka, sistem smart home, kamar utama dengan walk-in closet." },
  { n: 6, owner: "MA", regency: "jakarta-timur", addr: "Cibubur", cat: "residential", type: "rumah", own: "shm", lt: "sale", st: "published", price: 1_650_000_000, land: 120, bld: 110, bed: 3, bath: 2, park: 1, floors: 1, year: 2015, furn: "unfurnished", cond: "good", lng: 106.8899, lat: -6.3687, fac: ["taman depan", "carport", "dekat tol Jagorawi"], title: "Rumah 1 lantai Cibubur, 3 kamar, dekat tol", ksp: ["Harga di bawah pasar", "Bebas banjir", "Dekat sekolah"], desc: "Rumah satu lantai di perumahan tertata di Cibubur. Akses 5 menit ke gerbang tol Jagorawi. Cocok untuk keluarga muda." },
  { n: 7, owner: "MA", regency: "depok", addr: "Margonda", cat: "residential", type: "apartemen", own: "strata", lt: "rent", period: "monthly", st: "published", price: 4_500_000, bld: 36, bed: 1, bath: 1, floorLevel: "12", year: 2019, furn: "fully", cond: "good", lng: 106.8318, lat: -6.3703, fac: ["kolam renang", "minimarket", "dekat UI"], title: "Apartemen studio-1BR Margonda, furnished, dekat UI", ksp: ["Dekat kampus UI", "Furnished", "Dekat stasiun"], desc: "Unit satu kamar dengan perabot lengkap, 5 menit ke Universitas Indonesia dan stasiun Pondok Cina. Cocok untuk mahasiswa pascasarjana atau dosen." },
  { n: 8, owner: "MA", regency: "depok", addr: "Sawangan", cat: "land", type: "tanah", own: "shm", lt: "sale", st: "published", price: 2_100_000_000, land: 700, lng: 106.7695, lat: -6.4064, fac: ["jalan lebar 8 m", "listrik tersedia", "SHM pecah"], title: "Tanah kavling 700 m² Sawangan, pinggir jalan 8 meter", ksp: ["Cocok townhouse", "SHM", "Dekat Grand Depok City"], desc: "Tanah matang siap bangun di Sawangan, lebar depan 20 meter. Cocok untuk 4-5 unit townhouse atau gudang kecil." },
  { n: 9, owner: "MA", regency: "depok", addr: "Cinere", cat: "residential", type: "cluster_home", own: "shm", lt: "sale", st: "draft", price: 2_350_000_000, land: 105, bld: 140, bed: 3, bath: 3, park: 1, floors: 2, year: 2022, furn: "unfurnished", cond: "new", lng: 106.7788, lat: -6.3298, fac: ["cluster", "taman bermain", "jogging track"], title: "Rumah cluster baru Cinere, 3+1 kamar, 2 lantai", ksp: ["Baru", "Cluster hijau", "Dekat Cinere Mall"], desc: "Unit baru di cluster hijau Cinere dengan jogging track dan taman bermain anak. Serah terima 3 bulan." },
  { n: 10, owner: "SA", regency: "bandung", addr: "Dago Atas", cat: "residential", type: "villa", own: "shm", lt: "sale", st: "published", price: 5_600_000_000, land: 400, bld: 320, bed: 4, bath: 4, park: 3, floors: 2, year: 2014, furn: "fully", cond: "excellent", lng: 107.6186, lat: -6.8630, fac: ["view kota", "kolam renang", "gazebo", "udara sejuk"], title: "Villa Dago Atas, kolam renang, view kota Bandung", ksp: ["View 180°", "Furnished", "Potensi villa sewa"], desc: "Villa dua lantai dengan pemandangan kota Bandung. Kolam renang infinity kecil, gazebo, dapur modern. Saat ini disewakan harian dengan okupansi baik." },
  { n: 11, owner: "SA", regency: "bandung", addr: "Buah Batu", cat: "commercial", type: "ruko", own: "hgb", lt: "rent", period: "yearly", st: "published", price: 95_000_000, land: 75, bld: 150, bath: 2, park: 2, floors: 2, year: 2010, furn: "unfurnished", cond: "good", lng: 107.6379, lat: -6.9521, fac: ["listrik 5.500 VA", "rolling door", "parkir depan"], title: "Ruko 2 lantai Buah Batu disewakan, jalur ramai", ksp: ["Jalur ramai", "Harga sewa wajar", "Siap pakai"], desc: "Ruko dua lantai di koridor Buah Batu yang padat. Lantai 1 untuk toko, lantai 2 untuk gudang atau kantor." },
  { n: 12, owner: "SA", regency: "bandung", addr: "Setiabudi", cat: "residential", type: "kost", own: "shm", lt: "sale", st: "published", price: 3_900_000_000, land: 250, bld: 480, bed: 18, bath: 18, park: 4, floors: 3, year: 2017, furn: "fully", cond: "good", lng: 107.5986, lat: -6.8656, fac: ["18 kamar", "AC tiap kamar", "CCTV", "laundry"], title: "Kost eksklusif 18 kamar Setiabudi, full terisi", ksp: ["Yield ±9%", "Dekat UPI & NHI", "Pengelola siap lanjut"], desc: "Kost putri tiga lantai dengan 18 kamar ber-AC dan kamar mandi dalam, okupansi penuh. Cocok untuk investor pasif." },
  { n: 13, owner: "RA", regency: "surabaya", addr: "Citraland", cat: "residential", type: "rumah", own: "shm", lt: "sale", st: "published", price: 3_750_000_000, land: 180, bld: 220, bed: 4, bath: 3, park: 2, floors: 2, year: 2016, furn: "partially", cond: "good", lng: 112.6410, lat: -7.2863, fac: ["cluster", "clubhouse", "keamanan 24 jam"], title: "Rumah Citraland Surabaya Barat, 4 kamar, cluster", ksp: ["Cluster premium", "Dekat sekolah Ciputra", "Siap huni"], desc: "Rumah dua lantai di cluster Citraland dengan akses clubhouse. Dapur sudah direnovasi, kamar utama dengan balkon." },
  { n: 14, owner: "RA", regency: "surabaya", addr: "Rungkut Industri", cat: "industrial", type: "gudang", own: "hgb", lt: "rent", period: "yearly", st: "published", price: 450_000_000, land: 1200, bld: 900, bath: 2, park: 6, floors: 1, year: 2008, furn: "unfurnished", cond: "good", lng: 112.7606, lat: -7.3296, fac: ["tinggi 9 m", "loading dock", "listrik 33.000 VA", "kantor"], title: "Gudang 900 m² Rungkut Industri, loading dock, listrik 33 kVA", ksp: ["Akses kontainer 40 ft", "Kantor dalam", "Dekat tol Waru"], desc: "Gudang satu lantai dengan tinggi bersih 9 meter, loading dock dan area kantor 60 m². Akses truk kontainer langsung." },
  { n: 15, owner: "RA", regency: "surabaya", addr: "Tunjungan", cat: "commercial", type: "office_space", own: "strata", lt: "rent", period: "monthly", st: "paused", price: 38_000_000, bld: 160, bath: 2, park: 3, floorLevel: "9", year: 2013, furn: "partially", cond: "good", lng: 112.7378, lat: -7.2575, fac: ["lift", "genset", "resepsionis gedung"], title: "Ruang kantor 160 m² Tunjungan, lantai 9, semi-furnished", ksp: ["Pusat kota", "Gedung grade B+", "Parkir 3 mobil"], desc: "Ruang kantor dengan partisi kaca, ruang meeting dan pantry. Sewa termasuk service charge. Sementara dijeda karena sedang negosiasi." },
  { n: 16, owner: "IDA", regency: "kab-badung", addr: "Canggu", cat: "residential", type: "villa", own: "leasehold_other", lt: "sale", st: "published", price: 8_900_000_000, land: 500, bld: 350, bed: 3, bath: 4, park: 2, floors: 2, year: 2020, furn: "fully", cond: "excellent", lng: 115.1385, lat: -8.6478, fac: ["kolam renang", "rooftop", "taman tropis", "staff quarter"], title: "Villa 3BR Canggu, leasehold 25 tahun, kolam renang", ksp: ["Dekat pantai Berawa", "Furnished", "Income Airbnb"], desc: "Villa tropis modern dengan kolam renang 12 meter, rooftop sunset deck, 5 menit ke pantai Berawa. Sisa leasehold 25 tahun, bisa diperpanjang." },
  { n: 17, owner: "IDA", regency: "denpasar", addr: "Renon", cat: "residential", type: "rumah", own: "shm", lt: "sale", st: "published", price: 2_950_000_000, land: 200, bld: 180, bed: 3, bath: 3, park: 2, floors: 1, year: 2012, furn: "partially", cond: "good", lng: 115.2322, lat: -8.6716, fac: ["taman", "carport", "dekat lapangan Renon"], title: "Rumah Renon Denpasar, 3 kamar, tanah 200 m²", ksp: ["Area perkantoran", "Jalan lebar", "Siap huni"], desc: "Rumah satu lantai di kawasan Renon yang tenang dan bebas banjir. Dekat pusat pemerintahan dan lapangan Puputan." },
  { n: 18, owner: "IDA", regency: "kab-badung", addr: "Jimbaran", cat: "land", type: "tanah", own: "shm", lt: "sale", st: "sold", price: 9_500_000_000, land: 1000, lng: 115.1660, lat: -8.7886, fac: ["view laut", "jalan aspal", "zona pariwisata"], title: "Tanah 10 are Jimbaran, view laut, zona pariwisata", ksp: ["View laut", "Zona kuning", "SHM"], desc: "Tanah view laut di bukit Jimbaran, cocok untuk villa atau boutique hotel. Sudah terjual (contoh status closed)." },
  { n: 19, owner: "MYA", regency: "jakarta-selatan", addr: "Tebet", cat: "residential", type: "townhouse", own: "shm", lt: "sale", st: "pending_review", price: 3_300_000_000, land: 110, bld: 170, bed: 3, bath: 3, park: 1, floors: 3, year: 2019, furn: "partially", cond: "good", lng: 106.8561, lat: -6.2290, fac: ["rooftop", "one gate", "dekat MRT"], title: "Townhouse 3 lantai Tebet, rooftop, 8 menit ke MRT", ksp: ["Dekat MRT", "One gate", "Rooftop"], desc: "Townhouse modern tiga lantai dalam cluster kecil 6 unit di Tebet. Rooftop garden, kamar utama lantai 3." },
  { n: 20, owner: "MYA", regency: "jakarta-pusat", addr: "Thamrin", cat: "residential", type: "apartemen", own: "strata", lt: "rent", period: "monthly", st: "published", price: 32_000_000, bld: 120, bed: 3, bath: 2, park: 1, floorLevel: "27", year: 2017, furn: "fully", cond: "excellent", lng: 106.8225, lat: -6.1940, fac: ["sky lounge", "kolam renang", "connected to mall"], title: "Apartemen 3BR Thamrin, lantai 27, terhubung mall", ksp: ["Pusat bisnis", "Furnished", "View Monas"], desc: "Unit tiga kamar di tower yang terhubung langsung ke pusat perbelanjaan Thamrin. Pemandangan Monas dari ruang tamu." },
];

// ---------------------------------------------------------------------------
// 40 leads. `listing` = listing n above (published ones only). Supported status
// groups: new · contact_attempted · contacted (some overdue = "follow-up due")
// · qualified · property_matched · viewing_proposed/confirmed · nurture ·
// closed_lost ("not interested").
// ---------------------------------------------------------------------------
const NAMES = ["Budi Santoso", "Dewi Lestari", "Agus Wijaya", "Rina Marlina", "Hendra Gunawan", "Sari Puspita", "Yoga Pratama", "Maya Anggraini", "Fajar Nugroho", "Intan Permata", "Rizky Ramadhan", "Lina Kusuma", "Dimas Saputra", "Nadia Safitri", "Bayu Firmansyah", "Citra Ayu", "Eko Prasetyo", "Fitri Handayani", "Galih Permana", "Hana Oktaviani", "Irfan Hakim", "Julia Rahmawati", "Kevin Tanuwijaya", "Laras Wulandari", "Mario Sitorus", "Nina Kartika", "Oscar Halim", "Putri Melati", "Reza Mahendra", "Sinta Dewanti", "Taufik Hidayat", "Umi Kalsum", "Vino Bastian", "Wulan Sari", "Xavier Lim", "Yuni Astuti", "Zaki Mubarak", "Ayu Paramita", "Bagas Adi", "Clara Wijaya"];
const SOURCES = ["marketplace", "whatsapp", "referral", "instagram", "walk_in"];
const STATUS_PLAN = [
  // [status, count, inquiry_type, responded?, overdue?]
  ["new", 8, "general", false, false],
  ["contact_attempted", 5, "price_question", true, false],
  ["contacted", 4, "availability", true, false],
  ["contacted", 3, "general", false, true],           // follow-up overdue
  ["qualified", 6, "financing", true, false],
  ["property_matched", 2, "general", true, false],
  ["viewing_proposed", 4, "viewing_request", true, false],
  ["viewing_confirmed", 3, "viewing_request", true, false],
  ["nurture", 2, "general", true, false],
  ["closed_lost", 3, "general", true, false],          // not interested
];
const INTENT_BY_STATUS = { new: 3, contact_attempted: 2, contacted: 3, qualified: 4, property_matched: 4, viewing_proposed: 5, viewing_confirmed: 5, nurture: 2, closed_lost: 1 };
const ACTION_BY_STATUS = {
  new: "Balas dalam 2 jam dan tawarkan jadwal survey.",
  contact_attempted: "Coba hubungi lagi besok pagi lewat WhatsApp.",
  contacted: "Kirim 2 alternatif unit dan tanyakan rentang anggaran.",
  qualified: "Ajukan 2 slot survey akhir pekan ini.",
  property_matched: "Kirim brosur unit yang cocok dan konfirmasi minat.",
  viewing_proposed: "Konfirmasi tanggal survey H-1.",
  viewing_confirmed: "Siapkan dokumen & ingatkan H-1 pagi.",
  nurture: "Masukkan ke daftar follow-up bulanan.",
  closed_lost: "Tutup; tanyakan boleh dihubungi untuk unit lain.",
};
const BUDGETS = [1_500_000_000, 2_000_000_000, 2_500_000_000, 3_000_000_000, 4_000_000_000, 5_000_000_000, 7_500_000_000, 10_000_000_000];
const RENT_BUDGETS = [4_000_000, 6_000_000, 15_000_000, 30_000_000, 100_000_000, 200_000_000];

// Leads attach to published demo listings, EXCEPT the RA account's: the RLS
// suite (tests/rls/lead-intelligence.test.ts) asserts that RA's lead radar is
// empty, so RA keeps listings but receives no demo leads.
const publishedL = L.filter((l) => l.st === "published" && l.owner !== "RA");
const LEADS = [];
let li = 0;
for (const [status, count, inquiryType, responded, overdue] of STATUS_PLAN) {
  for (let k = 0; k < count; k++) {
    const n = ++li;
    const listing = publishedL[(n * 7) % publishedL.length];
    const isRent = listing.lt === "rent";
    const budget = isRent ? RENT_BUDGETS[n % RENT_BUDGETS.length] : BUDGETS[n % BUDGETS.length];
    const regencyName = listing.regency.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace("Kab ", "Kab. ");
    const priority = status === "viewing_confirmed" || status === "viewing_proposed" ? "high" : status === "closed_lost" || status === "nurture" ? "low" : "normal";
    LEADS.push({
      n, name: NAMES[n - 1], status, inquiryType, responded, overdue, listing, priority,
      source: SOURCES[n % SOURCES.length],
      daysAgo: 1 + ((n * 5) % 14),
      budget, regencyName,
      intent: isRent ? "sewa" : "beli",
      message: `[${MARK}] Halo, saya tertarik ${isRent ? "menyewa" : "membeli"} ${listing.type} di ${listing.addr}. Anggaran sekitar Rp ${budget.toLocaleString("id-ID")}${isRent ? ` per ${listing.period === "monthly" ? "bulan" : "tahun"}` : ""}, lokasi pilihan ${regencyName}. ${inquiryType === "viewing_request" ? "Bisa survey akhir pekan ini?" : inquiryType === "price_question" ? "Harga masih bisa nego?" : inquiryType === "financing" ? "Apakah bisa KPR?" : inquiryType === "availability" ? "Masih tersedia?" : "Mohon info lebih lanjut."}`,
    });
  }
}

// ---------------------------------------------------------------------------
async function coverPng(l) {
  const palette = { residential: ["#1f4e79", "#7fb2e5"], commercial: ["#7a3b10", "#e8a062"], industrial: ["#3f3f46", "#a1a1aa"], land: ["#2f5d2a", "#8fc77f"], other: ["#4b3a6e", "#b39ddb"] };
  const [a, b] = palette[l.cat] ?? palette.other;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <rect x="40" y="40" width="1120" height="720" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="4" stroke-dasharray="24 16"/>
  <text x="600" y="330" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="700" fill="#ffffff" text-anchor="middle">${MARK}</text>
  <text x="600" y="420" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="#ffffff" fill-opacity="0.95" text-anchor="middle">${esc(l.type)} · ${esc(l.addr)}</text>
  <text x="600" y="490" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">${hid("LST", l.n)} · properti fiktif · staging</text>
</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
const storage = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }).storage.from("listing-media-public");

async function remove() {
  await db.query("begin");
  const r = {};
  r.tasks = (await db.query(`delete from public.agent_tasks where notes like '[${MARK}]%'`)).rowCount;
  r.viewings = (await db.query(`delete from public.viewing_appointments where human_readable_id like 'VIEW-2026-8000%'`)).rowCount;
  r.leads = (await db.query(`delete from public.leads where human_readable_id like 'LEAD-2026-8000%'`)).rowCount; // cascades events + intelligence
  r.contacts = (await db.query(`delete from public.contacts where human_readable_id like 'CON-2026-8000%'`)).rowCount;
  r.submissions = (await db.query(`delete from public.property_submissions where human_readable_id like 'SUB-2026-8000%'`)).rowCount;
  r.requests = (await db.query(`delete from public.property_requests where human_readable_id like 'REQ-2026-8000%'`)).rowCount;
  r.offers = (await db.query(`delete from public.comarketing_offers where human_readable_id like 'CMO-2026-8000%'`)).rowCount;
  r.listings = (await db.query(`delete from public.listings where human_readable_id like 'LST-2026-8000%'`)).rowCount;
  r.properties = (await db.query(`delete from public.properties where human_readable_id like 'PRP-2026-8000%'`)).rowCount;
  await db.query("commit");
  const { data: objs } = await storage.list("demo", { limit: 1000 });
  for (const o of objs ?? []) {
    const { data: inner } = await storage.list(`demo/${o.name}`, { limit: 100 });
    if (inner?.length) await storage.remove(inner.map((f) => `demo/${o.name}/${f.name}`));
  }
  console.log("Removed demo rows:", r);
}

async function seed() {
  const ids = {};
  for (const [k, email] of Object.entries(OWNER_EMAILS)) {
    const { rows } = await db.query("select id from auth.users where lower(email)=lower($1)", [email]);
    if (!rows[0]) throw new Error(`${k} (${email}) does not exist on staging — run the user seeds first`);
    ids[k] = rows[0].id;
  }
  const { rows: locRows } = await db.query(
    `select id, slug, ancestor_ids, path_names from public.locations where country_code='ID' and level='regency' and slug = any($1)`,
    [[...new Set(L.map((l) => l.regency))]]
  );
  const loc = Object.fromEntries(locRows.map((r) => [r.slug, r]));
  for (const l of L) if (!loc[l.regency]) throw new Error(`regency ${l.regency} missing in locations`);

  await db.query("begin");
  const summary = { listings: 0, media: 0, contacts: 0, leads: 0, lead_events: 0, intelligence: 0, tasks: 0, viewings: 0, offers: 0, requests: 0, submissions: 0 };
  const listingIds = {};

  // --- properties + listings --------------------------------------------
  for (const l of L) {
    const r = loc[l.regency];
    const ancestors = [...(r.ancestor_ids ?? []), r.id];
    const [province, regency] = r.path_names ?? [];
    const owner = ids[l.owner];
    const { rows: prop } = await db.query(
      `insert into public.properties
         (human_readable_id, agent_id, country_code, property_category, property_type, ownership_type,
          location_id, ancestor_location_ids, province_name, regency_name, district_name, geom,
          general_address, land_size, building_size, bedrooms, bathrooms, floors, floor_level, parking_spaces,
          year_built, furnishing, property_condition, facilities, created_by)
       values ($1,$2,'ID',$3,$4,$5,$6,$7,$8,$9,$10,
               extensions.st_setsrid(extensions.st_makepoint($11,$12),4326)::extensions.geography,
               $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$2)
       on conflict (human_readable_id) do update set
         agent_id = excluded.agent_id, property_type = excluded.property_type, land_size = excluded.land_size,
         building_size = excluded.building_size, bedrooms = excluded.bedrooms, bathrooms = excluded.bathrooms,
         facilities = excluded.facilities, general_address = excluded.general_address, archived_at = null
       returning id`,
      [hid("PRP", l.n), owner, l.cat, l.type, l.own, r.id, ancestors, province ?? null, regency ?? null, l.addr,
       l.lng, l.lat, l.addr, l.land ?? null, l.bld ?? null, l.bed ?? null, l.bath ?? null, l.floors ?? null,
       l.floorLevel ?? null, l.park ?? null, l.year ?? null, l.furn ?? null, l.cond ?? null, l.fac]
    );
    const propertyId = prop[0].id;
    await db.query(
      `insert into public.property_private (property_id, exact_address, owner_name, owner_phone, owner_authorisation_status, minimum_price, internal_notes)
       values ($1, $2, 'Pemilik Fiktif ' || $3, $4, 'obtained', $5, $6)
       on conflict (property_id) do update set minimum_price = excluded.minimum_price, internal_notes = excluded.internal_notes`,
      [propertyId, `${l.addr} (alamat privat fiktif)`, String(l.n), `+628120000${String(7000 + l.n).padStart(4, "0")}`,
       Math.round(l.price * 0.93), `[${MARK}] Harga minimum pemilik fiktif. Jangan tampilkan ke klien.`]
    );

    const approved = ["published", "paused", "sold"].includes(l.st);
    const slug = `${l.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60)}-${800000 + l.n}`;
    const { rows: lst } = await db.query(
      `insert into public.listings
         (human_readable_id, property_id, agent_id, listing_type, status, moderation_state, moderated_by, moderated_at,
          currency, price, rent_period, price_negotiable, language, title, description, key_selling_points, slug,
          published_at, expires_at, is_verified, created_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'IDR',$9,$10,true,'id',$11,$12,$13,$14,$15,$16,$17,$3, now() - ($18 || ' days')::interval)
       on conflict (human_readable_id) do update set
         agent_id = excluded.agent_id, status = excluded.status, moderation_state = excluded.moderation_state,
         price = excluded.price, title = excluded.title, description = excluded.description,
         key_selling_points = excluded.key_selling_points, published_at = excluded.published_at, archived_at = null
       returning id`,
      [hid("LST", l.n), propertyId, owner, l.lt, l.st, approved ? "approved" : "pending",
       approved ? ids.ADMIN : null, approved ? new Date() : null, l.price, l.lt === "rent" ? l.period : null,
       `[DEMO] ${l.title}`, `${l.desc}\n\n${MARK_ID}`, l.ksp, slug,
       l.st === "published" || l.st === "paused" || l.st === "sold" ? new Date(Date.now() - l.n * 86400000) : null,
       approved ? new Date(Date.now() + 90 * 86400000) : null, approved, String(l.n)]
    );
    listingIds[l.n] = lst[0].id;
    summary.listings++;

    // cover image: generated placeholder, uploaded to the public media bucket
    const png = await coverPng(l);
    const path = `demo/${lst[0].id}/cover.png`;
    const { error: upErr } = await storage.upload(path, png, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`upload ${path}: ${upErr.message}`);
    await db.query(`delete from public.listing_media where listing_id=$1 and storage_path like 'listing-media-public/demo/%'`, [lst[0].id]);
    await db.query(
      `insert into public.listing_media (listing_id, kind, storage_path, processed_path, thumbnail_path, position, is_cover, alt_text, width, height, byte_size, processing_state)
       values ($1,'image',$2,$2,$2,0,true,$3,1200,800,$4,'ready')`,
      [lst[0].id, `listing-media-public/${path}`, `${MARK} — ${l.title}`, png.byteLength]
    );
    summary.media++;
  }

  // --- contacts + leads + events + intelligence ---------------------------
  const leadIds = {};
  for (const ld of LEADS) {
    const { rows: c } = await db.query(
      `insert into public.contacts (human_readable_id, full_name, phone, email, preferred_language, source, marketing_consent)
       values ($1, $2, $3, $4, 'id', $5, false)
       on conflict (human_readable_id) do update set full_name = excluded.full_name, email = excluded.email, source = excluded.source
       returning id`,
      [hid("CON", ld.n), `${ld.name} (demo)`, `+628120000${String(8000 + ld.n).padStart(4, "0")}`,
       `demo.lead${String(ld.n).padStart(2, "0")}@example.com`, ld.source]
    );
    const listingId = listingIds[ld.listing.n];
    const createdAt = new Date(Date.now() - ld.daysAgo * 86400000);
    const due = ld.overdue ? new Date(createdAt.getTime() + 2 * 3600000) : new Date(createdAt.getTime() + 2 * 3600000);
    const respondedAt = ld.responded ? new Date(createdAt.getTime() + 45 * 60000) : null;
    const { rows: lr } = await db.query(
      `insert into public.leads (human_readable_id, contact_id, listing_id, agent_id, status, message, inquiry_type, source, locale,
                                 first_response_due, first_responded_at, ghl_sync_pending, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'id',$9,$10,false,$11)
       on conflict (human_readable_id) do update set
         status = excluded.status, message = excluded.message, listing_id = excluded.listing_id, agent_id = excluded.agent_id,
         first_response_due = excluded.first_response_due, first_responded_at = excluded.first_responded_at, created_at = excluded.created_at
       returning id`,
      [hid("LEAD", ld.n), c[0].id, listingId, ids[ld.listing.owner], ld.status, ld.message, ld.inquiryType, ld.source, due, respondedAt, createdAt]
    );
    leadIds[ld.n] = lr[0].id;
    summary.contacts++; summary.leads++;

    await db.query("delete from public.lead_events where lead_id=$1", [lr[0].id]);
    const detail = { demo: true, budget_idr: ld.budget, preferred_location: ld.regencyName, property_type: ld.listing.type, intent: ld.intent, priority: ld.priority, source: ld.source };
    await db.query(
      `insert into public.lead_events (lead_id, kind, detail, actor_id, created_at) values ($1,'inquiry.received',$2,null,$3)`,
      [lr[0].id, JSON.stringify(detail), createdAt]
    );
    summary.lead_events++;
    if (ld.status !== "new") {
      await db.query(
        `insert into public.lead_events (lead_id, kind, detail, actor_id, created_at) values ($1,'status.changed',$2,$3,$4)`,
        [lr[0].id, JSON.stringify({ from: "new", to: ld.status, demo: true }), ids[ld.listing.owner], new Date(createdAt.getTime() + 3600000)]
      );
      summary.lead_events++;
    }
    const signals = [`anggaran Rp ${ld.budget.toLocaleString("id-ID")}`, `lokasi ${ld.regencyName}`, `prioritas ${ld.priority}`];
    if (ld.inquiryType === "viewing_request") signals.push("minta jadwal survey");
    if (ld.inquiryType === "financing") signals.push("tanya KPR");
    await db.query(
      `insert into public.lead_intelligence (lead_id, intent, reason, signals, suggested_action, source, model)
       values ($1,$2,$3,$4,$5,'rules',null)
       on conflict (lead_id) do update set intent = excluded.intent, reason = excluded.reason, signals = excluded.signals, suggested_action = excluded.suggested_action, source = 'rules', model = null, computed_at = now()`,
      [lr[0].id, INTENT_BY_STATUS[ld.status], `[${MARK}] Skor berbasis aturan dari pesan dan status ${ld.status}.`, JSON.stringify(signals), ACTION_BY_STATUS[ld.status]]
    );
    summary.intelligence++;
  }

  // --- tasks (delete-by-marker, then insert) ------------------------------
  await db.query(`delete from public.agent_tasks where notes like '[${MARK}]%'`);
  const KIND_BY_STATUS = { contact_attempted: "call", contacted: "follow_up", qualified: "message", property_matched: "message", viewing_proposed: "viewing", viewing_confirmed: "viewing", nurture: "follow_up" };
  for (const ld of LEADS) {
    const kind = KIND_BY_STATUS[ld.status];
    if (!kind) continue;
    const done = ld.status === "viewing_confirmed" || ld.n % 5 === 0;
    const dueAt = new Date(Date.now() + ((ld.n % 7) - 2) * 86400000); // some overdue, some upcoming
    await db.query(
      `insert into public.agent_tasks (agent_id, title, notes, due_at, kind, source, lead_id, listing_id, status, done_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [ids[ld.listing.owner], `${ACTION_BY_STATUS[ld.status].slice(0, 120)} — ${ld.name}`,
       `[${MARK}] Tugas contoh untuk lead ${hid("LEAD", ld.n)}.`, dueAt, kind, ld.n % 3 === 0 ? "manual" : "ai_manager",
       leadIds[ld.n], listingIds[ld.listing.n], done ? "done" : "open", done ? new Date() : null]
    );
    summary.tasks++;
  }
  // two listing-only tasks so the Listings module shows work too
  for (const [i, l] of [L[4], L[18]].entries()) {
    await db.query(
      `insert into public.agent_tasks (agent_id, title, notes, due_at, kind, source, listing_id, status)
       values ($1,$2,$3,now() + interval '1 day',$4,'ai_manager',$5,'open')`,
      [ids[l.owner], `Lengkapi foto & dokumen ${hid("LST", l.n)} agar lolos moderasi`, `[${MARK}] Tugas contoh listing ${i + 1}.`, "document", listingIds[l.n]]
    );
    summary.tasks++;
  }

  // --- viewings for leads at viewing stage --------------------------------
  let v = 0;
  for (const ld of LEADS.filter((x) => x.status.startsWith("viewing_"))) {
    v++;
    await db.query(
      `insert into public.viewing_appointments (human_readable_id, submission_id, lead_id, listing_id, proposed_by, proposed_date, proposed_time, viewing_type, meeting_point, notes, status)
       values ($1, null, $2, $3, $4, (current_date + $5::int), '10:00', 'physical', $6, $7, $8)
       on conflict (human_readable_id) do update set lead_id = excluded.lead_id, status = excluded.status, proposed_date = excluded.proposed_date`,
      [hid("VIEW", v), leadIds[ld.n], listingIds[ld.listing.n], ids[ld.listing.owner], 1 + (v % 5), `Lobi / depan ${ld.listing.addr}`,
       `[${MARK}] Jadwal survey contoh.`, ld.status === "viewing_confirmed" ? "confirmed" : "requested"]
    );
    summary.viewings++;
  }

  // --- co-marketing: 4 open-pool offers --------------------------------------
  for (const [i, n] of [1, 6, 10, 16].entries()) {
    const l = L[n - 1];
    const { rows: off } = await db.query(
      `insert into public.comarketing_offers
         (human_readable_id, listing_id, listing_agent_id, status, scope, commission_basis, total_commission_pct,
          marketing_agent_share_pct, payer, allow_price_display, max_marketing_agents, requires_la_approval, notes, created_by)
       values ($1,$2,$3,'active','open_pool','total_pct',2.5,50,'owner',true,5,false,$4,$3)
       on conflict (human_readable_id) do update set status='active', listing_id = excluded.listing_id, listing_agent_id = excluded.listing_agent_id
       returning id`,
      [hid("CMO", i + 1), listingIds[n], ids[l.owner], `[${MARK}] Penawaran pool contoh — boleh dipasarkan agen lain.`]
    );
    await db.query(
      `insert into public.comarketing_offer_private (offer_id, min_marketing_price, internal_notes)
       values ($1, $2, $3) on conflict (offer_id) do update set min_marketing_price = excluded.min_marketing_price`,
      [off[0].id, Math.round(l.price * 0.95), `[${MARK}] Jangan di bawah harga ini.`]
    );
    summary.offers++;
  }

  // --- MatchHub: 2 requirements + 2 submissions -------------------------------
  const REQS = [
    { n: 1, owner: "RA", title: "Rumah 3-4 kamar Jakarta Selatan, budget 3-5 M", desc: "Klien keluarga pindahan dari Surabaya, butuh dekat sekolah internasional.", tx: "buy", cat: "residential", prov: "DKI Jakarta", city: "Jakarta Selatan", min: 3_000_000_000, max: 5_000_000_000, bed: 3 },
    { n: 2, owner: "IDA", title: "Villa sewa tahunan Canggu/Berawa, 2-3 kamar", desc: "Klien digital nomad, kontrak 1 tahun, butuh kolam renang dan ruang kerja.", tx: "rent", cat: "residential", prov: "Bali", city: "Kab. Badung", min: 250_000_000, max: 450_000_000, bed: 2 },
  ];
  const reqIds = {};
  for (const r of REQS) {
    const { rows } = await db.query(
      `insert into public.property_requests
         (human_readable_id, requesting_agent_id, title, description, transaction_type, property_category, client_type, priority,
          country_code, state_region, city, currency, budget_min, budget_max, measurement_unit, bedrooms_min, status, approved_by, approved_at)
       values ($1,$2,$3,$4,$5,$6,'individual','normal','ID',$7,$8,'IDR',$9,$10,'sqm',$11,'receiving_submissions',$12,now())
       on conflict (human_readable_id) do update set status='receiving_submissions', requesting_agent_id = excluded.requesting_agent_id, title = excluded.title
       returning id`,
      [hid("REQ", r.n), ids[r.owner], `[DEMO] ${r.title}`, `${r.desc}\n\n${MARK_ID}`, r.tx, r.cat, r.prov, r.city, r.min, r.max, r.bed, ids.ADMIN]
    );
    reqIds[r.n] = rows[0].id;
    await db.query(
      `insert into public.property_request_private (request_id, internal_notes) values ($1, $2)
       on conflict (request_id) do update set internal_notes = excluded.internal_notes`,
      [rows[0].id, `[${MARK}] Catatan internal contoh — tidak untuk supply agent.`]
    );
    summary.requests++;
  }
  const SUBS = [
    { n: 1, req: 1, owner: "LA", from: L[0], status: "submitted" },
    { n: 2, req: 2, owner: "MA", from: L[15], status: "shortlisted" },
  ];
  for (const s of SUBS) {
    const l = s.from;
    const { rows } = await db.query(
      `insert into public.property_submissions
         (human_readable_id, request_id, supply_agent_id, status, title, property_category, property_type, country_code, state_region, city, district,
          currency, asking_price, negotiable, measurement_unit, built_up, land_area, bedrooms, bathrooms, car_parks, furnishing, tenure,
          source_type, risk_indicator, client_safe_remarks, availability_status, owner_confirmation_status, appointment_status,
          commission_type, commission_percentage, commission_currency)
       values ($1,$2,$3,$4,$5,$6,$7,'ID',$8,$9,$10,'IDR',$11,'yes','sqm',$12,$13,$14,$15,$16,$17,$18,
               'direct_written_appointment','verified_direct',$19,'available','confirmed','written_appointment','percentage',2.5,'IDR')
       on conflict (human_readable_id) do update set status = excluded.status, request_id = excluded.request_id, supply_agent_id = excluded.supply_agent_id
       returning id`,
      [hid("SUB", s.n), reqIds[s.req], ids[s.owner], s.status, `[DEMO] ${l.title}`, l.cat, l.type,
       loc[l.regency].path_names?.[0] ?? null, loc[l.regency].path_names?.[1] ?? null, l.addr, l.price,
       l.bld ?? null, l.land ?? null, l.bed ?? null, l.bath ?? null, l.park ?? null, l.furn ?? "unfurnished", l.own,
       `[${MARK}] ${l.ksp.join(", ")}.`]
    );
    await db.query(
      `insert into public.property_submission_private (submission_id, min_acceptable_price, internal_remarks) values ($1,$2,$3)
       on conflict (submission_id) do update set min_acceptable_price = excluded.min_acceptable_price`,
      [rows[0].id, Math.round(l.price * 0.94), `[${MARK}] Harga minimum fiktif.`]
    );
    await db.query("delete from public.submission_status_history where submission_id=$1", [rows[0].id]);
    await db.query(
      `insert into public.submission_status_history (submission_id, previous_status, new_status, changed_by, actor_role) values ($1,null,'submitted',$2,'supply_agent')`,
      [rows[0].id, ids[s.owner]]
    );
    if (s.status === "shortlisted") {
      await db.query(
        `insert into public.submission_status_history (submission_id, previous_status, new_status, changed_by, actor_role) values ($1,'submitted','shortlisted',$2,'requesting_agent')`,
        [rows[0].id, ids[REQS[s.req - 1].owner]]
      );
    }
    summary.submissions++;
  }

  await db.query("commit");

  // --- verification counts (fresh queries after commit) -------------------
  const { rows: counts } = await db.query(`
    select
      (select count(*) from public.listings where human_readable_id like 'LST-2026-8000%') listings,
      (select count(*) from public.listing_media where storage_path like 'listing-media-public/demo/%') media,
      (select count(*) from public.leads where human_readable_id like 'LEAD-2026-8000%') leads,
      (select count(*) from public.contacts where human_readable_id like 'CON-2026-8000%') contacts,
      (select count(*) from public.lead_intelligence li join public.leads l on l.id=li.lead_id where l.human_readable_id like 'LEAD-2026-8000%') intelligence,
      (select count(*) from public.agent_tasks where notes like '[${MARK}]%') tasks,
      (select count(*) from public.viewing_appointments where human_readable_id like 'VIEW-2026-8000%') viewings,
      (select count(*) from public.comarketing_offers where human_readable_id like 'CMO-2026-8000%') offers,
      (select count(*) from public.property_requests where human_readable_id like 'REQ-2026-8000%') requests,
      (select count(*) from public.property_submissions where human_readable_id like 'SUB-2026-8000%') submissions`);
  const { rows: byOwner } = await db.query(`
    select u.email, count(distinct l.id) listings, count(distinct ld.id) leads
      from auth.users u
      left join public.listings l on l.agent_id=u.id and l.human_readable_id like 'LST-2026-8000%'
      left join public.leads ld on ld.agent_id=u.id and ld.human_readable_id like 'LEAD-2026-8000%'
     where u.id = any($1) group by u.email order by u.email`, [Object.values(ids)]);
  const { rows: byStatus } = await db.query(`select status, count(*) from public.leads where human_readable_id like 'LEAD-2026-8000%' group by 1 order by 1`);
  const { rows: lstStatus } = await db.query(`select status, count(*) from public.listings where human_readable_id like 'LST-2026-8000%' group by 1 order by 1`);
  console.log(JSON.stringify({ ref, inserted: summary, verified: counts[0], listingStatus: lstStatus, leadStatus: byStatus, byOwner }, null, 2));
}

try {
  if (REMOVE) await remove(); else await seed();
} catch (err) {
  await db.query("rollback").catch(() => {});
  console.error("Demo seed failed, rolled back:", err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
