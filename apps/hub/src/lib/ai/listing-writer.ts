import "server-only";

/**
 * Writes listing copy from the structured fields the agent already entered.
 *
 * Deterministic today — no model, no API key, no cost, no latency, and it
 * cannot hallucinate a swimming pool that does not exist because it only ever
 * uses values the agent typed. A model slots in behind the same interface
 * later and this becomes the fallback (§12: AI-assisted, not AI-dependent).
 *
 * The agent always edits before publishing. That is the point of showing the
 * draft in an editable box rather than writing it straight into the listing.
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
};

const FURNISHING: Record<string, string> = {
  unfurnished: "tanpa perabot",
  partially: "semi furnished",
  fully: "full furnished",
};

const CONDITION: Record<string, string> = {
  new: "baru",
  excellent: "kondisi sangat baik",
  good: "kondisi terawat",
  needs_renovation: "perlu sedikit renovasi",
  under_construction: "masih dalam pembangunan",
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
  return i.area || i.regency || i.province || "";
}

function specSentence(i: WriterInput): string {
  const parts: string[] = [];
  if (i.bedrooms) parts.push(`${i.bedrooms} kamar tidur`);
  if (i.bathrooms) parts.push(`${i.bathrooms} kamar mandi`);
  if (i.parking) parts.push(`carport ${i.parking} mobil`);
  if (!parts.length) return "";
  const last = parts.pop()!;
  return parts.length ? `${parts.join(", ")}, dan ${last}` : last;
}

function sizeSentence(i: WriterInput): string {
  const bits: string[] = [];
  if (i.landSize) bits.push(`luas tanah ${i.landSize} m²`);
  if (i.buildingSize) bits.push(`luas bangunan ${i.buildingSize} m²`);
  return bits.join(" dengan ");
}

/** Three title options, so the agent picks rather than accepts. */
export function writeTitles(i: WriterInput): string[] {
  const p = place(i);
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
 * A description in three short paragraphs: what it is, what it has, and how to
 * proceed. Short paragraphs because most of these are read on a phone.
 */
export function writeDescription(i: WriterInput): string {
  const p = place(i);
  const type = i.propertyTypeLabel.toLowerCase();
  const paras: string[] = [];

  // 1 — the opening: what and where
  const opening: string[] = [];
  opening.push(
    i.listingType === "rent"
      ? `Disewakan ${type}${i.buildingName ? ` di ${i.buildingName}` : ""}${p ? `, ${p}` : ""}.`
      : `Dijual ${type}${i.buildingName ? ` di ${i.buildingName}` : ""}${p ? `, ${p}` : ""}.`
  );
  if (i.condition && CONDITION[i.condition]) {
    opening.push(`Properti ${CONDITION[i.condition]}${i.yearBuilt ? `, dibangun tahun ${i.yearBuilt}` : ""}.`);
  } else if (i.yearBuilt) {
    opening.push(`Dibangun tahun ${i.yearBuilt}.`);
  }
  paras.push(opening.join(" "));

  // 2 — the specifics
  const detail: string[] = [];
  const specs = specSentence(i);
  if (specs) detail.push(`Terdiri dari ${specs}.`);
  const size = sizeSentence(i);
  if (size) detail.push(`Memiliki ${size}.`);
  if (i.floors && i.floors > 1) detail.push(`Bangunan ${i.floors} lantai.`);
  if (i.furnishing && FURNISHING[i.furnishing]) {
    detail.push(`Unit ${FURNISHING[i.furnishing]}.`);
  }
  if (i.ownership && OWNERSHIP[i.ownership]) {
    detail.push(`Status sertifikat ${OWNERSHIP[i.ownership]}.`);
  }
  if (detail.length) paras.push(detail.join(" "));

  // 3 — facilities
  if (i.facilities?.length) {
    const f = i.facilities.slice(0, 8).join(", ");
    paras.push(`Fasilitas: ${f}.`);
  }

  // 4 — the close. Always a call to action; a description without one wastes
  // the enquiry the listing just earned.
  paras.push(
    i.listingType === "rent"
      ? "Tersedia untuk survey. Hubungi saya untuk mengatur jadwal kunjungan atau menanyakan ketersediaan."
      : "Silakan hubungi saya untuk informasi lengkap, dokumen, atau mengatur jadwal survey ke lokasi."
  );

  return paras.join("\n\n");
}
