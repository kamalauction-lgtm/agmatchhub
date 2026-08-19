/**
 * Starter training guides (module: Training & guides, 00054). Idempotent —
 * keyed by category+position, re-running updates the translations in place.
 *
 * These are the launch set: how-tos for the platform's own modules, written
 * from the modules as they actually behave. Admins extend and edit them at
 * /admin/training; nothing here is required for the module to function.
 *
 * Usage: node scripts/seed-training.mjs --env=<env-or-path>
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const { url } = loadEnv();

/** [category, position, {locale: [title, body]}] */
const GUIDES = [
  [
    "platform", 1,
    {
      id: [
        "Terbitkan listing pertama Anda",
        "Buka Listing → Iklan baru. Wizard 7 langkah memandu Anda: tipe properti, lokasi, detail unit, harga, deskripsi, foto, lalu tinjauan.\n\nTips supaya cepat disetujui moderasi:\n• Gunakan foto terang, minimal 4, tanpa watermark agensi lain.\n• Judul memuat lokasi dan jumlah kamar — pembeli mencari dengan itu.\n• Di langkah deskripsi, pilih \"Bantu saya menulis\" — draf dibuat dari data yang sudah Anda isi, lalu Anda edit.\n\nSetelah dikirim, listing masuk antrean moderasi. Anda akan menerima notifikasi saat terbit atau jika perlu diperbaiki.",
      ],
      en: [
        "Publish your first listing",
        "Open Listings → New listing. The 7-step wizard walks you through: property type, location, unit details, price, description, photos, then review.\n\nTips for fast moderation approval:\n• Use bright photos, at least 4, without another agency's watermark.\n• Put the location and bedroom count in the title — buyers search with those.\n• On the description step, choose \"Help me write\" — a draft is built from the fields you already filled in, then you edit it.\n\nAfter submitting, the listing enters the moderation queue. You will be notified when it goes live or needs fixes.",
      ],
      ms: [
        "Terbitkan iklan pertama anda",
        "Buka Iklan → Iklan baharu. Wizard 7 langkah memandu anda: jenis hartanah, lokasi, butiran unit, harga, penerangan, foto, kemudian semakan.\n\nTip untuk kelulusan moderasi yang cepat:\n• Gunakan foto terang, sekurang-kurangnya 4, tanpa tera air agensi lain.\n• Letakkan lokasi dan bilangan bilik dalam tajuk — pembeli mencari dengan itu.\n• Pada langkah penerangan, pilih \"Bantu saya menulis\" — draf dibina daripada medan yang anda isi, kemudian anda sunting.\n\nSelepas dihantar, iklan masuk barisan moderasi. Anda akan dimaklumkan apabila ia tersiar atau perlu dibaiki.",
      ],
    },
  ],
  [
    "platform", 2,
    {
      id: [
        "Balas leads sebelum SLA habis",
        "Setiap pertanyaan dari marketplace masuk ke Leads dengan batas waktu respons. Brief Harian di dasbor menampilkan leads yang menunggu — itulah daftar kerja Anda tiap pagi.\n\nKenapa penting: leads yang dibalas cepat jauh lebih mungkin jadi survey. Leads yang lewat SLA tercatat, dan performa respons memengaruhi reputasi Anda di platform.\n\nRutinitas yang disarankan: buka dasbor, kerjakan Brief Harian dari atas ke bawah, baru lanjut aktivitas lain.",
      ],
      en: [
        "Reply to leads before the SLA expires",
        "Every marketplace inquiry lands in Leads with a response deadline. The daily brief on your dashboard surfaces waiting leads — that is your morning work list.\n\nWhy it matters: leads answered fast are far more likely to become viewings. Leads past the SLA are recorded, and response performance affects your standing on the platform.\n\nSuggested routine: open the dashboard, work the daily brief top to bottom, then move on to everything else.",
      ],
      ms: [
        "Balas prospek sebelum SLA tamat",
        "Setiap pertanyaan dari marketplace masuk ke Prospek dengan tarikh akhir respons. Taklimat harian pada papan pemuka memaparkan prospek yang menunggu — itulah senarai kerja pagi anda.\n\nMengapa penting: prospek yang dibalas cepat jauh lebih berkemungkinan menjadi lawatan. Prospek melepasi SLA direkodkan, dan prestasi respons mempengaruhi kedudukan anda di platform.\n\nRutin dicadangkan: buka papan pemuka, selesaikan taklimat harian dari atas ke bawah, kemudian teruskan aktiviti lain.",
      ],
    },
  ],
  [
    "marketing", 3,
    {
      id: [
        "Ubah satu listing jadi konten dengan Studio",
        "Buka Studio konten, pilih listing (milik sendiri atau pinjaman co-marketing), dan Anda mendapat empat aset sekaligus:\n\n• WhatsApp — broadcast singkat, siap kirim ke chat, grup, dan status.\n• Caption — versi panjang untuk Instagram/Facebook dengan hashtag dari data listing.\n• Gambar — poster feed 1080×1080 dan story 1080×1920 dari foto sampul.\n• Brosur — satu halaman untuk dicetak atau disimpan sebagai PDF.\n\nSemua draf dibuat hanya dari fakta listing — tidak ada yang dikarang. Edit dulu, baru bagikan. Untuk listing pinjaman, tautan otomatis mengarah ke halaman Anda, bukan agen aslinya.",
      ],
      en: [
        "Turn one listing into content with the Studio",
        "Open the Content studio, pick a listing (your own or borrowed via co-marketing), and you get four assets at once:\n\n• WhatsApp — a short broadcast ready for chats, groups and status.\n• Caption — a longer Instagram/Facebook version with hashtags from the listing's data.\n• Images — a 1080×1080 feed poster and 1080×1920 story from the cover photo.\n• Brochure — one page to print or save as PDF.\n\nEvery draft is built only from the listing's facts — nothing is invented. Edit first, then share. For borrowed listings the link automatically points to YOUR page, not the original agent's.",
      ],
      ms: [
        "Tukar satu iklan kepada kandungan dengan Studio",
        "Buka Studio kandungan, pilih iklan (milik sendiri atau pinjaman co-marketing), dan anda mendapat empat aset sekaligus:\n\n• WhatsApp — siaran ringkas sedia untuk sembang, kumpulan dan status.\n• Kapsyen — versi panjang untuk Instagram/Facebook dengan hashtag daripada data iklan.\n• Imej — poster feed 1080×1080 dan story 1080×1920 daripada foto muka depan.\n• Brosur — satu halaman untuk dicetak atau disimpan sebagai PDF.\n\nSetiap draf dibina hanya daripada fakta iklan — tiada yang direka. Sunting dahulu, kemudian kongsi. Untuk iklan pinjaman, pautan automatik menghala ke halaman ANDA, bukan ejen asal.",
      ],
    },
  ],
  [
    "sales", 4,
    {
      id: [
        "Pinjam listing lewat co-marketing",
        "Tidak punya stok? Buka Pemasaran bersama. Agen lain menawarkan listing mereka dengan pembagian komisi yang jelas di muka.\n\nCara kerjanya:\n1. Telusuri pool dan lihat persentase komisi untuk agen pemasar.\n2. Ambil listing — syaratnya terkunci saat itu juga dan tercatat.\n3. Listing muncul di halaman publik Anda dan di Studio konten, dengan kontak Anda.\n\nAturan yang melindungi semua pihak: satu pemilik per listing (tidak ada pinjam berantai), harga minimum pemilik tidak pernah terlihat, dan marketplace utama selalu menampilkan agen pemegang mandat.",
      ],
      en: [
        "Borrow listings via co-marketing",
        "No inventory? Open Co-marketing. Other agents offer their listings with the commission split stated up front.\n\nHow it works:\n1. Browse the pool and see the marketing agent's commission share.\n2. Pick a listing up — the terms lock at that moment and are recorded.\n3. The listing appears on your public page and in the Content studio, carrying your contact.\n\nRules that protect everyone: one owner per listing (no chain borrowing), the owner's floor price is never visible, and the main marketplace always shows the mandate-holding agent.",
      ],
      ms: [
        "Pinjam iklan melalui co-marketing",
        "Tiada stok? Buka Pemasaran bersama. Ejen lain menawarkan iklan mereka dengan pembahagian komisen yang dinyatakan di awal.\n\nCara ia berfungsi:\n1. Layari pool dan lihat peratusan komisen ejen pemasaran.\n2. Ambil iklan — terma terkunci pada saat itu dan direkodkan.\n3. Iklan muncul di halaman awam anda dan dalam Studio kandungan, membawa kenalan anda.\n\nPeraturan yang melindungi semua pihak: satu pemilik bagi setiap iklan (tiada pinjaman berantai), harga minimum pemilik tidak pernah kelihatan, dan marketplace utama sentiasa memaparkan ejen pemegang mandat.",
      ],
    },
  ],
];

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();

try {
  await db.query("begin");
  for (const [category, position, translations] of GUIDES) {
    const { rows } = await db.query(
      `select id from public.training_guides where category = $1 and position = $2`,
      [category, position]
    );
    let guideId = rows[0]?.id;
    if (!guideId) {
      const ins = await db.query(
        `insert into public.training_guides (category, position, is_published)
         values ($1, $2, true) returning id`,
        [category, position]
      );
      guideId = ins.rows[0].id;
    }
    for (const [locale, [title, body]] of Object.entries(translations)) {
      await db.query(
        `insert into public.training_guide_translations (guide_id, locale, title, body)
         values ($1, $2, $3, $4)
         on conflict (guide_id, locale) do update set title = excluded.title, body = excluded.body`,
        [guideId, locale, title, body]
      );
    }
  }
  await db.query("commit");
  console.log(`Seeded ${GUIDES.length} guides × 3 locales.`);
} catch (e) {
  await db.query("rollback");
  throw e;
} finally {
  await db.end();
}
