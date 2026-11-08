/**
 * Coach — the deterministic floor for the Objection Coach and the practice
 * scenarios for the Team Coach.
 *
 * The eight objections below are the ones every agent in both markets hears
 * weekly. Each has a plain reading of what the client probably means, three
 * respectful ways to answer and a sample reply, in the three languages the
 * app ships. When the model is available it tailors these to the actual
 * words and the actual property; when it is not, the library still answers.
 *
 * Pure: no imports, unit-tested.
 */

export type Lang = "en" | "id" | "ms";
type Tri = Record<Lang, string>;

export type ObjectionEntry = {
  key: string;
  patterns: RegExp[];
  meaning: Tri;
  approaches: Record<Lang, { name: string; how: string }[]>;
  sample: Tri;
  followUp: Tri;
};

export const OBJECTIONS: ObjectionEntry[] = [
  {
    key: "price_high",
    patterns: [/\b(too expensive|overpriced|price is high|mahal|kemahalan|terlalu tinggi|harga tinggi|over budget|lebih dari budget)\b/i],
    meaning: {
      en: "The client sees the price but not yet the value, or is anchoring on another unit. It is rarely a final no.",
      id: "Klien melihat harganya tapi belum melihat nilainya, atau sedang membandingkan dengan unit lain. Ini jarang berarti tidak.",
      ms: "Klien nampak harganya tetapi belum nampak nilainya, atau sedang membandingkan dengan unit lain. Ini jarang bermaksud tidak.",
    },
    approaches: {
      en: [
        { name: "Compare, don't defend", how: "Put the asking price next to two or three similar listings nearby and let the numbers speak. If it is higher, say what the difference buys." },
        { name: "Find the real number", how: "Ask what range feels right to them. The gap tells you whether to negotiate, to show another unit, or to wait." },
        { name: "Separate price from terms", how: "Owners sometimes move on timing, furnishing or fees before they move on price. Ask what else would make it work." },
      ],
      id: [
        { name: "Bandingkan, jangan membela", how: "Sandingkan harga dengan dua–tiga listing serupa di sekitar dan biarkan angkanya bicara. Jika lebih tinggi, jelaskan apa yang didapat dari selisihnya." },
        { name: "Cari angka sebenarnya", how: "Tanyakan kisaran yang terasa pas bagi klien. Selisihnya menentukan apakah Anda negosiasi, tunjukkan unit lain, atau menunggu." },
        { name: "Pisahkan harga dari syarat", how: "Pemilik kadang lebih fleksibel soal waktu, perabot atau biaya sebelum soal harga. Tanyakan hal lain yang bisa membuatnya cocok." },
      ],
      ms: [
        { name: "Banding, bukan bela", how: "Letakkan harga tawaran di sebelah dua atau tiga penyenaraian serupa berhampiran dan biar angka bercakap. Jika lebih tinggi, nyatakan apa yang dibeli dengan bezanya." },
        { name: "Cari angka sebenar", how: "Tanya julat yang dirasakan sesuai oleh klien. Jurangnya menentukan sama ada anda merunding, menunjukkan unit lain, atau menunggu." },
        { name: "Asingkan harga daripada terma", how: "Pemilik kadangkala lebih mudah beralah tentang masa, perabot atau yuran sebelum harga. Tanya apa lagi yang boleh menjadikannya sesuai." },
      ],
    },
    sample: {
      en: "I understand. Can I show you how this one sits against the other units in the area so you can judge it with real numbers? And if it helps, tell me the range you had in mind and I will see what the owner can do.",
      id: "Saya paham. Boleh saya tunjukkan posisi unit ini dibanding unit lain di area yang sama supaya Bapak/Ibu bisa menilai dengan angka nyata? Kalau berkenan, sebutkan kisaran yang diinginkan, nanti saya cek apa yang bisa dilakukan pemilik.",
      ms: "Saya faham. Boleh saya tunjukkan kedudukan unit ini berbanding unit lain di kawasan yang sama supaya tuan/puan boleh menilai dengan angka sebenar? Jika membantu, beritahu saya julat yang tuan/puan fikirkan dan saya akan lihat apa yang pemilik boleh buat.",
    },
    followUp: {
      en: "What range would feel right to you for this one?",
      id: "Kisaran berapa yang terasa pas untuk unit ini menurut Bapak/Ibu?",
      ms: "Julat berapa yang dirasakan sesuai untuk unit ini bagi tuan/puan?",
    },
  },
  {
    key: "think_about_it",
    patterns: [/\b(think about it|let me think|not sure yet|pikir(-pikir)? dulu|saya pertimbangkan|nanti saya kabari|fikir dulu|bincang dulu|discuss with (my )?(wife|husband|family))\b/i],
    meaning: {
      en: "Something is unresolved — a doubt they have not voiced, or a person who was not there. Your job is to find which, not to push.",
      id: "Ada yang belum selesai — keraguan yang belum diucapkan, atau orang yang belum ikut melihat. Tugas Anda menemukannya, bukan mendesak.",
      ms: "Ada yang belum selesai — keraguan yang belum disuarakan, atau orang yang tidak hadir. Tugas anda mencarinya, bukan mendesak.",
    },
    approaches: {
      en: [
        { name: "Name the gap", how: "Ask what they would want to know before deciding. Most people answer honestly when asked plainly." },
        { name: "Make the next step small", how: "Offer to send the floor plan, the fees or a second viewing time — something easy to say yes to." },
        { name: "Agree a time, not a decision", how: "Ask when it suits them to talk again and put it in your tasks. Silence is what loses deals, not time." },
      ],
      id: [
        { name: "Sebut yang mengganjal", how: "Tanyakan apa yang ingin diketahui sebelum memutuskan. Kebanyakan orang menjawab jujur bila ditanya langsung." },
        { name: "Perkecil langkah berikutnya", how: "Tawarkan denah, rincian biaya, atau jadwal lihat kedua — sesuatu yang mudah disetujui." },
        { name: "Sepakati waktu, bukan keputusan", how: "Tanyakan kapan enak untuk bicara lagi dan catat di tugas Anda. Yang menggagalkan transaksi adalah senyap, bukan waktu." },
      ],
      ms: [
        { name: "Namakan jurangnya", how: "Tanya apa yang mereka mahu tahu sebelum membuat keputusan. Kebanyakan orang menjawab jujur apabila ditanya terus-terang." },
        { name: "Kecilkan langkah seterusnya", how: "Tawarkan pelan lantai, butiran yuran atau masa lawatan kedua — sesuatu yang mudah dipersetujui." },
        { name: "Setuju masa, bukan keputusan", how: "Tanya bila sesuai untuk berbual semula dan catat dalam tugasan anda. Senyap yang merugikan urus niaga, bukan masa." },
      ],
    },
    sample: {
      en: "Of course, take your time. So I can be useful while you think — is there anything you would want to know first, about the unit or the costs? I can send the details tonight, and check back with you on Thursday if that suits.",
      id: "Tentu, silakan dipertimbangkan. Supaya saya bisa membantu sementara Bapak/Ibu berpikir — adakah hal yang ingin diketahui dulu, soal unit atau biayanya? Saya bisa kirim rinciannya malam ini dan menghubungi lagi hari Kamis kalau berkenan.",
      ms: "Sudah tentu, ambil masa tuan/puan. Supaya saya boleh membantu sementara tuan/puan berfikir — ada apa-apa yang ingin diketahui dahulu, tentang unit atau kosnya? Saya boleh hantar butirannya malam ini dan hubungi semula hari Khamis jika sesuai.",
    },
    followUp: {
      en: "What would you want to know before you could decide?",
      id: "Apa yang ingin Bapak/Ibu ketahui sebelum bisa memutuskan?",
      ms: "Apa yang tuan/puan mahu tahu sebelum boleh membuat keputusan?",
    },
  },
  {
    key: "other_agent",
    patterns: [/\b(another agent|other agent|my agent|already have an agent|agen lain|sudah ada agen|ejen lain|dah ada ejen|direct (with|from) (the )?owner|langsung ke pemilik)\b/i],
    meaning: {
      en: "They are testing whether you add anything. Compete on service and specifics, never by criticising the other agent.",
      id: "Mereka menguji apakah Anda memberi nilai tambah. Bersainglah lewat layanan dan hal spesifik, jangan pernah dengan menjelekkan agen lain.",
      ms: "Mereka menguji sama ada anda menambah nilai. Bersaing melalui perkhidmatan dan perincian, jangan sekali-kali dengan mengkritik ejen lain.",
    },
    approaches: {
      en: [
        { name: "Respect it", how: "Acknowledge the relationship. Offer to be a second pair of eyes on this specific unit, no commitment." },
        { name: "Bring something they lack", how: "A comparable, a viewing slot this week, a fact about the building — one concrete thing the other agent has not given them." },
        { name: "Leave the door open", how: "Share your card and say when you will have new stock in their area. Many clients come back when the first agent goes quiet." },
      ],
      id: [
        { name: "Hormati", how: "Akui hubungan itu. Tawarkan diri sebagai pandangan kedua untuk unit ini saja, tanpa ikatan." },
        { name: "Bawa yang belum mereka punya", how: "Pembanding, jadwal lihat minggu ini, fakta tentang gedungnya — satu hal konkret yang belum diberikan agen lain." },
        { name: "Biarkan pintu terbuka", how: "Bagikan kartu nama dan sampaikan kapan Anda punya stok baru di area mereka. Banyak klien kembali saat agen pertama menghilang." },
      ],
      ms: [
        { name: "Hormatinya", how: "Akui hubungan itu. Tawarkan diri sebagai pandangan kedua untuk unit ini sahaja, tanpa komitmen." },
        { name: "Bawa sesuatu yang mereka tiada", how: "Perbandingan, slot lawatan minggu ini, fakta tentang bangunan — satu perkara konkrit yang belum diberikan ejen lain." },
        { name: "Biarkan pintu terbuka", how: "Kongsi kad anda dan beritahu bila anda ada stok baharu di kawasan mereka. Ramai klien kembali apabila ejen pertama senyap." },
      ],
    },
    sample: {
      en: "That's completely fine — I'm glad you have someone helping. If it's useful, I can send you how this unit compares with two others in the same block, so you have the full picture whoever you proceed with.",
      id: "Tidak masalah sama sekali — senang Bapak/Ibu sudah ada yang membantu. Kalau berguna, saya bisa kirim perbandingan unit ini dengan dua unit lain di blok yang sama, supaya gambarannya lengkap siapa pun yang nanti membantu.",
      ms: "Tiada masalah — saya gembira tuan/puan sudah ada yang membantu. Jika berguna, saya boleh hantar perbandingan unit ini dengan dua unit lain di blok yang sama, supaya gambarannya lengkap dengan sesiapa pun tuan/puan teruskan.",
    },
    followUp: {
      en: "Is there anything about this unit your agent has not been able to find out for you?",
      id: "Adakah hal tentang unit ini yang belum bisa diperoleh dari agen Bapak/Ibu?",
      ms: "Ada apa-apa tentang unit ini yang ejen tuan/puan belum dapat ketahui?",
    },
  },
  {
    key: "location",
    patterns: [/\b(too far|location|far from|jauh|lokasinya|macet|jammed|traffic|kawasan|tempat kerja|commute)\b/i],
    meaning: {
      en: "Distance is measured against a routine — work, school, family. Find the routine before you argue the distance.",
      id: "Jarak diukur dari rutinitas — kantor, sekolah, keluarga. Pahami rutinitasnya sebelum membahas jaraknya.",
      ms: "Jarak diukur berdasarkan rutin — kerja, sekolah, keluarga. Fahami rutinnya sebelum berhujah tentang jarak.",
    },
    approaches: {
      en: [
        { name: "Map the real trip", how: "Ask where they go most mornings and check the actual door-to-door time at that hour. Guesses are usually worse than reality." },
        { name: "Trade distance for something", how: "If this location gives more space or a lower price, say that plainly and let them weigh it." },
        { name: "Offer the alternative", how: "If the area is wrong, say so and propose two listings closer to their routine. Honesty here wins the next deal." },
      ],
      id: [
        { name: "Petakan perjalanan nyata", how: "Tanyakan ke mana mereka pergi hampir setiap pagi dan cek waktu tempuh sebenarnya di jam itu. Perkiraan biasanya lebih buruk dari kenyataan." },
        { name: "Tukar jarak dengan sesuatu", how: "Jika lokasi ini memberi ruang lebih luas atau harga lebih rendah, sampaikan apa adanya dan biarkan mereka menimbang." },
        { name: "Tawarkan alternatif", how: "Jika areanya memang tidak cocok, katakan dan usulkan dua listing yang lebih dekat dengan rutinitas mereka. Kejujuran di sini memenangkan transaksi berikutnya." },
      ],
      ms: [
        { name: "Petakan perjalanan sebenar", how: "Tanya ke mana mereka pergi hampir setiap pagi dan semak masa pintu-ke-pintu sebenar pada waktu itu. Tekaan biasanya lebih teruk daripada realiti." },
        { name: "Tukar jarak dengan sesuatu", how: "Jika lokasi ini memberi lebih ruang atau harga lebih rendah, nyatakan dengan jelas dan biar mereka menimbang." },
        { name: "Tawarkan alternatif", how: "Jika kawasannya memang tidak sesuai, katakan dan cadangkan dua penyenaraian yang lebih dekat dengan rutin mereka. Kejujuran di sini memenangi urus niaga seterusnya." },
      ],
    },
    sample: {
      en: "Fair point. Where would you be travelling to most days? Let me check the real travel time at that hour — and if it doesn't work, I'd rather show you two places that do than talk you into this one.",
      id: "Masuk akal. Ke mana Bapak/Ibu paling sering bepergian setiap hari? Saya cek waktu tempuh sebenarnya di jam itu — kalau tidak cocok, saya lebih suka menunjukkan dua tempat yang cocok daripada memaksakan yang ini.",
      ms: "Betul juga. Ke mana tuan/puan paling kerap pergi setiap hari? Biar saya semak masa perjalanan sebenar pada waktu itu — jika tidak sesuai, saya lebih rela tunjukkan dua tempat yang sesuai daripada memujuk tuan/puan dengan yang ini.",
    },
    followUp: {
      en: "Where do you travel to most mornings?",
      id: "Ke mana Bapak/Ibu pergi hampir setiap pagi?",
      ms: "Ke mana tuan/puan pergi hampir setiap pagi?",
    },
  },
  {
    key: "wait_market",
    patterns: [/\b(wait for (the )?(market|prices?)|prices? (to|will|might) (drop|fall|come down)|tunggu harga|harga (akan )?turun|wait (and see|a bit)|tunggu dulu|tengok dulu|market (is )?(slow|bad|uncertain)|ekonomi)\b/i],
    meaning: {
      en: "They want certainty nobody can give. Do not predict prices; give them facts about this unit and the cost of waiting for their own situation.",
      id: "Mereka ingin kepastian yang tak bisa diberikan siapa pun. Jangan meramal harga; berikan fakta unit ini dan biaya menunggu bagi situasi mereka sendiri.",
      ms: "Mereka mahukan kepastian yang tiada siapa boleh beri. Jangan ramal harga; beri fakta tentang unit ini dan kos menunggu bagi situasi mereka sendiri.",
    },
    approaches: {
      en: [
        { name: "Refuse to forecast", how: "Say honestly that you do not predict the market. It earns trust and ends the debate." },
        { name: "Price their own waiting", how: "If they rent now, what does a year of waiting cost them? If financing, what does the current rate lock in? Numbers from their life, not the market." },
        { name: "Anchor on the unit", how: "This exact unit exists once. Ask whether it is the right home for them; the market question is separate." },
      ],
      id: [
        { name: "Tolak meramal", how: "Katakan jujur bahwa Anda tidak meramal pasar. Itu menumbuhkan kepercayaan dan mengakhiri perdebatan." },
        { name: "Hitung biaya menunggu mereka sendiri", how: "Kalau sekarang mengontrak, berapa biaya menunggu setahun? Kalau KPR, suku bunga mana yang terkunci sekarang? Angkanya dari hidup mereka, bukan dari pasar." },
        { name: "Berpijak pada unitnya", how: "Unit persis ini hanya ada satu. Tanyakan apakah ini rumah yang tepat bagi mereka; soal pasar adalah hal terpisah." },
      ],
      ms: [
        { name: "Enggan meramal", how: "Katakan dengan jujur bahawa anda tidak meramal pasaran. Ia membina kepercayaan dan menamatkan perdebatan." },
        { name: "Nilaikan penantian mereka sendiri", how: "Jika mereka menyewa sekarang, berapa kos menunggu setahun? Jika berpinjaman, kadar mana yang dikunci sekarang? Angka daripada hidup mereka, bukan pasaran." },
        { name: "Berpaksi pada unit", how: "Unit yang tepat ini wujud sekali sahaja. Tanya sama ada ia rumah yang betul untuk mereka; soal pasaran adalah berasingan." },
      ],
    },
    sample: {
      en: "Honestly, I don't predict prices — nobody can. What I can do is work out what waiting costs you specifically, with your current rent and the loan rate you'd get today, so you decide with your own numbers rather than the headlines.",
      id: "Jujur, saya tidak meramal harga — tidak ada yang bisa. Yang bisa saya lakukan adalah menghitung berapa biaya menunggu bagi Bapak/Ibu secara spesifik, dengan sewa saat ini dan bunga KPR yang didapat hari ini, supaya keputusannya berdasarkan angka sendiri, bukan berita.",
      ms: "Jujurnya, saya tidak meramal harga — tiada siapa boleh. Apa yang boleh saya buat ialah mengira kos menunggu untuk tuan/puan secara khusus, dengan sewa semasa dan kadar pinjaman yang tuan/puan dapat hari ini, supaya keputusan dibuat dengan angka sendiri, bukan tajuk berita.",
    },
    followUp: {
      en: "Are you renting at the moment, and roughly what does that cost per month?",
      id: "Saat ini Bapak/Ibu mengontrak? Kira-kira berapa per bulan?",
      ms: "Tuan/puan menyewa sekarang? Lebih kurang berapa sebulan?",
    },
  },
  {
    key: "too_small",
    patterns: [/\b(too small|kecil|sempit|not enough (space|room)|cramped|kurang luas|lebih besar|bigger)\b/i],
    meaning: {
      en: "Space is about use: storage, a desk, a second child. Find the missing use before you look for a bigger unit.",
      id: "Luas itu soal kegunaan: penyimpanan, meja kerja, anak kedua. Temukan kegunaan yang kurang sebelum mencari unit lebih besar.",
      ms: "Ruang adalah tentang kegunaan: simpanan, meja kerja, anak kedua. Cari kegunaan yang hilang sebelum mencari unit lebih besar.",
    },
    approaches: {
      en: [
        { name: "Ask what wouldn't fit", how: "Which room or item is the problem? Often a layout change or storage solves it." },
        { name: "Price per square metre", how: "Show what the next size up costs in this area. Sometimes the answer is yes, it is worth it; say so." },
        { name: "Show the bigger one", how: "If you have a larger unit nearby, offer both viewings in one trip." },
      ],
      id: [
        { name: "Tanyakan apa yang tidak muat", how: "Ruangan atau barang mana yang jadi masalah? Sering kali perubahan tata letak atau penyimpanan menyelesaikannya." },
        { name: "Harga per meter persegi", how: "Tunjukkan harga ukuran di atasnya di area ini. Kadang jawabannya ya, layak; katakan saja." },
        { name: "Tunjukkan yang lebih besar", how: "Jika ada unit lebih luas di dekatnya, tawarkan dua kunjungan dalam satu perjalanan." },
      ],
      ms: [
        { name: "Tanya apa yang tidak muat", how: "Bilik atau barang mana yang menjadi masalah? Selalunya perubahan susun atur atau simpanan menyelesaikannya." },
        { name: "Harga sekaki/meter persegi", how: "Tunjukkan kos saiz seterusnya di kawasan ini. Kadangkala jawapannya ya, berbaloi; katakan sahaja." },
        { name: "Tunjukkan yang lebih besar", how: "Jika ada unit lebih besar berhampiran, tawarkan kedua-dua lawatan dalam satu perjalanan." },
      ],
    },
    sample: {
      en: "Understood. What is it that wouldn't fit — is it storage, a workspace, or a bedroom? If it's a bedroom, I have a larger unit two streets away we could see on the same trip.",
      id: "Baik. Apa yang kira-kira tidak muat — penyimpanan, ruang kerja, atau kamar tidur? Kalau kamar tidur, ada unit lebih luas dua jalan dari sini yang bisa kita lihat sekalian.",
      ms: "Baik. Apa yang tidak muat — simpanan, ruang kerja, atau bilik tidur? Jika bilik tidur, saya ada unit lebih besar dua jalan dari sini yang boleh kita lihat dalam perjalanan yang sama.",
    },
    followUp: {
      en: "Which room would need to be bigger?",
      id: "Ruangan mana yang perlu lebih luas?",
      ms: "Bilik mana yang perlu lebih besar?",
    },
  },
  {
    key: "financing",
    patterns: [/\b(loan|mortgage|kpr|pinjaman|bank|dp|down ?payment|uang muka|deposit|cicilan|installment|approved|lulus|cash)\b/i],
    meaning: {
      en: "Money mechanics, not desire. Most financing objections are solved by a banker and a clear list of costs.",
      id: "Ini soal mekanisme uang, bukan keinginan. Kebanyakan keberatan pembiayaan selesai lewat pihak bank dan daftar biaya yang jelas.",
      ms: "Mekanik wang, bukan keinginan. Kebanyakan bantahan pembiayaan selesai dengan pegawai bank dan senarai kos yang jelas.",
    },
    approaches: {
      en: [
        { name: "Get a real pre-check", how: "Offer to connect them with a banker for an eligibility check before they fall for a unit they cannot finance." },
        { name: "List every cost once", how: "Deposit, duties, legal fees, monthly instalment at today's rate — on one page, no surprises." },
        { name: "Ask about timing", how: "A bonus, a sale of another property or a contract renewal often changes what is possible in three months." },
      ],
      id: [
        { name: "Cek kelayakan sungguhan", how: "Tawarkan menghubungkan dengan pihak bank untuk cek kelayakan sebelum mereka jatuh hati pada unit yang tak bisa dibiayai." },
        { name: "Daftar semua biaya sekali", how: "DP, pajak, notaris, cicilan bulanan dengan bunga hari ini — dalam satu halaman, tanpa kejutan." },
        { name: "Tanyakan waktunya", how: "Bonus, penjualan properti lain, atau perpanjangan kontrak kerja sering mengubah apa yang mungkin dalam tiga bulan." },
      ],
      ms: [
        { name: "Dapatkan pra-semakan sebenar", how: "Tawarkan untuk menghubungkan mereka dengan pegawai bank bagi semakan kelayakan sebelum mereka jatuh hati pada unit yang tidak boleh dibiayai." },
        { name: "Senaraikan setiap kos sekali", how: "Deposit, duti, yuran guaman, ansuran bulanan pada kadar hari ini — dalam satu muka surat, tiada kejutan." },
        { name: "Tanya tentang masa", how: "Bonus, jualan hartanah lain atau pembaharuan kontrak sering mengubah apa yang mungkin dalam tiga bulan." },
      ],
    },
    sample: {
      en: "That's the right question to ask first. Would it help if I put every cost on one page — deposit, duties, legal fees and the monthly instalment at today's rate — and connected you with a banker for a quick eligibility check? No obligation either way.",
      id: "Itu pertanyaan yang tepat untuk ditanyakan dulu. Apakah membantu kalau saya rangkum semua biaya dalam satu halaman — DP, pajak, notaris, dan cicilan bulanan dengan bunga hari ini — lalu hubungkan dengan pihak bank untuk cek kelayakan singkat? Tanpa kewajiban apa pun.",
      ms: "Itu soalan yang betul untuk ditanya dahulu. Adakah membantu jika saya letakkan setiap kos dalam satu muka surat — deposit, duti, yuran guaman dan ansuran bulanan pada kadar hari ini — dan hubungkan tuan/puan dengan pegawai bank untuk semakan kelayakan ringkas? Tiada obligasi.",
    },
    followUp: {
      en: "Have you spoken to a bank yet, or would you like me to arrange that?",
      id: "Sudah bicara dengan bank, atau mau saya bantu aturkan?",
      ms: "Sudah berbincang dengan bank, atau mahu saya aturkan?",
    },
  },
  {
    key: "not_now",
    patterns: [/\b(not now|later|next year|tahun depan|nanti saja|belum sekarang|bukan sekarang|not the right time|busy|sibuk|lain kali)\b/i],
    meaning: {
      en: "Timing, or a polite exit. Respect it, keep the relationship warm, and make it easy to restart when they are ready.",
      id: "Soal waktu, atau cara halus untuk pamit. Hormati, jaga hubungan tetap hangat, dan permudah untuk mulai lagi saat mereka siap.",
      ms: "Soal masa, atau jalan keluar yang sopan. Hormatinya, kekalkan hubungan, dan permudah untuk mula semula apabila mereka bersedia.",
    },
    approaches: {
      en: [
        { name: "Ask what changes", how: "What would need to happen for the timing to be right? The answer tells you whether to wait a month or a year." },
        { name: "Offer low-effort value", how: "A monthly note with new listings in their area, nothing more. Let them opt in." },
        { name: "Book the follow-up", how: "Agree a month to check in and put it in your tasks. Then actually do it." },
      ],
      id: [
        { name: "Tanyakan apa yang berubah", how: "Apa yang perlu terjadi supaya waktunya pas? Jawabannya menentukan Anda menunggu sebulan atau setahun." },
        { name: "Tawarkan nilai tanpa beban", how: "Kabar bulanan berisi listing baru di area mereka, tidak lebih. Biarkan mereka yang memilih ikut." },
        { name: "Jadwalkan tindak lanjut", how: "Sepakati bulan untuk menyapa lagi dan catat di tugas Anda. Lalu benar-benar lakukan." },
      ],
      ms: [
        { name: "Tanya apa yang berubah", how: "Apa yang perlu berlaku supaya masanya sesuai? Jawapannya memberitahu sama ada menunggu sebulan atau setahun." },
        { name: "Tawarkan nilai tanpa beban", how: "Nota bulanan dengan penyenaraian baharu di kawasan mereka, tidak lebih. Biar mereka memilih untuk menerimanya." },
        { name: "Tempah susulan", how: "Setuju satu bulan untuk bertanya khabar dan catat dalam tugasan anda. Kemudian benar-benar lakukannya." },
      ],
    },
    sample: {
      en: "Completely understood. So I don't bother you, what would need to change for the timing to be right? If you'd like, I'll send one short note a month with anything new in your area, and check in properly in a few months.",
      id: "Sangat dipahami. Supaya saya tidak mengganggu — apa yang perlu berubah agar waktunya pas? Kalau berkenan, saya kirim satu kabar singkat per bulan berisi yang baru di area Bapak/Ibu, dan menyapa lagi beberapa bulan ke depan.",
      ms: "Faham sepenuhnya. Supaya saya tidak mengganggu — apa yang perlu berubah untuk masanya sesuai? Jika mahu, saya hantar satu nota ringkas sebulan tentang apa yang baharu di kawasan tuan/puan, dan bertanya khabar semula dalam beberapa bulan.",
    },
    followUp: {
      en: "When would be a good month for me to check back?",
      id: "Bulan apa yang enak untuk saya hubungi lagi?",
      ms: "Bulan apa yang sesuai untuk saya hubungi semula?",
    },
  },
];

