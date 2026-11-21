import type { HelpTopic } from "./types";

/** Agent playbook. Amend with the feature; bump `updated`. */
export const AGENT_TOPICS: HelpTopic[] = [
  {
    slug: "getting-started",
    audience: "agent",
    updated: "2026-11-21",
    title: { en: "Getting started", id: "Memulai", ms: "Bermula" },
    summary: {
      en: "Create your account, confirm your email and sign in for the first time.",
      id: "Buat akun, konfirmasi email, dan masuk untuk pertama kali.", ms: "Cipta akaun anda, sahkan e-mel anda dan log masuk buat kali pertama.",
    },
    path: "/register",
    sections: [
      {
        heading: { en: "Register yourself", id: "Mendaftar sendiri", ms: "Daftar sendiri" },
        steps: [
          { en: "Open the platform and choose Register.", id: "Buka platform dan pilih Daftar.", ms: "Buka platform dan pilih Daftar." },
          { en: "Enter your display name and choose the country where you work. This decides which licence types and which admin team you see, and only an admin can change it later.", id: "Isi nama tampilan dan pilih negara tempat Anda bekerja. Ini menentukan jenis lisensi dan tim admin yang menangani Anda; setelah itu hanya admin yang dapat mengubahnya.", ms: "Masukkan nama paparan anda dan pilih negara tempat anda bekerja. Ini menentukan jenis lesen dan pasukan admin yang anda nampak, dan hanya admin boleh menukarnya kemudian.", shot: "g-register-who" },
          { en: "Enter your email and a password of at least 8 characters, twice, and press Register.", id: "Isi email dan kata sandi minimal 8 karakter, dua kali, lalu tekan Daftar.", ms: "Masukkan e-mel anda dan kata laluan sekurang-kurangnya 8 aksara, dua kali, dan tekan Daftar.", shot: "g-register-login" },
          { en: "Open the confirmation email and press its link. The link works for 24 hours. Check Spam or Promotions if you cannot find it.", id: "Buka email konfirmasi dan tekan tautannya. Tautan berlaku 24 jam. Periksa folder Spam atau Promosi jika tidak menemukannya.", ms: "Buka e-mel pengesahan dan tekan pautannya. Pautan itu sah selama 24 jam. Semak folder Spam atau Promosi jika anda tidak menjumpainya.", shot: "g-login-resend" },
          { en: "Sign in. You can use the platform straight away; there is no waiting for approval.", id: "Masuk. Anda langsung dapat menggunakan platform; tidak perlu menunggu persetujuan.", ms: "Log masuk. Anda boleh terus menggunakan platform; tidak perlu menunggu kelulusan.", shot: "g-login" },
        ],
        notes: [
          { en: "No email, or the link expired? On the sign-in page choose “Didn't get the confirmation email?”, enter your email and press Send a new link.", id: "Email tidak masuk atau tautan kedaluwarsa? Di halaman masuk pilih “Tidak menerima email konfirmasi?”, isi email Anda lalu tekan Kirim tautan baru.", ms: "Tiada e-mel, atau pautan sudah tamat tempoh? Pada halaman log masuk pilih “Tidak menerima e-mel pengesahan?”, masukkan e-mel anda dan tekan Hantar pautan baharu." },
        ],
      },
      {
        heading: { en: "If an admin opened your account", id: "Jika admin membuatkan akun Anda", ms: "Jika admin membuka akaun anda" },
        steps: [
          { en: "You receive an email (and a WhatsApp message from the admin) with your email address and a temporary password.", id: "Anda menerima email (dan pesan WhatsApp dari admin) berisi alamat email dan kata sandi sementara.", ms: "Anda menerima e-mel (dan mesej WhatsApp daripada admin) berisi alamat e-mel anda dan kata laluan sementara." },
          { en: "Sign in with them. You are taken straight to “Choose your password”.", id: "Masuk dengan data tersebut. Anda langsung diarahkan ke “Pilih kata sandi Anda”.", ms: "Log masuk dengannya. Anda terus dibawa ke “Pilih kata laluan anda”.", shot: "g-login" },
          { en: "Choose your own password (at least 8 characters), twice, and save. The temporary password stops working.", id: "Pilih kata sandi Anda sendiri (minimal 8 karakter), dua kali, lalu simpan. Kata sandi sementara tidak berlaku lagi.", ms: "Pilih kata laluan anda sendiri (sekurang-kurangnya 8 aksara), dua kali, dan simpan. Kata laluan sementara tidak lagi berfungsi." },
        ],
        notes: [
          { en: "Did not agree to an account? Reply to the email and the team will close it.", id: "Tidak pernah setuju dibuatkan akun? Balas email tersebut dan tim akan menutup akunnya.", ms: "Tidak bersetuju dengan akaun ini? Balas e-mel itu dan pasukan akan menutupnya." },
        ],
      },
      {
        heading: { en: "Forgot your password", id: "Lupa kata sandi", ms: "Lupa kata laluan" },
        steps: [
          { en: "On the sign-in page choose Forgot password, enter your email and send.", id: "Di halaman masuk pilih Lupa kata sandi, isi email lalu kirim.", ms: "Pada halaman log masuk pilih Lupa kata laluan?, masukkan e-mel anda dan hantar.", shot: "g-login-forgot" },
          { en: "Open the email, press the link and choose a new password.", id: "Buka email, tekan tautannya dan pilih kata sandi baru.", ms: "Buka e-mel itu, tekan pautannya dan pilih kata laluan baharu." },
        ],
      },
    ],
  },
  {
    slug: "profile-and-company",
    audience: "agent",
    updated: "2026-11-21",
    title: { en: "Your profile, company and AG Hero", id: "Profil, perusahaan, dan AG Hero", ms: "Profil, syarikat dan AG Hero anda" },
    summary: {
      en: "Photo, contact details, your agency from the directory, and the AG Hero card for IQI agents.",
      id: "Foto, kontak, agensi Anda dari direktori, dan kartu AG Hero untuk agen IQI.", ms: "Foto, maklumat hubungan, agensi anda daripada direktori, dan kad AG Hero untuk ejen IQI.",
    },
    path: "/profile",
    sections: [
      {
        heading: { en: "Profile details", id: "Data profil", ms: "Butiran profil" },
        steps: [
          { en: "Open My profile.", id: "Buka Profil saya.", ms: "Buka Profil saya.", shot: "g-nav-profile" },
          { en: "Add a profile photo. It is cleaned automatically: location and camera data are removed before it is shown.", id: "Tambahkan foto profil. Foto dibersihkan otomatis: data lokasi dan kamera dihapus sebelum ditampilkan.", ms: "Tambah foto profil. Ia dibersihkan secara automatik: data lokasi dan kamera dibuang sebelum ia dipaparkan.", shot: "g-profile-photo" },
          { en: "Check your display name, WhatsApp and mobile number, and write a short biography. Save.", id: "Periksa nama tampilan, nomor WhatsApp dan ponsel, lalu tulis biografi singkat. Simpan.", ms: "Semak nama paparan, WhatsApp dan nombor telefon bimbit anda, dan tulis biografi ringkas. Simpan.", shot: "g-profile-save" },
        ],
      },
      {
        heading: { en: "My company", id: "Perusahaan saya", ms: "Syarikat saya" },
        steps: [
          { en: "In My company, type your agency's name and press Search.", id: "Di Perusahaan saya, ketik nama agensi lalu tekan Cari.", ms: "Dalam Syarikat saya, taip nama agensi anda dan tekan Cari.", shot: "g-profile-company" },
          { en: "Press “This is my company” next to the right result.", id: "Tekan “Ini perusahaan saya” di samping hasil yang sesuai.", ms: "Tekan “Ini syarikat saya” di sebelah hasil yang betul.", shot: "g-profile-company" },
          { en: "Not listed? Use “Not listed? Add your company”, check the name and press Add and use. It shows “awaiting confirmation” until an admin confirms it.", id: "Tidak ada? Gunakan “Tidak ada? Tambahkan perusahaan Anda”, periksa namanya lalu tekan Tambah dan gunakan. Statusnya “menunggu konfirmasi” sampai admin mengonfirmasi.", ms: "Tiada dalam senarai? Guna “Tiada? Tambah syarikat anda”, semak namanya dan tekan Tambah dan guna. Ia memaparkan “menunggu pengesahan” sehingga admin mengesahkannya.", shot: "g-profile-company" },
        ],
        notes: [
          { en: "You only see agencies in your own country.", id: "Anda hanya melihat agensi di negara Anda.", ms: "Anda hanya nampak agensi di negara anda sendiri." },
          { en: "Agents of an AG Hero partner agency (IQI Indonesia, IQI Malaysia) see “My AG Hero account” at the bottom of the profile and can link their Hero account to receive the launch benefits.", id: "Agen dari agensi mitra AG Hero (IQI Indonesia, IQI Malaysia) melihat “Akun AG Hero saya” di bagian bawah profil dan dapat menautkan akun Hero untuk mendapatkan manfaat peluncuran.", ms: "Ejen daripada agensi rakan AG Hero (IQI Indonesia, IQI Malaysia) nampak “Akaun AG Hero saya” di bahagian bawah profil dan boleh memautkan akaun Hero mereka untuk menerima manfaat pelancaran." },
        ],
      },
    ],
  },
  {
    slug: "badges",
    audience: "agent",
    updated: "2026-11-21",
    title: { en: "Verified Agent and Certified badges", id: "Lencana Agen Terverifikasi dan Bersertifikat", ms: "Lencana Ejen Disahkan dan Bersijil" },
    summary: {
      en: "Two optional badges: Verified (your identity) and Certified (your government certificate).",
      id: "Dua lencana opsional: Terverifikasi (identitas) dan Bersertifikat (sertifikat pemerintah).", ms: "Dua lencana pilihan: Disahkan (identiti anda) dan Bersijil (sijil kerajaan anda).",
    },
    path: "/verification",
    sections: [
      {
        heading: { en: "✓ Verified Agent (personal identification)", id: "✓ Agen Terverifikasi (identitas pribadi)", ms: "✓ Ejen Disahkan (pengenalan diri)" },
        steps: [
          { en: "Press “Get verified” in the side menu, or open the Verification page.", id: "Tekan “Dapatkan verifikasi” di menu samping, atau buka halaman Verifikasi.", ms: "Tekan “Dapatkan pengesahan” pada menu sisi, atau buka halaman Pengesahan.", shot: "g-verification" },
          { en: "Fill in your legal name, agency, licence type and number (your country decides the licence types), state and city.", id: "Isi nama sesuai identitas, agensi, jenis dan nomor lisensi (jenis lisensi mengikuti negara Anda), provinsi dan kota.", ms: "Isi nama sah anda, agensi, jenis dan nombor lesen (negara anda menentukan jenis lesen), negeri dan bandar.", shot: "g-verification" },
          { en: "Upload your licence and your identity document, then press Apply for the badge.", id: "Unggah lisensi dan dokumen identitas, lalu tekan Ajukan lencana.", ms: "Muat naik lesen dan dokumen pengenalan anda, kemudian tekan Mohon lencana.", shot: "g-verification" },
          { en: "An admin reviews it. Once approved, the ✓ Verified Agent badge shows on your listings, card and profile.", id: "Admin akan meninjaunya. Setelah disetujui, lencana ✓ Agen Terverifikasi tampil di listing, kartu, dan profil Anda.", ms: "Admin menyemaknya. Setelah diluluskan, lencana ✓ Ejen Disahkan dipaparkan pada penyenaraian, kad dan profil anda." },
        ],
        notes: [
          { en: "The badge is optional. You can use the whole platform while you wait.", id: "Lencana ini opsional. Anda tetap dapat menggunakan seluruh platform selama menunggu.", ms: "Lencana ini pilihan. Anda boleh menggunakan seluruh platform sementara menunggu." },
        ],
      },
      {
        heading: { en: "✓ Certified (government certificate)", id: "✓ Bersertifikat (sertifikat pemerintah)", ms: "✓ Bersijil (sijil kerajaan)" },
        steps: [
          { en: "In My profile, find Certificate (optional). It appears where your country requires a certificate (Indonesia today).", id: "Di Profil saya, cari Sertifikat (opsional). Bagian ini muncul jika negara Anda mewajibkan sertifikat (saat ini Indonesia).", ms: "Dalam Profil saya, cari Sijil (pilihan). Ia muncul jika negara anda memerlukan sijil (Indonesia pada masa ini).", shot: "g-profile-certificate" },
          { en: "Enter the certificate number and its valid-until date, and attach a photo or PDF of the certificate (up to 5 MB). The proof is required and only admins can see it.", id: "Isi nomor sertifikat dan tanggal berlakunya, lalu lampirkan foto atau PDF sertifikat (maksimal 5 MB). Bukti wajib dilampirkan dan hanya admin yang dapat melihatnya.", ms: "Masukkan nombor sijil dan tarikh sah sehingga, dan lampirkan foto atau PDF sijil itu (sehingga 5 MB). Bukti ini wajib dan hanya admin boleh melihatnya.", shot: "g-profile-certificate" },
          { en: "Press Submit for review. The status shows Awaiting review, ✓ Certified, Rejected (with the reason) or Expired.", id: "Tekan Kirim untuk ditinjau. Statusnya: Menunggu peninjauan, ✓ Bersertifikat, Ditolak (dengan alasan), atau Kedaluwarsa.", ms: "Tekan Hantar untuk semakan. Statusnya memaparkan Menunggu semakan, ✓ Bersijil, Ditolak (bersama sebabnya) atau Tamat tempoh.", shot: "g-profile-certificate" },
        ],
        notes: [
          { en: "When approved, your public profile shows “✓ Certified · number”. It disappears automatically when the certificate expires; you get a reminder 30 days before. Renewed it? Submit the new certificate.", id: "Setelah disetujui, profil publik Anda menampilkan “✓ Bersertifikat · nomor”. Akan hilang otomatis saat sertifikat kedaluwarsa; Anda diingatkan 30 hari sebelumnya. Sudah diperpanjang? Kirim sertifikat baru.", ms: "Apabila diluluskan, profil awam anda memaparkan “✓ Bersijil · nombor”. Ia hilang secara automatik apabila sijil tamat tempoh; anda menerima peringatan 30 hari sebelumnya. Sudah memperbaharuinya? Hantar sijil baharu." },
        ],
      },
    ],
  },
  {
    slug: "listings",
    audience: "agent",
    updated: "2026-11-21",
    title: { en: "Listings: create, publish, change, withdraw", id: "Listing: membuat, menerbitkan, mengubah, menarik", ms: "Penyenaraian: cipta, terbit, ubah, tarik balik" },
    summary: {
      en: "Every listing is checked by a moderator before it goes public.",
      id: "Setiap listing diperiksa moderator sebelum tampil publik.", ms: "Setiap penyenaraian disemak oleh moderator sebelum disiarkan kepada umum.",
    },
    path: "/listings",
    sections: [
      {
        heading: { en: "Create a listing", id: "Membuat listing", ms: "Cipta penyenaraian" },
        steps: [
          { en: "Open Listings and press + New listing.", id: "Buka Listing dan tekan + Listing baru.", ms: "Buka Penyenaraian dan tekan + Penyenaraian baharu.", shot: "g-listings-new" },
          { en: "Go through the steps: Listing type, Location, Unit details, Price, Description, Photos, Review.", id: "Ikuti langkahnya: Jenis listing, Lokasi, Detail unit, Harga, Deskripsi, Foto, Tinjau.", ms: "Lalui langkah-langkahnya: Jenis penyenaraian, Lokasi, Butiran unit, Harga, Penerangan, Foto, Semak.", shot: "g-listings-wizard" },
          { en: "Use your own photos. Photos are cleaned of location data automatically.", id: "Gunakan foto milik Anda sendiri. Data lokasi pada foto dihapus otomatis.", ms: "Guna foto anda sendiri. Data lokasi pada foto dibuang secara automatik.", shot: "g-listings-wizard" },
          { en: "Press Submit for review. The listing waits for a moderator, then goes live on the marketplace.", id: "Tekan Kirim untuk ditinjau. Listing menunggu moderator, lalu tampil di marketplace.", ms: "Tekan Hantar untuk semakan. Penyenaraian menunggu moderator, kemudian disiarkan di pasaran.", shot: "g-listings-wizard" },
        ],
      },
      {
        heading: { en: "Drafts, rejections and withdrawing", id: "Draf, penolakan, dan penarikan", ms: "Draf, penolakan dan penarikan balik" },
        steps: [
          { en: "A draft (for example an imported listing) shows Submit for review. Press it when the listing is ready.", id: "Draf (misalnya listing hasil impor) menampilkan tombol Kirim untuk ditinjau. Tekan saat listing sudah siap.", ms: "Draf (contohnya penyenaraian yang diimport) memaparkan Hantar untuk semakan. Tekan apabila penyenaraian itu sudah sedia.", shot: "g-listings-actions" },
          { en: "Rejected? Read the reason under the listing, press Edit, fix it, and submit again.", id: "Ditolak? Baca alasannya di bawah listing, tekan Ubah, perbaiki, lalu kirim lagi.", ms: "Ditolak? Baca sebabnya di bawah penyenaraian, tekan Sunting, betulkan, dan hantar semula.", shot: "g-listings-actions" },
          { en: "To take a listing off the market, press Withdraw. You can submit it again later.", id: "Untuk menurunkan listing dari pasar, tekan Tarik kembali. Anda dapat mengirimnya lagi nanti.", ms: "Untuk mengeluarkan penyenaraian daripada pasaran, tekan Tarik balik. Anda boleh menghantarnya semula kemudian.", shot: "g-listings-actions" },
          { en: "Editing a live listing sends it back for a quick review before the change shows.", id: "Mengubah listing yang sedang tayang akan mengirimnya kembali untuk ditinjau singkat sebelum perubahan tampil.", ms: "Menyunting penyenaraian yang sedang disiarkan menghantarnya semula untuk semakan ringkas sebelum perubahan itu dipaparkan.", shot: "g-listings-actions" },
        ],
        notes: [
          { en: "A moderator may ask a question about a listing; it shows as a badge on the listing. Open it, answer, and save.", id: "Moderator dapat mengajukan pertanyaan tentang listing; tampil sebagai lencana pada listing. Buka, jawab, lalu simpan.", ms: "Moderator mungkin bertanya soalan tentang sesuatu penyenaraian; ia dipaparkan sebagai lencana pada penyenaraian itu. Buka, jawab, dan simpan." },
        ],
      },
    ],
  },
  {
    slug: "import-listings",
    audience: "agent",
    updated: "2026-11-21",
    title: { en: "Importing listings from other platforms", id: "Mengimpor listing dari platform lain", ms: "Mengimport penyenaraian dari platform lain" },
    summary: {
      en: "Bring your existing listings in from a portal link or a spreadsheet — yourself, or with an admin's help.",
      id: "Pindahkan listing Anda dari tautan portal atau spreadsheet — sendiri, atau dibantu admin.", ms: "Bawa masuk penyenaraian sedia ada anda melalui pautan portal atau hamparan — sendiri, atau dengan bantuan admin.",
    },
    path: "/listings/import",
    sections: [
      {
        heading: { en: "Import yourself", id: "Impor sendiri", ms: "Import sendiri" },
        steps: [
          { en: "Open Import listings.", id: "Buka Impor listing.", ms: "Buka Import penyenaraian.", shot: "g-nav-import" },
          { en: "Paste the link to your listing or profile on the other portal, or upload a spreadsheet.", id: "Tempel tautan listing atau profil Anda di portal lain, atau unggah spreadsheet.", ms: "Tampal pautan penyenaraian atau profil anda di portal lain, atau muat naik hamparan.", shot: "g-import-portal" },
          { en: "Review each item: correct the title, price, type and location. Skip anything you do not want.", id: "Periksa setiap item: perbaiki judul, harga, jenis, dan lokasi. Lewati yang tidak diinginkan.", ms: "Semak setiap item: betulkan tajuk, harga, jenis dan lokasi. Langkau apa-apa yang anda tidak mahu." },
          { en: "Accept the declaration that these are your listings and you may publish them, and import. They arrive as drafts in Listings.", id: "Setujui pernyataan bahwa listing ini milik Anda dan Anda berhak menerbitkannya, lalu impor. Listing masuk sebagai draf di Listing.", ms: "Terima perakuan bahawa ini penyenaraian anda dan anda berhak menerbitkannya, kemudian import. Ia tiba sebagai draf dalam Penyenaraian." },
          { en: "Add your own photos to each listing and press Submit for review.", id: "Tambahkan foto milik Anda pada setiap listing lalu tekan Kirim untuk ditinjau.", ms: "Tambah foto anda sendiri pada setiap penyenaraian dan tekan Hantar untuk semakan.", shot: "g-listings-actions" },
        ],
        notes: [
          { en: "Photos are not copied from other portals. Upload your original photos — photos with another portal's watermark cannot be used.", id: "Foto tidak disalin dari portal lain. Unggah foto asli Anda — foto dengan watermark portal lain tidak dapat digunakan.", ms: "Foto tidak disalin dari portal lain. Muat naik foto asal anda — foto yang mempunyai tera air portal lain tidak boleh digunakan." },
        ],
      },
      {
        heading: { en: "When an admin prepared it for you", id: "Jika admin sudah menyiapkannya", ms: "Apabila admin menyediakannya untuk anda" },
        steps: [
          { en: "You get a notification that listings were prepared. Open it to review them and import, as above.", id: "Anda menerima notifikasi bahwa listing sudah disiapkan. Buka untuk meninjau dan mengimpornya, seperti di atas.", ms: "Anda menerima notifikasi bahawa penyenaraian telah disediakan. Buka untuk menyemak dan mengimportnya, seperti di atas.", shot: "g-nav-notifications" },
          { en: "If you agreed by phone that the team may publish for you, the admin publishes them and you get a notification. They appear in Listings; you can still edit or withdraw any of them.", id: "Jika Anda sudah setuju lewat telepon bahwa tim boleh menerbitkan atas nama Anda, admin akan menerbitkannya dan Anda menerima notifikasi. Listing tampil di Listing; Anda tetap dapat mengubah atau menarik listing mana pun.", ms: "Jika anda bersetuju melalui telefon bahawa pasukan boleh menerbitkan bagi pihak anda, admin menerbitkannya dan anda menerima notifikasi. Ia muncul dalam Penyenaraian; anda masih boleh menyunting atau menarik balik mana-mana daripadanya.", shot: "g-nav-notifications" },
        ],
      },
    ],
  },
  {
    slug: "matchhub",
    audience: "agent",
    updated: "2026-11-21",
    title: { en: "MatchHub and co-marketing", id: "MatchHub dan pemasaran bersama", ms: "MatchHub dan pemasaran bersama" },
    summary: {
      en: "Find properties for your clients through other agents, and share listings under agreed commission terms.",
      id: "Cari properti untuk klien melalui agen lain, dan bagikan listing dengan komisi yang disepakati.", ms: "Cari hartanah untuk pelanggan anda melalui ejen lain, dan kongsi penyenaraian di bawah terma komisen yang dipersetujui.",
    },
    path: "/requests",
    sections: [
      {
        heading: { en: "Client requirements (buyer side)", id: "Kebutuhan klien (sisi pembeli)", ms: "Keperluan pelanggan (pihak pembeli)" },
        steps: [
          { en: "Open Client requirements and press New requirement.", id: "Buka Kebutuhan klien dan tekan Kebutuhan baru.", ms: "Buka Keperluan pelanggan dan tekan Keperluan baharu.", shot: "g-requests-new" },
          { en: "Describe what your client needs: type, area, budget and must-haves. Save. An admin approves it.", id: "Jelaskan kebutuhan klien: jenis, area, anggaran, dan syarat wajib. Simpan. Admin akan menyetujuinya.", ms: "Terangkan apa yang pelanggan anda perlukan: jenis, kawasan, bajet dan perkara yang mesti ada. Simpan. Admin meluluskannya.", shot: "g-requests-new" },
          { en: "Other agents submit matching properties. Shortlist the good ones; only approved properties reach your client, without the other agent's identity.", id: "Agen lain mengajukan properti yang cocok. Pilih yang sesuai; hanya properti yang disetujui yang sampai ke klien, tanpa identitas agen lain.", ms: "Ejen lain menghantar hartanah yang sepadan. Senarai pendekkan yang bagus; hanya hartanah yang diluluskan sampai kepada pelanggan anda, tanpa identiti ejen lain itu.", shot: "g-requests-list" },
        ],
      },
      {
        heading: { en: "Submitting and co-marketing (supply side)", id: "Mengajukan dan pemasaran bersama (sisi penjual)", ms: "Menghantar dan pemasaran bersama (pihak pembekal)" },
        steps: [
          { en: "Wanted board and My submissions: answer other agents' requirements with your properties.", id: "Papan Dicari dan Pengajuan saya: jawab kebutuhan agen lain dengan properti Anda.", ms: "Papan Dicari dan Serahan saya: jawab keperluan ejen lain dengan hartanah anda.", shot: "g-nav-wanted" },
          { en: "Co-marketing: pick up a listing another agent opened to the pool. Its commission terms are recorded when you accept them and cannot be changed.", id: "Pemasaran bersama: ambil listing yang dibuka agen lain ke pool. Ketentuan komisi tercatat saat Anda menerimanya dan tidak dapat diubah.", ms: "Pemasaran bersama: ambil penyenaraian yang dibuka oleh ejen lain kepada kolam. Terma komisennya direkodkan apabila anda menerimanya dan tidak boleh diubah.", shot: "g-nav-pool" },
        ],
        notes: [
          { en: "Clients never see another agent's name, commission or minimum price.", id: "Klien tidak pernah melihat nama agen lain, komisi, atau harga minimum.", ms: "Pelanggan tidak pernah nampak nama, komisen atau harga minimum ejen lain." },
        ],
      },
    ],
  },
  {
    slug: "daily-work",
    audience: "agent",
    updated: "2026-11-21",
    title: { en: "Leads, tasks, card and notifications", id: "Prospek, tugas, kartu, dan notifikasi", ms: "Prospek, tugas, kad dan notifikasi" },
    summary: {
      en: "Answer buyers quickly, keep track of viewings, and share your digital name card.",
      id: "Tanggapi pembeli dengan cepat, catat jadwal survei, dan bagikan kartu nama digital.", ms: "Jawab pembeli dengan pantas, jejaki sesi melihat hartanah, dan kongsi kad nama digital anda.",
    },
    path: "/leads",
    sections: [
      {
        heading: { en: "Every day", id: "Setiap hari", ms: "Setiap hari" },
        steps: [
          { en: "Leads: new buyer enquiries from the marketplace. Reply quickly; the response time is measured.", id: "Prospek: pertanyaan baru dari pembeli di marketplace. Balas cepat; waktu respons diukur.", ms: "Prospek: pertanyaan baharu pembeli dari pasaran. Balas dengan pantas; masa respons diukur.", shot: "g-leads" },
          { en: "Tasks: follow-ups and viewings, with reminders.", id: "Tugas: tindak lanjut dan jadwal survei, dengan pengingat.", ms: "Tugas: susulan dan sesi melihat hartanah, dengan peringatan.", shot: "g-nav-tasks" },
          { en: "Notifications (bell): approvals, questions from moderators, certificate decisions and reminders.", id: "Notifikasi (ikon lonceng): persetujuan, pertanyaan moderator, keputusan sertifikat, dan pengingat.", ms: "Notifikasi (loceng): kelulusan, soalan daripada moderator, keputusan sijil dan peringatan.", shot: "g-nav-notifications" },
          { en: "My name card: your public digital card with your listings and badges. Share its link on WhatsApp.", id: "Kartu nama saya: kartu digital publik berisi listing dan lencana Anda. Bagikan tautannya lewat WhatsApp.", ms: "Kad nama saya: kad digital awam anda bersama penyenaraian dan lencana anda. Kongsi pautannya melalui WhatsApp.", shot: "g-nav-card" },
        ],
        notes: [
          { en: "The menu on the left: press a group title to fold it, and use the button at the top to shrink the menu to icons. On a phone, the bar at the bottom has your daily pages and Menu (top left) has everything else. The moon or sun button at the top (inside Menu on a phone) switches between light and dark.", id: "Menu di sebelah kiri: tekan judul grup untuk melipatnya, dan gunakan tombol di atas untuk mengecilkan menu menjadi ikon. Di ponsel, bilah di bawah berisi halaman harian Anda dan Menu (kiri atas) berisi semua halaman lainnya. Tombol bulan atau matahari di atas (di dalam Menu pada ponsel) mengganti tampilan terang dan gelap.", ms: "Menu di sebelah kiri: tekan tajuk kumpulan untuk melipatnya, dan guna butang di atas untuk mengecilkan menu menjadi ikon. Di telefon, bar di bawah mengandungi halaman harian anda dan Menu (kiri atas) mengandungi semua yang lain. Butang bulan atau matahari di atas (di dalam Menu pada telefon) menukar paparan terang dan gelap." },
        ],
      },
    ],
  },
  {
    slug: "international-listings",
    audience: "agent",
    updated: "2026-11-21",
    title: { en: "Find an international listing and send it to a buyer", id: "Mencari listing internasional dan mengirimkannya ke pembeli" },
    summary: {
      en: "Browse overseas projects by country, read the price correctly, ask the person in charge, and share the public link.",
      id: "Telusuri proyek luar negeri per negara, baca harganya dengan benar, tanyakan ke penanggung jawab, dan bagikan tautan publiknya.",
    },
    path: "/international",
    sections: [
      {
        heading: { en: "Find a listing", id: "Mencari listing" },
        steps: [
          { en: "Open International in the menu. It opens on Indonesia.", id: "Buka Internasional di menu. Halaman terbuka di Indonesia." },
          { en: "Press another country, or All countries, to change what is shown. The number beside each country is how many listings it has.", id: "Tekan negara lain, atau Semua negara, untuk mengganti tampilan. Angka di samping tiap negara menunjukkan jumlah listingnya." },
          { en: "To look for something specific, type a project name or a city and press Search.", id: "Untuk mencari yang spesifik, ketik nama proyek atau kota lalu tekan Cari." },
          { en: "Press a card to open the listing: photos, key facts, description, highlights and price.", id: "Tekan kartu untuk membuka listing: foto, info utama, deskripsi, keunggulan, dan harga." },
        ],
        notes: [
          { en: "Reading the price: the first figure is in rupiah, then the listed price in the project's own currency, then US dollars. Figures marked Estimate are converted at the exchange rate of the date shown. The listed price is the one that applies, so quote that one to your buyer.", id: "Membaca harga: angka pertama dalam rupiah, lalu harga resmi dalam mata uang proyek itu sendiri, lalu dolar AS. Angka bertanda Perkiraan dikonversi dengan kurs pada tanggal yang tertera. Yang berlaku adalah harga resmi, jadi sampaikan harga itu kepada pembeli." },
        ],
      },
      {
        heading: { en: "Ask the person in charge", id: "Bertanya ke penanggung jawab" },
        steps: [
          { en: "On the listing, find the Person in charge card. It shows who answers for that country.", id: "Di halaman listing, cari kartu Penanggung jawab (PIC). Di situ tertera siapa yang menjawab untuk negara tersebut." },
          { en: "Press the green WhatsApp button. WhatsApp opens with a message that already names the listing; add your question and send.", id: "Tekan tombol WhatsApp berwarna hijau. WhatsApp terbuka dengan pesan yang sudah menyebut nama listing; tambahkan pertanyaan Anda lalu kirim." },
        ],
        notes: [
          { en: "Check availability and the latest price list with the person in charge before you promise anything to a buyer.", id: "Pastikan ketersediaan unit dan daftar harga terbaru ke penanggung jawab sebelum menjanjikan apa pun kepada pembeli." },
        ],
      },
      {
        heading: { en: "Send it to your buyer", id: "Mengirim ke pembeli" },
        steps: [
          { en: "In “Send to a buyer”, press Copy public link and paste it into your chat, or press Send on WhatsApp to open WhatsApp with the link in a ready message.", id: "Di “Kirim ke pembeli”, tekan Salin tautan publik lalu tempel di chat Anda, atau tekan Kirim lewat WhatsApp untuk membuka WhatsApp dengan tautan di dalam pesan siap kirim." },
          { en: "Your buyer opens the public page without an account and can send an enquiry from there. It goes to the person in charge for that country.", id: "Pembeli membuka halaman publik tanpa akun dan bisa mengirim pertanyaan dari sana. Pertanyaan itu sampai ke penanggung jawab negara tersebut." },
        ],
      },
    ],
  },
];
