/**
 * Malaysian geography: state → district → township.
 *
 * Three levels, matching the Indonesian shape so every facet, search and
 * breadcrumb works unchanged across both markets.
 *
 *   state     13 states + 3 federal territories
 *   district  daerah — the administrative division under a state
 *   township  NOT administrative. Nobody searches "Daerah Petaling"; they
 *             search "Mont Kiara", "Setia Alam", "Iskandar Puteri". Modelled at
 *             the third level so the hierarchy that already exists carries the
 *             names buyers actually type.
 *
 * Districts are the authoritative administrative list. Townships are a starter
 * set covering the areas that carry real listing volume — deliberately NOT an
 * attempt to be exhaustive, because an invented or misplaced township is worse
 * than a missing one: it sends a buyer to an empty result set and tells an
 * agent their area is covered when it is not. The set grows from live listings.
 *
 * Idempotent: re-running updates names in place rather than duplicating.
 *
 *   node scripts/seed-locations-my.mjs --env=production
 */
import pg from "pg";
import { loadEnv } from "./load-env.mjs";

const { url } = loadEnv();

/** state → districts → townships (townships optional per district). */
const MALAYSIA = {
  "Johor": {
    "Johor Bahru": ["Iskandar Puteri", "Mount Austin", "Tebrau", "Skudai", "Permas Jaya",
                    "Bukit Indah", "Danga Bay", "Larkin", "Pasir Gudang", "Ulu Tiram"],
    "Kulai": ["Senai", "Kulai"],
    "Batu Pahat": [], "Muar": [], "Kluang": [], "Kota Tinggi": [], "Pontian": [],
    "Segamat": [], "Mersing": [], "Tangkak": [],
  },
  "Kedah": {
    "Kota Setar": ["Alor Setar"], "Kuala Muda": ["Sungai Petani"], "Kulim": [],
    "Langkawi": [], "Kubang Pasu": ["Jitra"], "Baling": [], "Bandar Baharu": [],
    "Padang Terap": [], "Pendang": [], "Sik": [], "Yan": [], "Pokok Sena": [],
  },
  "Kelantan": {
    "Kota Bharu": [], "Pasir Mas": [], "Tumpat": [], "Bachok": [], "Pasir Puteh": [],
    "Machang": [], "Tanah Merah": [], "Kuala Krai": [], "Gua Musang": [], "Jeli": [],
  },
  "Melaka": {
    "Melaka Tengah": ["Ayer Keroh", "Bandar Hilir", "Klebang"],
    "Alor Gajah": [], "Jasin": [],
  },
  "Negeri Sembilan": {
    "Seremban": ["Seremban 2", "Nilai", "Senawang"],
    "Port Dickson": [], "Jempol": [], "Kuala Pilah": [], "Rembau": [],
    "Tampin": [], "Jelebu": [],
  },
  "Pahang": {
    "Kuantan": [], "Temerloh": [], "Bentong": [], "Raub": [], "Jerantut": [],
    "Pekan": [], "Rompin": [], "Lipis": [], "Cameron Highlands": [],
    "Maran": [], "Bera": [],
  },
  "Perak": {
    "Kinta": ["Ipoh", "Batu Gajah", "Tanjung Rambutan"],
    "Manjung": ["Sitiawan", "Lumut"],
    "Kuala Kangsar": [], "Larut, Matang dan Selama": ["Taiping"],
    "Perak Tengah": [], "Hilir Perak": ["Teluk Intan"], "Batang Padang": ["Tapah"],
    "Hulu Perak": [], "Kerian": [], "Kampar": [], "Muallim": [], "Bagan Datuk": [],
  },
  "Perlis": { "Perlis": ["Kangar", "Arau"] },
  "Pulau Pinang": {
    "Timur Laut": ["George Town", "Tanjung Tokong", "Tanjung Bungah",
                   "Batu Ferringhi", "Gelugor", "Jelutong", "Air Itam"],
    "Barat Daya": ["Bayan Lepas", "Balik Pulau", "Teluk Kumbar"],
    "Seberang Perai Utara": ["Butterworth", "Kepala Batas"],
    "Seberang Perai Tengah": ["Bukit Mertajam", "Seberang Jaya", "Juru"],
    "Seberang Perai Selatan": ["Nibong Tebal", "Simpang Ampat"],
  },
  "Sabah": {
    "Kota Kinabalu": ["Likas", "Luyang", "Inanam"],
    "Penampang": [], "Putatan": [], "Sandakan": [], "Tawau": [], "Lahad Datu": [],
    "Keningau": [], "Papar": [], "Tuaran": [], "Kudat": [], "Semporna": [],
    "Beaufort": [], "Ranau": [], "Kinabatangan": [],
  },
  "Sarawak": {
    "Kuching": ["Petra Jaya", "Padungan", "Batu Kawa"],
    "Samarahan": [], "Serian": [], "Sri Aman": [], "Betong": [], "Sarikei": [],
    "Sibu": [], "Mukah": [], "Bintulu": [], "Miri": [], "Limbang": [], "Kapit": [],
  },
  "Selangor": {
    "Petaling": ["Petaling Jaya", "Subang Jaya", "Shah Alam", "Kota Damansara",
                 "Ara Damansara", "Bandar Utama", "Mutiara Damansara", "Tropicana",
                 "Damansara Perdana", "Kelana Jaya", "USJ", "Puchong", "Sunway",
                 "Seri Kembangan", "Glenmarie", "Setia Alam", "Kota Kemuning"],
    "Hulu Langat": ["Kajang", "Semenyih", "Bangi", "Cheras", "Ampang", "Balakong"],
    "Klang": ["Klang", "Port Klang", "Bandar Botanic", "Bukit Tinggi"],
    "Gombak": ["Rawang", "Selayang", "Batu Caves", "Gombak", "Kundang"],
    "Sepang": ["Cyberjaya", "Dengkil", "Salak Tinggi", "Bandar Baru Salak Tinggi"],
    "Kuala Langat": ["Banting", "Telok Panglima Garang"],
    "Hulu Selangor": ["Serendah", "Kuala Kubu Bharu"],
    "Kuala Selangor": ["Ijok", "Bestari Jaya"],
    "Sabak Bernam": [],
  },
  "Terengganu": {
    "Kuala Terengganu": [], "Kuala Nerus": [], "Kemaman": [], "Dungun": [],
    "Besut": [], "Marang": [], "Hulu Terengganu": [], "Setiu": [],
  },
  /* Federal territories have no districts. The capital is modelled as a single
     district so the three-level hierarchy stays uniform — a township must have
     a parent, and special-casing the depth would complicate every query that
     walks it. */
  "Kuala Lumpur": {
    "Kuala Lumpur": ["Mont Kiara", "Bangsar", "Bangsar South", "KLCC", "Bukit Bintang",
                     "Damansara Heights", "Sri Hartamas", "Taman Tun Dr Ismail",
                     "Desa ParkCity", "Cheras", "Setapak", "Wangsa Maju", "Sentul",
                     "Kepong", "Segambut", "Titiwangsa", "Brickfields", "KL Sentral",
                     "Seputeh", "Old Klang Road", "Jalan Ipoh", "Sri Petaling",
                     "Bukit Jalil", "Salak South", "Pantai", "Setiawangsa",
                     "Taman Desa", "Mid Valley City"],
  },
  "Putrajaya": { "Putrajaya": ["Presint 8", "Presint 9", "Presint 11", "Presint 15"] },
  "Labuan": { "Labuan": ["Victoria"] },
};

