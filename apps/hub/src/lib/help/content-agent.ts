import type { HelpTopic } from "./types";

/** Agent playbook. Amend with the feature; bump `updated`. */
export const AGENT_TOPICS: HelpTopic[] = [
  {
    slug: "getting-started",
    audience: "agent",
    updated: "2026-11-19",
    title: { en: "Getting started", id: "Memulai" },
    summary: {
      en: "Create your account, confirm your email and sign in for the first time.",
      id: "Buat akun, konfirmasi email, dan masuk untuk pertama kali.",
    },
    path: "/register",
    sections: [
      {
        heading: { en: "Register yourself", id: "Mendaftar sendiri" },
        steps: [
          { en: "Open the platform and choose Register.", id: "Buka platform dan pilih Daftar." },
          { en: "Enter your display name and choose the country where you work. This decides which licence types and which admin team you see, and only an admin can change it later.", id: "Isi nama tampilan dan pilih negara tempat Anda bekerja. Ini menentukan jenis lisensi dan tim admin yang menangani Anda; setelah itu hanya admin yang dapat mengubahnya.", shot: "g-register-who" },
          { en: "Enter your email and a password of at least 8 characters, twice, and press Register.", id: "Isi email dan kata sandi minimal 8 karakter, dua kali, lalu tekan Daftar.", shot: "g-register-login" },
          { en: "Open the confirmation email and press its link. The link works for 24 hours. Check Spam or Promotions if you cannot find it.", id: "Buka email konfirmasi dan tekan tautannya. Tautan berlaku 24 jam. Periksa folder Spam atau Promosi jika tidak menemukannya.", shot: "g-login-resend" },
          { en: "Sign in. You can use the platform straight away; there is no waiting for approval.", id: "Masuk. Anda langsung dapat menggunakan platform; tidak perlu menunggu persetujuan.", shot: "g-login" },
        ],
        notes: [
          { en: "No email, or the link expired? On the sign-in page choose “Didn't get the confirmation email?”, enter your email and press Send a new link.", id: "Email tidak masuk atau tautan kedaluwarsa? Di halaman masuk pilih “Tidak menerima email konfirmasi?”, isi email Anda lalu tekan Kirim tautan baru." },
        ],
      },
      {
        heading: { en: "If an admin opened your account", id: "Jika admin membuatkan akun Anda" },
        steps: [
          { en: "You receive an email (and a WhatsApp message from the admin) with your email address and a temporary password.", id: "Anda menerima email (dan pesan WhatsApp dari admin) berisi alamat email dan kata sandi sementara." },
          { en: "Sign in with them. You are taken straight to “Choose your password”.", id: "Masuk dengan data tersebut. Anda langsung diarahkan ke “Pilih kata sandi Anda”.", shot: "g-login" },
          { en: "Choose your own password (at least 8 characters), twice, and save. The temporary password stops working.", id: "Pilih kata sandi Anda sendiri (minimal 8 karakter), dua kali, lalu simpan. Kata sandi sementara tidak berlaku lagi." },
        ],
        notes: [
          { en: "Did not agree to an account? Reply to the email and the team will close it.", id: "Tidak pernah setuju dibuatkan akun? Balas email tersebut dan tim akan menutup akunnya." },
        ],
      },
      {
        heading: { en: "Forgot your password", id: "Lupa kata sandi" },
        steps: [
          { en: "On the sign-in page choose Forgot password, enter your email and send.", id: "Di halaman masuk pilih Lupa kata sandi, isi email lalu kirim.", shot: "g-login-forgot" },
          { en: "Open the email, press the link and choose a new password.", id: "Buka email, tekan tautannya dan pilih kata sandi baru." },
        ],
      },
    ],
  },
  {
    slug: "profile-and-company",
    audience: "agent",
    updated: "2026-11-19",
    title: { en: "Your profile, company and AG Hero", id: "Profil, perusahaan, dan AG Hero" },
    summary: {
      en: "Photo, contact details, your agency from the directory, and the AG Hero card for IQI agents.",
      id: "Foto, kontak, agensi Anda dari direktori, dan kartu AG Hero untuk agen IQI.",
    },
    path: "/profile",
    sections: [
      {
        heading: { en: "Profile details", id: "Data profil" },
        steps: [
          { en: "Open My profile.", id: "Buka Profil saya.", shot: "g-nav-profile" },
          { en: "Add a profile photo. It is cleaned automatically: location and camera data are removed before it is shown.", id: "Tambahkan foto profil. Foto dibersihkan otomatis: data lokasi dan kamera dihapus sebelum ditampilkan.", shot: "g-profile-photo" },
          { en: "Check your display name, WhatsApp and mobile number, and write a short biography. Save.", id: "Periksa nama tampilan, nomor WhatsApp dan ponsel, lalu tulis biografi singkat. Simpan.", shot: "g-profile-save" },
        ],
      },
      {
        heading: { en: "My company", id: "Perusahaan saya" },
        steps: [
          { en: "In My company, type your agency's name and press Search.", id: "Di Perusahaan saya, ketik nama agensi lalu tekan Cari.", shot: "g-profile-company" },
          { en: "Press “This is my company” next to the right result.", id: "Tekan “Ini perusahaan saya” di samping hasil yang sesuai.", shot: "g-profile-company" },
          { en: "Not listed? Use “Not listed? Add your company”, check the name and press Add and use. It shows “awaiting confirmation” until an admin confirms it.", id: "Tidak ada? Gunakan “Tidak ada? Tambahkan perusahaan Anda”, periksa namanya lalu tekan Tambah dan gunakan. Statusnya “menunggu konfirmasi” sampai admin mengonfirmasi.", shot: "g-profile-company" },
        ],
        notes: [
          { en: "You only see agencies in your own country.", id: "Anda hanya melihat agensi di negara Anda." },
          { en: "Agents of an AG Hero partner agency (IQI Indonesia, IQI Malaysia) see “My AG Hero account” at the bottom of the profile and can link their Hero account to receive the launch benefits.", id: "Agen dari agensi mitra AG Hero (IQI Indonesia, IQI Malaysia) melihat “Akun AG Hero saya” di bagian bawah profil dan dapat menautkan akun Hero untuk mendapatkan manfaat peluncuran." },
        ],
      },
    ],
  },
  {
    slug: "badges",
    audience: "agent",
    updated: "2026-11-19",
    title: { en: "Verified Agent and Certified badges", id: "Lencana Agen Terverifikasi dan Bersertifikat" },
    summary: {
      en: "Two optional badges: Verified (your identity) and Certified (your government certificate).",
      id: "Dua lencana opsional: Terverifikasi (identitas) dan Bersertifikat (sertifikat pemerintah).",
    },
    path: "/verification",
    sections: [
      {
        heading: { en: "✓ Verified Agent (personal identification)", id: "✓ Agen Terverifikasi (identitas pribadi)" },
        steps: [
          { en: "Press “Get verified” in the side menu, or open the Verification page.", id: "Tekan “Dapatkan verifikasi” di menu samping, atau buka halaman Verifikasi.", shot: "g-verification" },
          { en: "Fill in your legal name, agency, licence type and number (your country decides the licence types), state and city.", id: "Isi nama sesuai identitas, agensi, jenis dan nomor lisensi (jenis lisensi mengikuti negara Anda), provinsi dan kota.", shot: "g-verification" },
          { en: "Upload your licence and your identity document, then press Apply for the badge.", id: "Unggah lisensi dan dokumen identitas, lalu tekan Ajukan lencana.", shot: "g-verification" },
          { en: "An admin reviews it. Once approved, the ✓ Verified Agent badge shows on your listings, card and profile.", id: "Admin akan meninjaunya. Setelah disetujui, lencana ✓ Agen Terverifikasi tampil di listing, kartu, dan profil Anda." },
        ],
        notes: [
          { en: "The badge is optional. You can use the whole platform while you wait.", id: "Lencana ini opsional. Anda tetap dapat menggunakan seluruh platform selama menunggu." },
        ],
      },
      {
        heading: { en: "✓ Certified (government certificate)", id: "✓ Bersertifikat (sertifikat pemerintah)" },
        steps: [
          { en: "In My profile, find Certificate (optional). It appears where your country requires a certificate (Indonesia today).", id: "Di Profil saya, cari Sertifikat (opsional). Bagian ini muncul jika negara Anda mewajibkan sertifikat (saat ini Indonesia).", shot: "g-profile-certificate" },
          { en: "Enter the certificate number and its valid-until date, and attach a photo or PDF of the certificate (up to 5 MB). The proof is required and only admins can see it.", id: "Isi nomor sertifikat dan tanggal berlakunya, lalu lampirkan foto atau PDF sertifikat (maksimal 5 MB). Bukti wajib dilampirkan dan hanya admin yang dapat melihatnya.", shot: "g-profile-certificate" },
          { en: "Press Submit for review. The status shows Awaiting review, ✓ Certified, Rejected (with the reason) or Expired.", id: "Tekan Kirim untuk ditinjau. Statusnya: Menunggu peninjauan, ✓ Bersertifikat, Ditolak (dengan alasan), atau Kedaluwarsa.", shot: "g-profile-certificate" },
        ],
        notes: [
          { en: "When approved, your public profile shows “✓ Certified · number”. It disappears automatically when the certificate expires; you get a reminder 30 days before. Renewed it? Submit the new certificate.", id: "Setelah disetujui, profil publik Anda menampilkan “✓ Bersertifikat · nomor”. Akan hilang otomatis saat sertifikat kedaluwarsa; Anda diingatkan 30 hari sebelumnya. Sudah diperpanjang? Kirim sertifikat baru." },
        ],
      },
    ],
  },
  {
    slug: "listings",
    audience: "agent",
    updated: "2026-11-19",
    title: { en: "Listings: create, publish, change, withdraw", id: "Listing: membuat, menerbitkan, mengubah, menarik" },
    summary: {
      en: "Every listing is checked by a moderator before it goes public.",
      id: "Setiap listing diperiksa moderator sebelum tampil publik.",
    },
    path: "/listings",
    sections: [
      {
        heading: { en: "Create a listing", id: "Membuat listing" },
        steps: [
          { en: "Open Listings and press + New listing.", id: "Buka Listing dan tekan + Listing baru.", shot: "g-listings-new" },
          { en: "Go through the steps: Listing type, Location, Unit details, Price, Description, Photos, Review.", id: "Ikuti langkahnya: Jenis listing, Lokasi, Detail unit, Harga, Deskripsi, Foto, Tinjau.", shot: "g-listings-wizard" },
          { en: "Use your own photos. Photos are cleaned of location data automatically.", id: "Gunakan foto milik Anda sendiri. Data lokasi pada foto dihapus otomatis.", shot: "g-listings-wizard" },
          { en: "Press Submit for review. The listing waits for a moderator, then goes live on the marketplace.", id: "Tekan Kirim untuk ditinjau. Listing menunggu moderator, lalu tampil di marketplace.", shot: "g-listings-wizard" },
        ],
      },
      {
        heading: { en: "Drafts, rejections and withdrawing", id: "Draf, penolakan, dan penarikan" },
        steps: [
          { en: "A draft (for example an imported listing) shows Submit for review. Press it when the listing is ready.", id: "Draf (misalnya listing hasil impor) menampilkan tombol Kirim untuk ditinjau. Tekan saat listing sudah siap.", shot: "g-listings-actions" },
          { en: "Rejected? Read the reason under the listing, press Edit, fix it, and submit again.", id: "Ditolak? Baca alasannya di bawah listing, tekan Ubah, perbaiki, lalu kirim lagi.", shot: "g-listings-actions" },
          { en: "To take a listing off the market, press Withdraw. You can submit it again later.", id: "Untuk menurunkan listing dari pasar, tekan Tarik kembali. Anda dapat mengirimnya lagi nanti.", shot: "g-listings-actions" },
          { en: "Editing a live listing sends it back for a quick review before the change shows.", id: "Mengubah listing yang sedang tayang akan mengirimnya kembali untuk ditinjau singkat sebelum perubahan tampil.", shot: "g-listings-actions" },
        ],
        notes: [
          { en: "A moderator may ask a question about a listing; it shows as a badge on the listing. Open it, answer, and save.", id: "Moderator dapat mengajukan pertanyaan tentang listing; tampil sebagai lencana pada listing. Buka, jawab, lalu simpan." },
        ],
      },
    ],
  },
  {
    slug: "import-listings",
    audience: "agent",
    updated: "2026-11-19",
    title: { en: "Importing listings from other platforms", id: "Mengimpor listing dari platform lain" },
    summary: {
      en: "Bring your existing listings in from a portal link or a spreadsheet — yourself, or with an admin's help.",
      id: "Pindahkan listing Anda dari tautan portal atau spreadsheet — sendiri, atau dibantu admin.",
    },
    path: "/listings/import",
    sections: [
      {
        heading: { en: "Import yourself", id: "Impor sendiri" },
        steps: [
          { en: "Open Import listings.", id: "Buka Impor listing.", shot: "g-nav-import" },
          { en: "Paste the link to your listing or profile on the other portal, or upload a spreadsheet.", id: "Tempel tautan listing atau profil Anda di portal lain, atau unggah spreadsheet.", shot: "g-import-portal" },
          { en: "Review each item: correct the title, price, type and location. Skip anything you do not want.", id: "Periksa setiap item: perbaiki judul, harga, jenis, dan lokasi. Lewati yang tidak diinginkan." },
          { en: "Accept the declaration that these are your listings and you may publish them, and import. They arrive as drafts in Listings.", id: "Setujui pernyataan bahwa listing ini milik Anda dan Anda berhak menerbitkannya, lalu impor. Listing masuk sebagai draf di Listing." },
          { en: "Add your own photos to each listing and press Submit for review.", id: "Tambahkan foto milik Anda pada setiap listing lalu tekan Kirim untuk ditinjau.", shot: "g-listings-actions" },
        ],
        notes: [
          { en: "Photos are not copied from other portals. Upload your original photos — photos with another portal's watermark cannot be used.", id: "Foto tidak disalin dari portal lain. Unggah foto asli Anda — foto dengan watermark portal lain tidak dapat digunakan." },
        ],
      },
      {
        heading: { en: "When an admin prepared it for you", id: "Jika admin sudah menyiapkannya" },
        steps: [
          { en: "You get a notification that listings were prepared. Open it to review them and import, as above.", id: "Anda menerima notifikasi bahwa listing sudah disiapkan. Buka untuk meninjau dan mengimpornya, seperti di atas.", shot: "g-nav-notifications" },
          { en: "If you agreed by phone that the team may publish for you, the admin publishes them and you get a notification. They appear in Listings; you can still edit or withdraw any of them.", id: "Jika Anda sudah setuju lewat telepon bahwa tim boleh menerbitkan atas nama Anda, admin akan menerbitkannya dan Anda menerima notifikasi. Listing tampil di Listing; Anda tetap dapat mengubah atau menarik listing mana pun.", shot: "g-nav-notifications" },
        ],
      },
    ],
  },
  {
    slug: "matchhub",
    audience: "agent",
    updated: "2026-11-19",
    title: { en: "MatchHub and co-marketing", id: "MatchHub dan pemasaran bersama" },
    summary: {
      en: "Find properties for your clients through other agents, and share listings under agreed commission terms.",
      id: "Cari properti untuk klien melalui agen lain, dan bagikan listing dengan komisi yang disepakati.",
    },
    path: "/requests",
    sections: [
      {
        heading: { en: "Client requirements (buyer side)", id: "Kebutuhan klien (sisi pembeli)" },
        steps: [
          { en: "Open Client requirements and press New requirement.", id: "Buka Kebutuhan klien dan tekan Kebutuhan baru.", shot: "g-requests-new" },
          { en: "Describe what your client needs: type, area, budget and must-haves. Save. An admin approves it.", id: "Jelaskan kebutuhan klien: jenis, area, anggaran, dan syarat wajib. Simpan. Admin akan menyetujuinya.", shot: "g-requests-new" },
          { en: "Other agents submit matching properties. Shortlist the good ones; only approved properties reach your client, without the other agent's identity.", id: "Agen lain mengajukan properti yang cocok. Pilih yang sesuai; hanya properti yang disetujui yang sampai ke klien, tanpa identitas agen lain.", shot: "g-requests-list" },
        ],
      },
      {
        heading: { en: "Submitting and co-marketing (supply side)", id: "Mengajukan dan pemasaran bersama (sisi penjual)" },
        steps: [
          { en: "Wanted board and My submissions: answer other agents' requirements with your properties.", id: "Papan Dicari dan Pengajuan saya: jawab kebutuhan agen lain dengan properti Anda.", shot: "g-nav-wanted" },
          { en: "Co-marketing: pick up a listing another agent opened to the pool. Its commission terms are recorded when you accept them and cannot be changed.", id: "Pemasaran bersama: ambil listing yang dibuka agen lain ke pool. Ketentuan komisi tercatat saat Anda menerimanya dan tidak dapat diubah.", shot: "g-nav-pool" },
        ],
        notes: [
          { en: "Clients never see another agent's name, commission or minimum price.", id: "Klien tidak pernah melihat nama agen lain, komisi, atau harga minimum." },
        ],
      },
    ],
  },
  {
    slug: "daily-work",
    audience: "agent",
    updated: "2026-11-21",
    title: { en: "Leads, tasks, card and notifications", id: "Prospek, tugas, kartu, dan notifikasi" },
    summary: {
      en: "Answer buyers quickly, keep track of viewings, and share your digital name card.",
      id: "Tanggapi pembeli dengan cepat, catat jadwal survei, dan bagikan kartu nama digital.",
    },
    path: "/leads",
    sections: [
      {
        heading: { en: "Every day", id: "Setiap hari" },
        steps: [
          { en: "Leads: new buyer enquiries from the marketplace. Reply quickly; the response time is measured.", id: "Prospek: pertanyaan baru dari pembeli di marketplace. Balas cepat; waktu respons diukur.", shot: "g-leads" },
          { en: "Tasks: follow-ups and viewings, with reminders.", id: "Tugas: tindak lanjut dan jadwal survei, dengan pengingat.", shot: "g-nav-tasks" },
          { en: "Notifications (bell): approvals, questions from moderators, certificate decisions and reminders.", id: "Notifikasi (ikon lonceng): persetujuan, pertanyaan moderator, keputusan sertifikat, dan pengingat.", shot: "g-nav-notifications" },
          { en: "My name card: your public digital card with your listings and badges. Share its link on WhatsApp.", id: "Kartu nama saya: kartu digital publik berisi listing dan lencana Anda. Bagikan tautannya lewat WhatsApp.", shot: "g-nav-card" },
        ],
        notes: [
          { en: "The menu on the left: press a group title to fold it, and use the button at the top to shrink the menu to icons. On a phone, the bar at the bottom has your daily pages and Menu (top left) has everything else. The moon or sun button at the top (inside Menu on a phone) switches between light and dark.", id: "Menu di sebelah kiri: tekan judul grup untuk melipatnya, dan gunakan tombol di atas untuk mengecilkan menu menjadi ikon. Di ponsel, bilah di bawah berisi halaman harian Anda dan Menu (kiri atas) berisi semua halaman lainnya. Tombol bulan atau matahari di atas (di dalam Menu pada ponsel) mengganti tampilan terang dan gelap." },
        ],
      },
    ],
  },
];
