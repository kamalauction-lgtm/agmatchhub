import type { HelpTopic } from "./types";

/** Admin playbook. Amend with the feature; bump `updated`. */
export const ADMIN_TOPICS: HelpTopic[] = [
  {
    slug: "daily-routine",
    audience: "admin",
    updated: "2026-11-19",
    title: { en: "Your daily routine", id: "Rutinitas harian" },
    summary: {
      en: "Start every day with the Action queue and the New agents list.",
      id: "Mulai setiap hari dari Antrean tindakan dan daftar Agen baru.",
    },
    path: "/admin",
    sections: [
      {
        heading: { en: "Every morning", id: "Setiap pagi" },
        steps: [
          { en: "Open Overview. The Action queue lists what is waiting, most urgent first: scam reports, overdue leads, listings to review, certificates and agents to review, failed photos, expiring invitations.", id: "Buka Ringkasan. Antrean tindakan menampilkan yang menunggu, paling mendesak di atas: laporan penipuan, prospek terlambat, listing untuk ditinjau, sertifikat dan agen untuk ditinjau, foto gagal, undangan yang hampir kedaluwarsa.", shot: "a-overview-queue" },
          { en: "Press each item to open it and act. It leaves the queue when handled.", id: "Tekan setiap item untuk membukanya dan bertindak. Item hilang dari antrean setelah ditangani.", shot: "a-overview-queue" },
          { en: "Open Agent verification. It opens on New agents (joined in the last 24 hours). Check each one (next guide).", id: "Buka Verifikasi agen. Halaman terbuka di Agen baru (bergabung 24 jam terakhir). Periksa satu per satu (panduan berikutnya).", shot: "a-nav-agents" },
        ],
        notes: [
          { en: "You only see the countries you are responsible for. Every action you take is recorded in the audit trail with your name.", id: "Anda hanya melihat negara yang menjadi tanggung jawab Anda. Setiap tindakan tercatat di jejak audit dengan nama Anda." },
          { en: "The menu on the left: type in “Find a page” to jump anywhere, press a group title to fold it, and use the button at the top to shrink the menu to icons. On a phone or tablet, press Menu.", id: "Menu di sebelah kiri: ketik di “Cari halaman” untuk langsung menuju halaman mana pun, tekan judul grup untuk melipatnya, dan gunakan tombol di atas untuk mengecilkan menu menjadi ikon. Di ponsel atau tablet, tekan Menu." },
        ],
      },
    ],
  },
  {
    slug: "new-agents",
    audience: "admin",
    updated: "2026-11-19",
    title: { en: "Review new agents; suspend or ban", id: "Meninjau agen baru; menangguhkan atau memblokir" },
    summary: {
      en: "New agents work straight away; you check them afterwards and stop anyone who looks like a scam.",
      id: "Agen baru langsung bisa bekerja; Anda memeriksanya setelahnya dan menghentikan yang terlihat seperti penipuan.",
    },
    path: "/admin/agents",
    sections: [
      {
        heading: { en: "Check new agents", id: "Periksa agen baru" },
        steps: [
          { en: "Open Agent verification → New agents. Widen the window to 48 h, 72 h or 7 days when needed.", id: "Buka Verifikasi agen → Agen baru. Perlebar rentang ke 48 jam, 72 jam, atau 7 hari bila perlu.", shot: "a-agents-window" },
          { en: "Open an agent. Check name, country, company, contact and their first listings.", id: "Buka agen. Periksa nama, negara, perusahaan, kontak, dan listing pertama mereka.", shot: "a-agent-open" },
          { en: "Wrong country? Change it on the agent's page (only admins can).", id: "Negara salah? Ubah di halaman agen (hanya admin yang bisa).", shot: "a-agent-detail" },
        ],
      },
      {
        heading: { en: "Stop an agent", id: "Menghentikan agen" },
        steps: [
          { en: "Suspend (temporary): write the reason and press Suspend. Their live listings are paused and they cannot work. Restore puts them back, with the listings that were paused.", id: "Tangguhkan (sementara): tulis alasan lalu tekan Tangguhkan. Listing aktif dijeda dan agen tidak dapat bekerja. Pulihkan mengembalikan agen beserta listing yang dijeda.", shot: "a-agent-suspend" },
          { en: "Ban (scams): open “Ban this agent”, write the reason and press Ban agent. It cannot be undone from this screen.", id: "Blokir (penipuan): buka “Blokir agen ini”, tulis alasan lalu tekan Blokir agen. Tidak dapat dibatalkan dari layar ini.", shot: "a-agent-ban" },
        ],
        notes: [
          { en: "Super admins can switch on “New agents need admin approval” in Feature switches. Then new agents wait for you; agents who already have access keep it.", id: "Super admin dapat menyalakan “Agen baru perlu persetujuan admin” di Sakelar fitur. Agen baru lalu menunggu persetujuan; agen yang sudah punya akses tetap memilikinya." },
        ],
      },
    ],
  },
  {
    slug: "open-agent-account",
    audience: "admin",
    updated: "2026-11-19",
    title: { en: "Bring in an agent from another platform", id: "Mengajak agen dari platform lain" },
    summary: {
      en: "Call the agent, get their permission, open their account, and bring their listings over.",
      id: "Telepon agen, minta izin, buatkan akun, lalu pindahkan listing mereka.",
    },
    path: "/admin/agents/onboard",
    sections: [
      {
        heading: { en: "1 · The call", id: "1 · Telepon" },
        steps: [
          { en: "Introduce the platform and ask whether they want an account.", id: "Perkenalkan platform dan tanyakan apakah mereka ingin dibuatkan akun." },
          { en: "Ask clearly, one by one, whether we may: open an account for them; copy their listings from the platform they use now; publish those listings on their behalf.", id: "Tanyakan dengan jelas, satu per satu, apakah kami boleh: membuatkan akun; menyalin listing dari platform yang mereka gunakan sekarang; menerbitkan listing tersebut atas nama mereka.", shot: "a-onboard-consent" },
          { en: "Confirm their email (it becomes their username) and WhatsApp number. Ask them to have their original photos ready.", id: "Konfirmasi email (menjadi nama pengguna) dan nomor WhatsApp. Minta mereka menyiapkan foto asli.", shot: "a-onboard-details" },
        ],
        notes: [
          { en: "Only record what the agent actually agreed to. If they say no to publishing, leave that box unticked.", id: "Catat hanya yang benar-benar disetujui agen. Jika mereka tidak setuju untuk penerbitan, jangan centang kotak itu." },
        ],
      },
      {
        heading: { en: "2 · Open the account", id: "2 · Buat akun" },
        steps: [
          { en: "Open Agent verification → Open an account.", id: "Buka Verifikasi agen → Buka akun agen.", shot: "a-nav-onboard" },
          { en: "Fill in name, email, WhatsApp, country, and where they list now (for example their portal profile link).", id: "Isi nama, email, WhatsApp, negara, dan platform asal (misalnya tautan profil portal mereka).", shot: "a-onboard-details" },
          { en: "Record the permission: how they agreed (phone call), when, and the boxes they agreed to. Add a note if useful. Tick the confirmation box.", id: "Catat izin: cara persetujuan (telepon), waktunya, dan kotak yang mereka setujui. Tambahkan catatan bila perlu. Centang kotak konfirmasi.", shot: "a-onboard-consent" },
          { en: "Choose the language and press Open the account. The agent is emailed a temporary password.", id: "Pilih bahasa lalu tekan Buat akun. Kata sandi sementara dikirim ke email agen.", shot: "a-onboard-submit" },
          { en: "Copy the WhatsApp message shown on the screen (it disappears in 5 minutes) and send it to the agent on WhatsApp.", id: "Salin pesan WhatsApp yang muncul di layar (hilang dalam 5 menit) dan kirim ke agen lewat WhatsApp.", shot: "a-onboard-list" },
        ],
        notes: [
          { en: "The agent must choose their own password at first sign-in. Lost the message? In “Accounts opened for agents”, press New temporary password (only while they have not signed in).", id: "Agen wajib memilih kata sandi sendiri saat pertama masuk. Pesan hilang? Di “Akun yang dibuatkan untuk agen”, tekan Kata sandi sementara baru (hanya selama agen belum masuk)." },
          { en: "Never send a password by SMS. WhatsApp only.", id: "Jangan pernah mengirim kata sandi lewat SMS. Hanya WhatsApp." },
        ],
      },
      {
        heading: { en: "3 · Bring their listings over", id: "3 · Pindahkan listing mereka" },
        steps: [
          { en: "Open Assisted import, choose the agent, and paste their portal links or upload their spreadsheet.", id: "Buka Impor berbantuan, pilih agen, lalu tempel tautan portal atau unggah spreadsheet mereka.", shot: "a-imports-forms" },
          { en: "Open the batch and check every item: title, price, type, location. Skip duplicates or anything wrong.", id: "Buka batch dan periksa setiap item: judul, harga, jenis, lokasi. Lewati duplikat atau yang salah.", shot: "a-batch-items" },
          { en: "If the agent agreed to publishing on their behalf, press “Publish N for the agent”. Otherwise press Hand over and the agent publishes them.", id: "Jika agen setuju diterbitkan atas namanya, tekan “Terbitkan N untuk agen”. Jika tidak, tekan Serahkan dan agen yang menerbitkan.", shot: "a-batch-publish" },
          { en: "Published for the agent? Open Listings → Moderation and approve them (you may approve these yourself).", id: "Sudah diterbitkan untuk agen? Buka Listing → Moderasi lalu setujui (Anda boleh menyetujuinya sendiri).", shot: "a-mod-decide" },
          { en: "Ask the agent to add their original photos to each listing.", id: "Minta agen menambahkan foto asli pada setiap listing." },
        ],
        notes: [
          { en: "Do not copy photos from other portals and never remove watermarks: the watermark belongs to that portal, and removing it breaks copyright law. Ask the agent for the originals.", id: "Jangan menyalin foto dari portal lain dan jangan pernah menghapus watermark: watermark milik portal tersebut, dan menghapusnya melanggar hukum hak cipta. Minta foto asli dari agen." },
          { en: "The agent can edit or withdraw any listing at any time.", id: "Agen dapat mengubah atau menarik listing mana pun kapan saja." },
        ],
      },
    ],
  },
  {
    slug: "invitations",
    audience: "admin",
    updated: "2026-11-19",
    title: { en: "Invitations", id: "Undangan" },
    summary: {
      en: "Invite an agent to register themselves with a personal link.",
      id: "Undang agen untuk mendaftar sendiri dengan tautan pribadi.",
    },
    path: "/admin/agents/invitations",
    sections: [
      {
        heading: { en: "Send an invitation", id: "Mengirim undangan" },
        steps: [
          { en: "Open Invitations, fill in name, email, phone, country and agency, and create it.", id: "Buka Undangan, isi nama, email, telepon, negara, dan agensi, lalu buat.", shot: "a-invite-form" },
          { en: "Copy the link shown once and send it to the agent on WhatsApp.", id: "Salin tautan yang muncul sekali dan kirim ke agen lewat WhatsApp.", shot: "a-invite-form" },
          { en: "Resend gives a new link; Revoke cancels an unused one.", id: "Kirim ulang memberi tautan baru; Cabut membatalkan tautan yang belum dipakai.", shot: "a-invite-actions" },
        ],
        notes: [
          { en: "Use “Open an account” instead when the agent asked you to set everything up for them.", id: "Gunakan “Buka akun agen” jika agen meminta Anda menyiapkan semuanya." },
        ],
      },
    ],
  },
  {
    slug: "moderation",
    audience: "admin",
    updated: "2026-11-19",
    title: { en: "Listing moderation, reports and changes", id: "Moderasi listing, laporan, dan perubahan" },
    summary: {
      en: "Approve or reject listings, handle buyer reports, and ask agents for changes.",
      id: "Setujui atau tolak listing, tangani laporan pembeli, dan minta perubahan dari agen.",
    },
    path: "/admin/listings",
    sections: [
      {
        heading: { en: "Approve or reject", id: "Menyetujui atau menolak" },
        steps: [
          { en: "Open Listings → Moderation.", id: "Buka Listing → Moderasi.", shot: "a-mod-tabs" },
          { en: "Check title, price, location, description and photos.", id: "Periksa judul, harga, lokasi, deskripsi, dan foto.", shot: "a-mod-decide" },
          { en: "Approve to publish. To reject, choose a reason code, add a note the agent will read, and press Reject.", id: "Setujui untuk menerbitkan. Untuk menolak, pilih kode alasan, tambahkan catatan untuk agen, lalu tekan Tolak.", shot: "a-mod-decide" },
        ],
        notes: [
          { en: "You cannot approve a listing you prepared for an agent, unless the agent agreed to publishing on their behalf. Ask another admin.", id: "Anda tidak dapat menyetujui listing yang Anda siapkan untuk agen, kecuali agen setuju diterbitkan atas namanya. Minta admin lain." },
        ],
      },
      {
        heading: { en: "Buyer reports and change requests", id: "Laporan pembeli dan permintaan perubahan" },
        steps: [
          { en: "Reports: buyers report listings with “Report this listing”. Open the report, check the listing, and decide. Scam reports come first in the queue.", id: "Laporan: pembeli melaporkan listing lewat “Laporkan listing ini”. Buka laporan, periksa listing, lalu putuskan. Laporan penipuan tampil paling atas.", shot: "a-mod-reports" },
          { en: "Handover: ask the agent a question or for a change on a listing; when they answer, it returns to your queue.", id: "Serah terima: ajukan pertanyaan atau minta perubahan pada listing; saat agen menjawab, item kembali ke antrean Anda.", shot: "a-nav-handover" },
        ],
      },
    ],
  },
  {
    slug: "badges-review",
    audience: "admin",
    updated: "2026-11-19",
    title: { en: "Verified badge and certificate reviews", id: "Peninjauan lencana Terverifikasi dan sertifikat" },
    summary: {
      en: "Check identity documents for the Verified badge and certificate proof for Certified.",
      id: "Periksa dokumen identitas untuk lencana Terverifikasi dan bukti sertifikat untuk Bersertifikat.",
    },
    path: "/admin/agents",
    sections: [
      {
        heading: { en: "Verified Agent badge", id: "Lencana Agen Terverifikasi" },
        steps: [
          { en: "In Agent verification choose Under review and open the agent.", id: "Di Verifikasi agen pilih Sedang ditinjau lalu buka agen.", shot: "a-review-tab" },
          { en: "Open the licence and identity documents and compare them with the details.", id: "Buka dokumen lisensi dan identitas, lalu bandingkan dengan datanya.", shot: "a-agent-detail" },
          { en: "Approve, Request information (say what is missing), or Reject with a note.", id: "Setujui, Minta informasi (sebutkan yang kurang), atau Tolak dengan catatan.", shot: "a-agent-decision" },
        ],
      },
      {
        heading: { en: "Certificates (✓ Certified)", id: "Sertifikat (✓ Bersertifikat)" },
        steps: [
          { en: "From “Certificate to review” in the Action queue, open the agent's Certificate panel.", id: "Dari “Sertifikat untuk ditinjau” di Antrean tindakan, buka panel Sertifikat pada agen.", shot: "a-overview-queue" },
          { en: "Press Open the proof and check the number, name and valid-until date. A red warning means another agent uses the same number — check carefully.", id: "Tekan Buka bukti dan periksa nomor, nama, dan tanggal berlaku. Peringatan merah berarti agen lain memakai nomor yang sama — periksa dengan teliti.", shot: "a-agent-detail" },
          { en: "Approve, or Reject with a reason (required). The agent is notified either way.", id: "Setujui, atau Tolak dengan alasan (wajib). Agen akan diberi tahu dalam kedua kasus.", shot: "a-agent-detail" },
        ],
      },
    ],
  },
  {
    slug: "companies",
    audience: "admin",
    updated: "2026-11-19",
    title: { en: "Company directory and AG Hero partners", id: "Direktori perusahaan dan mitra AG Hero" },
    summary: {
      en: "Confirm companies agents add, and mark which agencies are AG Hero partners.",
      id: "Konfirmasi perusahaan yang ditambahkan agen, dan tandai agensi mitra AG Hero.",
    },
    path: "/admin/organisations",
    sections: [
      {
        heading: { en: "Keep the directory clean", id: "Menjaga direktori tetap rapi" },
        steps: [
          { en: "Open Organisations. Unconfirmed companies (added by agents) are listed first.", id: "Buka Organisasi. Perusahaan yang belum dikonfirmasi (ditambahkan agen) tampil paling atas.", shot: "a-orgs" },
          { en: "Check the name is a real agency in that country, then press Confirm.", id: "Pastikan nama tersebut agensi yang benar-benar ada di negara itu, lalu tekan Konfirmasi.", shot: "a-orgs" },
          { en: "Make AG Hero partner turns on the AG Hero card for that agency's agents. IQI Indonesia and IQI Malaysia are partners today.", id: "Jadikan mitra AG Hero menyalakan kartu AG Hero untuk agen agensi tersebut. Saat ini IQI Indonesia dan IQI Malaysia adalah mitra.", shot: "a-nav-hero" },
        ],
      },
    ],
  },
  {
    slug: "people-and-settings",
    audience: "admin",
    updated: "2026-11-19",
    title: { en: "Team access and platform settings", id: "Akses tim dan pengaturan platform" },
    summary: {
      en: "For super admins: give your team roles, and manage countries and switches.",
      id: "Untuk super admin: berikan peran ke tim, dan kelola negara serta sakelar.",
    },
    path: "/admin/users",
    sections: [
      {
        heading: { en: "Give a team member access", id: "Memberi akses ke anggota tim" },
        steps: [
          { en: "Open People & access.", id: "Buka Orang & akses.", shot: "a-users-current" },
          { en: "New person: in Register a person enter name and email, choose a role (Country Admin plus countries is safest) and press Register and send email. They set their own password from the email.", id: "Orang baru: di Daftarkan seseorang isi nama dan email, pilih peran (Country Admin plus negara paling aman) lalu tekan Daftarkan dan kirim email. Mereka mengatur kata sandi sendiri dari email.", shot: "a-users-register" },
          { en: "Existing account: in Grant a role, search the person, choose the role and countries, and press Grant role. Revoke removes it.", id: "Akun yang sudah ada: di Berikan peran, cari orangnya, pilih peran dan negara, lalu tekan Berikan peran. Cabut untuk menghapus.", shot: "a-users-grant" },
        ],
      },
      {
        heading: { en: "Settings", id: "Pengaturan" },
        steps: [
          { en: "Countries: switch a country on or off. A country that is off does not appear at registration. Licence and certificate types per country are set by the technical team on request.", id: "Negara: nyalakan atau matikan negara. Negara yang dimatikan tidak muncul saat pendaftaran. Jenis lisensi dan sertifikat per negara diatur oleh tim teknis atas permintaan.", shot: "a-nav-countries" },
          { en: "Feature switches: for example “New agents need admin approval”.", id: "Sakelar fitur: misalnya “Agen baru perlu persetujuan admin”.", shot: "a-nav-flags" },
          { en: "Audit: who did what and when, for every important action.", id: "Audit: siapa melakukan apa dan kapan, untuk setiap tindakan penting.", shot: "a-nav-audit" },
        ],
        notes: [
          { en: "Never share your password, and never put an agent's personal data in a public chat group.", id: "Jangan pernah membagikan kata sandi, dan jangan menaruh data pribadi agen di grup chat publik." },
        ],
      },
    ],
  },
  {
    slug: "international-admin",
    audience: "admin",
    updated: "2026-11-21",
    title: { en: "International listings: people in charge, publishing and enquiries", id: "Listing internasional: penanggung jawab, penerbitan, dan pertanyaan" },
    summary: {
      en: "For super admins: set who answers for each country, decide which overseas listings are on show, and follow up buyer enquiries.",
      id: "Untuk super admin: tentukan siapa yang menjawab untuk tiap negara, pilih listing luar negeri yang ditampilkan, dan tindak lanjuti pertanyaan pembeli.",
    },
    path: "/admin/international",
    sections: [
      {
        heading: { en: "People in charge", id: "Penanggung jawab" },
        steps: [
          { en: "Open International in the menu. It opens on People in charge.", id: "Buka Internasional di menu. Halaman terbuka di Penanggung jawab." },
          { en: "Read “Who buyers reach, by country” first. Every country with published listings is listed with the person a buyer is sent to. A country marked “No person in charge” needs someone.", id: "Baca dulu “Siapa yang dihubungi pembeli, per negara”. Setiap negara yang punya listing terbit ditampilkan bersama orang yang dituju pembeli. Negara bertanda “Belum ada penanggung jawab” perlu diisi." },
          { en: "To add a person, fill in “Add a person in charge”: display name, WhatsApp number in international format (+ and the country code), and optionally an email and a role label.", id: "Untuk menambah orang, isi “Tambah penanggung jawab”: nama tampilan, nomor WhatsApp dalam format internasional (+ dan kode negara), serta email dan label jabatan bila perlu." },
          { en: "Choose the countries: tick “Covers all countries”, or tick the countries one by one. A country that is not on the list can be typed as a two-letter code. Press Add person in charge.", id: "Pilih negaranya: centang “Mencakup semua negara”, atau centang negara satu per satu. Negara yang belum ada di daftar bisa diketik sebagai kode dua huruf. Tekan Tambah penanggung jawab." },
          { en: "To change someone, press Edit on their card. Deactivate stops buyers being sent to them without losing the record; Delete removes them for good.", id: "Untuk mengubah seseorang, tekan Ubah pada kartunya. Nonaktifkan menghentikan pengarahan pembeli tanpa menghapus datanya; Hapus menghapusnya secara permanen." },
        ],
        notes: [
          { en: "A person named for a country comes before a person who covers all countries. When two people cover the same country, the lower order number wins.", id: "Orang yang ditunjuk untuk suatu negara didahulukan dari orang yang mencakup semua negara. Bila dua orang mencakup negara yang sama, nomor urut yang lebih kecil yang dipakai." },
          { en: "The name and WhatsApp number are shown publicly on the listings. Only enter a number the person has agreed to publish. Messages are WhatsApp only, never SMS.", id: "Nama dan nomor WhatsApp ditampilkan untuk umum pada listing. Masukkan hanya nomor yang sudah disetujui pemiliknya untuk dipublikasikan. Pesan hanya lewat WhatsApp, tidak pernah SMS." },
        ],
      },
      {
        heading: { en: "Publish or withdraw a listing", id: "Menerbitkan atau menarik listing" },
        steps: [
          { en: "Open the Listings tab. Listings arrive from the partner catalogue every week; their content is not edited here.", id: "Buka tab Listing. Listing masuk dari katalog mitra setiap minggu; isinya tidak diubah di sini." },
          { en: "Filter by country or status to find what you need, then press Apply.", id: "Saring berdasarkan negara atau status untuk menemukan yang dicari, lalu tekan Terapkan." },
          { en: "Press Publish to show a listing on the marketplace and to agents. Press Withdraw to hide it again.", id: "Tekan Terbitkan untuk menampilkan listing di marketplace dan kepada agen. Tekan Tarik untuk menyembunyikannya kembali." },
        ],
        notes: [
          { en: "Before you publish listings in a new country, check that the country has a person in charge. Every publish and withdraw is recorded in the audit trail with your name.", id: "Sebelum menerbitkan listing di negara baru, pastikan negara itu sudah punya penanggung jawab. Setiap penerbitan dan penarikan tercatat di jejak audit dengan nama Anda." },
        ],
      },
      {
        heading: { en: "Read the enquiries", id: "Membaca pertanyaan" },
        steps: [
          { en: "Open the Enquiries tab. The newest is on top, with the buyer, the listing, the country and the person in charge it went to. The number on the tab counts new enquiries.", id: "Buka tab Pertanyaan. Yang terbaru di atas, lengkap dengan pembeli, listing, negara, dan penanggung jawab yang dituju. Angka pada tab menunjukkan jumlah pertanyaan baru." },
          { en: "Press the phone number to open a WhatsApp chat with the buyer.", id: "Tekan nomor telepon untuk membuka chat WhatsApp dengan pembeli." },
          { en: "Press Mark contacted once someone has replied to the buyer, and Close when nothing more is needed.", id: "Tekan Tandai dihubungi setelah pembeli dibalas, dan Tutup bila tidak ada lagi yang perlu dilakukan." },
        ],
        notes: [
          { en: "Exchange rates tab: the IDR and USD figures on listings are estimates calculated from these rates. The price in the listing's own currency is the real one.", id: "Tab Kurs: angka IDR dan USD pada listing adalah perkiraan yang dihitung dari kurs ini. Harga dalam mata uang asli listing adalah harga yang sebenarnya." },
        ],
      },
    ],
  },
];