const normalise = (s) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const slugify = (s) =>
  normalise(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Township names are not unique across the country. Cheras is a real, heavily
 * searched area in BOTH Kuala Lumpur and Selangor (Hulu Langat) — they are
 * adjacent, and they are different markets at different prices. The slug is
 * unique per (country, level, slug), so without this the second one silently
 * overwrote the first and one of them vanished.
 *
 * Only genuinely colliding names are qualified, so "Mont Kiara" stays
 * "Mont Kiara" and only the ambiguous ones carry their state.
 */
function disambiguate() {
  const seen = new Map();
  for (const districtMap of Object.values(MALAYSIA)) {
    for (const townshipList of Object.values(districtMap)) {
      for (const name of townshipList) {
        seen.set(name, (seen.get(name) ?? 0) + 1);
      }
    }
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name));
}

const AMBIGUOUS = disambiguate();

const SQL = `
  insert into public.locations
    (country_code, level, parent_id, code, name, name_normalised, slug,
     path_names, ancestor_ids, is_active)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
  on conflict (country_code, level, slug) do update set
    code = excluded.code,
    name = excluded.name,
    name_normalised = excluded.name_normalised,
    parent_id = excluded.parent_id,
    path_names = excluded.path_names,
    ancestor_ids = excluded.ancestor_ids,
    is_active = true
  returning id`;

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();

let states = 0, districts = 0, townships = 0;

try {
  await db.query("begin");

  for (const [stateName, districtMap] of Object.entries(MALAYSIA)) {
    const stateId = (
      await db.query(SQL, [
        "MY", "state", null, null, stateName, normalise(stateName), slugify(stateName),
        [stateName], [],
      ])
    ).rows[0].id;
    states++;

    for (const [districtName, townshipList] of Object.entries(districtMap)) {
      const districtId = (
        await db.query(SQL, [
          "MY", "district", stateId, null, districtName, normalise(districtName),
          slugify(districtName), [stateName, districtName], [stateId],
        ])
      ).rows[0].id;
      districts++;

      for (const townshipName of townshipList) {
        const ambiguous = AMBIGUOUS.has(townshipName);
        const displayName = ambiguous ? `${townshipName}, ${stateName}` : townshipName;
        const slug = ambiguous
          ? `${slugify(townshipName)}-${slugify(stateName)}`
          : slugify(townshipName);

        await db.query(SQL, [
          "MY", "township", districtId, null, displayName, normalise(displayName), slug,
          [stateName, districtName, townshipName], [stateId, districtId],
        ]);
        townships++;
      }
    }
  }

  await db.query("commit");
  console.log(`Malaysia: ${states} states/FTs, ${districts} districts, ${townships} townships`);
} catch (err) {
  await db.query("rollback");
  console.error("seed failed, rolled back:", err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
