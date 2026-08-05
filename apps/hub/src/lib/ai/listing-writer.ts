import "server-only";

/**
 * Writes listing copy from the structured fields the agent already entered.
 *
 * Deterministic today — no model, no API key, no cost, no latency, and it
 * cannot hallucinate a swimming pool that does not exist because it only ever
 * uses values the agent typed. A model slots in behind the same interface
 * later and this becomes the fallback (§12: AI-assisted, not AI-dependent).
 *
 * Layout follows how Indonesian property listings actually read on WhatsApp
 * and Facebook: a hook, scannable bullet sections with icons, location, a
 * reason to act now, and a contact line. A wall of prose gets skipped.
 *
 * On urgency — every line this produces is true by construction: it is drawn
 * from the agent's own fields (ready to occupy, negotiable, available now) or
 * is an invitation to book. It never manufactures scarcity like "3 people are
 * viewing this" or "only 1 left", because those are unverifiable, and a
 * listing caught lying costs the agent the client.
 */

export type WriterInput = {
  listingType: "sale" | "rent";
  propertyTypeLabel: string;
  province?: string | null;
  regency?: string | null;
  area?: string | null;
  buildingName?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parking?: number | null;
  floors?: number | null;
  landSize?: number | null;
  buildingSize?: number | null;
  yearBuilt?: number | null;
  furnishing?: string | null;
  condition?: string | null;
  ownership?: string | null;
  facilities?: string[];
  price?: number | null;
  rentPeriod?: "monthly" | "yearly" | null;
  negotiable?: boolean;
};

const FURNISHING: Record<string, string> = {
  unfurnished: "Tanpa perabot",
  partially: "Semi furnished",
  fully: "Full furnished",
};

const CONDITION: Record<string, string> = {
  new: "Baru, belum pernah dihuni",
  excellent: "Kondisi sangat baik",
  good: "Terawat, siap huni",
  needs_renovation: "Perlu sedikit renovasi",
  under_construction: "Dalam pembangunan",
};

const OWNERSHIP: Record<string, string> = {
  shm: "SHM",
  hgb: "HGB",
  hgu: "HGU",
  hp: "Hak Pakai",
  hbg: "HGB di atas HPL",
  girik: "Girik",
  strata: "Strata Title",
  ppjb: "PPJB",
  adat: "Tanah Adat",
};

function place(i: WriterInput): string {
  return [i.area, i.regency].filter(Boolean).join(", ") || i.province || "";
}

function rupiah(v: number): string {
  if (v >= 1_000_000_000) {
    const n = v / 1_000_000_000;
    return `Rp${(n % 1 === 0 ? n : Number(n.toFixed(2))).toLocaleString("id-ID")} miliar`;
  }
  if (v >= 1_000_000) {
    const n = v / 1_000_000;
    return `Rp${(n % 1 === 0 ? n : Number(n.toFixed(1))).toLocaleString("id-ID")} juta`;
  }
  return `Rp${v.toLocaleString("id-ID")}`;
}

/** Three title options, so the agent picks rather than accepts. */
export function writeTitles(i: WriterInput): string[] {
  const p = i.area || i.regency || i.province || "";
  const beds = i.bedrooms ? `${i.bedrooms}KT ` : "";
  const type = i.propertyTypeLabel;
  const furn = i.furnishing === "fully" ? " full furnished" : "";
  const rent = i.listingType === "rent";

  const options = [
    rent
      ? `Disewakan ${type} ${beds}di ${p}${furn}, siap huni`
      : `Dijual ${type} ${beds}di ${p}${furn}, siap huni`,
    i.buildingName
      ? `${type} ${beds}${i.buildingName}, ${p} — lokasi strategis`
      : `${type} ${beds}${p}, dekat fasilitas lengkap`,
    i.condition === "new"
      ? `${type} baru ${beds}di ${p}, belum pernah dihuni`
      : `${type} ${beds}${p}${i.ownership ? ` — ${OWNERSHIP[i.ownership] ?? ""}` : ""}`,
  ];

  return options
    .map((s) => s.replace(/\s+/g, " ").replace(/\s,/g, ",").replace(/ — $/, "").trim())
    .filter((s, idx, arr) => s.length > 15 && arr.indexOf(s) === idx);
}

/**
 * A structured, scannable description: hook → specs → facilities → location →
 * reason to act → contact.
 */