export function matchObjection(text: string): ObjectionEntry | null {
  for (const o of OBJECTIONS) if (o.patterns.some((p) => p.test(text))) return o;
  return null;
}

/** The practice scenarios for the Team Coach: a client line the agent answers. */
export const SCENARIOS: { key: string; client: Tri; context: Tri }[] = [
  { key: "first_reply", client: { en: "Hi, is this unit still available? What's the lowest price?", id: "Halo, unitnya masih ada? Harga paling rendah berapa?", ms: "Hai, unit ini masih ada? Harga paling rendah berapa?" },
    context: { en: "A first WhatsApp enquiry on a published listing, no other information.", id: "Pertanyaan WhatsApp pertama untuk listing yang tayang, tanpa info lain.", ms: "Pertanyaan WhatsApp pertama untuk penyenaraian yang diterbitkan, tiada maklumat lain." } },
  { key: "late_reply", client: { en: "I messaged two days ago and nobody replied. Is anyone handling this?", id: "Saya sudah chat dua hari lalu dan belum dibalas. Ada yang menangani?", ms: "Saya mesej dua hari lepas dan tiada balasan. Ada sesiapa yang uruskan?" },
    context: { en: "The lead went unanswered past the response deadline.", id: "Prospek tidak dibalas melewati tenggat respons.", ms: "Petunjuk tidak dibalas melepasi tarikh akhir respons." } },
  { key: "viewing_noshow", client: { en: "Sorry, something came up, I couldn't make the viewing.", id: "Maaf, ada urusan mendadak, saya tidak bisa datang lihat tadi.", ms: "Maaf, ada hal mendadak, saya tak dapat hadir lawatan tadi." },
    context: { en: "The client missed a confirmed viewing without notice.", id: "Klien tidak hadir pada kunjungan yang sudah dikonfirmasi tanpa kabar.", ms: "Klien tidak hadir lawatan yang disahkan tanpa notis." } },
  { key: "owner_price", client: { en: "My neighbour sold for more last year. I want at least that.", id: "Tetangga saya jual lebih mahal tahun lalu. Saya mau minimal segitu.", ms: "Jiran saya jual lebih mahal tahun lepas. Saya mahu sekurang-kurangnya begitu." },
    context: { en: "A listing appointment: the owner anchors on a neighbour's past sale.", id: "Pertemuan listing: pemilik berpatokan pada penjualan tetangga di masa lalu.", ms: "Temu janji penyenaraian: pemilik berpaksi pada jualan jiran yang lepas." } },
  { key: "lowball", client: { en: "I'll offer 20% below asking, cash, this week.", id: "Saya tawar 20% di bawah harga, tunai, minggu ini.", ms: "Saya tawar 20% bawah harga, tunai, minggu ini." },
    context: { en: "A buyer's aggressive first offer you must bring to the owner.", id: "Tawaran pertama pembeli yang agresif yang harus Anda sampaikan ke pemilik.", ms: "Tawaran pertama pembeli yang agresif yang perlu anda bawa kepada pemilik." } },
  { key: "post_viewing", client: { en: "Thanks for the viewing. We liked it but we're seeing three more this weekend.", id: "Terima kasih sudah ditemani lihat. Kami suka, tapi akhir pekan ini masih lihat tiga lagi.", ms: "Terima kasih untuk lawatan tadi. Kami suka, tapi hujung minggu ini kami tengok tiga lagi." },
    context: { en: "The follow-up message after a good viewing.", id: "Pesan tindak lanjut setelah kunjungan yang baik.", ms: "Mesej susulan selepas lawatan yang baik." } },
];

export function langOf(locale: string): Lang {
  return locale === "id" ? "id" : locale === "ms" ? "ms" : "en";
}