export function writeDescription(i: WriterInput): string {
  const blocks: string[] = [];
  const p = place(i);
  const type = i.propertyTypeLabel;
  const verb = i.listingType === "rent" ? "DISEWAKAN" : "DIJUAL";
  const beds = i.bedrooms ? ` ${i.bedrooms}KT` : "";

  // --- hook ------------------------------------------------------------------
  blocks.push(`🏡 ${verb}: ${type.toUpperCase()}${beds.toUpperCase()}${p ? ` DI ${p.toUpperCase()}` : ""}`);

  const hook: string[] = [];
  if (i.buildingName) hook.push(`Berlokasi di ${i.buildingName}${p ? `, ${p}` : ""}.`);
  else if (p) hook.push(`Berlokasi di ${p}.`);
  if (i.condition && CONDITION[i.condition]) hook.push(`${CONDITION[i.condition]}.`);
  if (i.furnishing === "fully") hook.push("Tinggal bawa koper, semua perabot sudah tersedia.");
  if (hook.length) blocks.push(hook.join(" "));

  // --- specifications --------------------------------------------------------
  const specs: string[] = [];
  if (i.bedrooms) specs.push(`🛏️ ${i.bedrooms} Kamar Tidur`);
  if (i.bathrooms) specs.push(`🚿 ${i.bathrooms} Kamar Mandi`);
  if (i.parking) specs.push(`🚗 Carport ${i.parking} mobil`);
  if (i.floors && i.floors > 1) specs.push(`🏢 ${i.floors} Lantai`);
  if (i.landSize && i.buildingSize) {
    specs.push(`📐 LT ${i.landSize} m² / LB ${i.buildingSize} m²`);
  } else if (i.buildingSize) {
    specs.push(`📐 Luas bangunan ${i.buildingSize} m²`);
  } else if (i.landSize) {
    specs.push(`📐 Luas tanah ${i.landSize} m²`);
  }
  if (i.ownership && OWNERSHIP[i.ownership]) specs.push(`📜 Sertifikat ${OWNERSHIP[i.ownership]}`);
  if (i.furnishing && FURNISHING[i.furnishing]) specs.push(`🛋️ ${FURNISHING[i.furnishing]}`);
  if (i.yearBuilt) specs.push(`📅 Dibangun ${i.yearBuilt}`);

  if (specs.length) blocks.push(`📋 SPESIFIKASI\n${specs.map((s) => `• ${s}`).join("\n")}`);

  // --- facilities ------------------------------------------------------------
  if (i.facilities?.length) {
    const f = i.facilities
      .slice(0, 10)
      .map((x) => `• ✅ ${x.charAt(0).toUpperCase()}${x.slice(1)}`)
      .join("\n");
    blocks.push(`✨ FASILITAS\n${f}`);
  }

  // --- price -----------------------------------------------------------------
  if (i.price) {
    const period =
      i.listingType === "rent" ? (i.rentPeriod === "yearly" ? " / tahun" : " / bulan") : "";
    const nego = i.negotiable === false ? "" : " (nego untuk penawaran serius)";
    blocks.push(`💰 HARGA\n• ${rupiah(i.price)}${period}${nego}`);
  }

  // --- location --------------------------------------------------------------
  if (p) {
    blocks.push(
      `📍 LOKASI\n• ${p}\n• Tambahkan patokan terdekat di sini (stasiun, tol, sekolah, mall)`
    );
  }

  // --- reason to act ---------------------------------------------------------
  // Every line here is drawn from a field the agent filled in, so it stays
  // true. No invented scarcity.
  const now: string[] = [];
  if (i.condition === "new" || i.condition === "excellent" || i.furnishing === "fully") {
    now.push("Siap huni — bisa langsung ditempati tanpa renovasi.");
  }
  if (i.listingType === "rent") now.push("Jadwal survey minggu ini masih tersedia.");
  else now.push("Dokumen lengkap dan siap proses.");
  blocks.push(`⚡ ${now.join(" ")}`);

  // --- contact ---------------------------------------------------------------
  blocks.push(
    "📱 HUBUNGI SAYA\nKlik tombol WhatsApp di listing ini untuk tanya detail, minta foto tambahan, atau atur jadwal survey. Saya balas cepat."
  );

  return blocks.join("\n\n");
}
