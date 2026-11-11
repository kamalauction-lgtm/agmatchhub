import "server-only";
// Relative, not `@/`: unit tests import this module without the hub alias.
import { unitSuffix, type SizeUnit } from "../listings/vocabulary";
import { copyLanguage } from "./copy-language";

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
  /** The listing's market (D8). Absent means Indonesia, as before. */
  currency?: string | null;
  sizeUnit?: SizeUnit | null;
  /**
   * The listing's stored language (P0-d-1c). The copy follows it: `id` keeps
   * the Indonesian writer exactly as it was, `en` writes English, and `ms`
   * writes English until reviewed Malay phrases exist (see copy-language.ts).
   * Absent means Indonesian, as before.
   */
  language?: string | null;
};

/** English names for the tenures, for English copy. Legal terms, not translated freely. */
const OWNERSHIP_EN: Record<string, string> = {
  shm: "SHM (freehold title)", hgb: "HGB (right to build)", hgu: "HGU", hp: "Right of use", hbg: "HGB over HPL",
  girik: "Girik", strata: "Strata title", ppjb: "PPJB", adat: "Customary land",
  freehold: "Freehold", leasehold_99: "Leasehold (99 years)", leasehold_60: "Leasehold (60 years)",
  leasehold_other: "Leasehold", malay_reserve: "Malay reserve land", bumi_lot: "Bumi lot",
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

/**
 * Tenure label for Studio copy. Indonesian titles keep their existing short
 * labels in both languages (unchanged output). In English copy, Malaysian
 * tenures, which have no Indonesian label, use their English names; Indonesian
 * copy is left exactly as it was.
 */
function tenureLabel(slug: string | null | undefined, lang: Lang): string | null {
  if (!slug) return null;
  return OWNERSHIP[slug] ?? (lang === "en" ? OWNERSHIP_EN[slug] : undefined) ?? null;
}

function place(i: WriterInput): string {
  return [i.area, i.regency].filter(Boolean).join(", ") || i.province || "";
}

/** Certificate label (SHM, HGB…) — legal terms, the same in every language. */
export function ownershipLabel(slug: string | null | undefined): string | null {
  return slug ? (OWNERSHIP[slug] ?? null) : null;
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

/** Price in the listing's own currency: rupiah keeps its "miliar/juta" form. */
function priceText(v: number, currency: string | null | undefined): string {
  const c = currency ?? "IDR";
  if (c === "IDR") return rupiah(v);
  return new Intl.NumberFormat(c === "MYR" ? "en-MY" : "en-US", { style: "currency", currency: c, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

/** Size suffix in the listing's own unit. */
function withUnit(text: string, unit: SizeUnit | null | undefined): string {
  return unit === "sqft" ? text.replace(/ m²/g, ` ${unitSuffix("sqft")}`) : text;
}

/** Three title options, so the agent picks rather than accepts. */
export function writeTitles(i: WriterInput): string[] {
  if (copyLanguage(i.language).lang === "en") return writeTitlesEn(i);
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

/* -------------------------------------------------------------------------- */
/* Content Studio outputs (docs/module-content-studio.md)                      */
/* -------------------------------------------------------------------------- */

/**
 * What the studio adds on top of the wizard's fields: the published title
 * (already agent-approved copy), the link that captures the lead for the agent
 * SENDING the asset — for a borrowed listing that is the borrower's landing
 * page, never the marketplace page that names the original agent — and the
 * listing's `language` column, which the copy follows instead of the UI locale.
 */
export type StudioInput = WriterInput & {
  title: string;
  /** Null when no marketplace URL is configured; the call-to-action line is then left out. */
  url: string | null;
  /** Raw DB value (rumah, apartemen…), used for hashtags. */
  propertyTypeSlug?: string | null;
};

type Lang = "id" | "en";

/** The listing's language, narrowed to a phrase set (Malay: English for now). */
function langOf(language?: string | null): Lang {
  return copyLanguage(language).lang;
}

const T: Record<
  Lang,
  {
    perMonth: string;
    perYear: string;
    nego: string;
    negoLong: string;
    landBuild: (lt: number, lb: number) => string;
    build: (lb: number) => string;
    land: (lt: number) => string;
    beds: (n: number) => string;
    baths: (n: number) => string;
    ready: string;
    surveySlot: string;
    docsReady: string;
    cta: string;
    dm: string;
    details: string;
    facilities: string;
    floors: (n: number) => string;
    furn: Record<string, string>;
    cond: Record<string, string>;
  }
> = {
  id: {
    perMonth: " / bulan",
    perYear: " / tahun",
    nego: " (nego)",
    negoLong: " (nego untuk penawaran serius)",
    landBuild: (lt, lb) => `LT ${lt} / LB ${lb} m²`,
    build: (lb) => `LB ${lb} m²`,
    land: (lt) => `LT ${lt} m²`,
    beds: (n) => `${n} KT`,
    baths: (n) => `${n} KM`,
    ready: "Siap huni — bisa langsung ditempati.",
    surveySlot: "Jadwal survey minggu ini masih tersedia.",
    docsReady: "Dokumen lengkap dan siap proses.",
    cta: "Info lengkap & jadwal survey 👉",
    dm: "Atau DM saya langsung 📩",
    details: "📋 DETAIL",
    facilities: "✨ FASILITAS",
    floors: (n) => `${n} lantai`,
    furn: FURNISHING,
    cond: CONDITION,
  },
  en: {
    perMonth: " / month",
    perYear: " / year",
    nego: " (negotiable)",
    negoLong: " (negotiable for serious offers)",
    landBuild: (lt, lb) => `Land ${lt} / build ${lb} m²`,
    build: (lb) => `Build ${lb} m²`,
    land: (lt) => `Land ${lt} m²`,
    beds: (n) => `${n} BR`,
    baths: (n) => `${n} BA`,
    ready: "Move-in ready — no renovation needed.",
    surveySlot: "Viewing slots are still open this week.",
    docsReady: "Documents complete and ready to process.",
    cta: "Full details & viewing schedule 👉",
    dm: "Or DM me directly 📩",
    details: "📋 DETAILS",
    facilities: "✨ FACILITIES",
    floors: (n) => `${n} floors`,
    furn: {
      unfurnished: "Unfurnished",
      partially: "Semi furnished",
      fully: "Fully furnished",
    },
    cond: {
      new: "Brand new, never occupied",
      excellent: "Excellent condition",
      good: "Well kept, move-in ready",
      needs_renovation: "Needs light renovation",
      under_construction: "Under construction",
    },
  },
};

/** `🛏️ 3 KT · 🚿 2 KM · 📐 LT 120 / LB 90 m²`, from whatever is filled in. */
function specLine(i: WriterInput, L: (typeof T)[Lang]): string {
  const parts: string[] = [];
  if (i.bedrooms) parts.push(`🛏️ ${L.beds(i.bedrooms)}`);
  if (i.bathrooms) parts.push(`🚿 ${L.baths(i.bathrooms)}`);
  if (i.landSize && i.buildingSize) parts.push(`📐 ${L.landBuild(i.landSize, i.buildingSize)}`);
  else if (i.buildingSize) parts.push(`📐 ${L.build(i.buildingSize)}`);
  else if (i.landSize) parts.push(`📐 ${L.land(i.landSize)}`);
  return withUnit(parts.join(" · "), i.sizeUnit);
}

function priceLine(i: WriterInput, L: (typeof T)[Lang], long: boolean): string {
  if (!i.price) return "";
  const period =
    i.listingType === "rent" ? (i.rentPeriod === "yearly" ? L.perYear : L.perMonth) : "";
  const nego = i.negotiable === false ? "" : long ? L.negoLong : L.nego;
  return `💰 ${priceText(i.price, i.currency)}${period}${nego}`;
}

/** True by construction: only claimed when the agent's own fields say so. */
function readyLine(i: WriterInput, L: (typeof T)[Lang]): string | null {
  if (i.condition === "new" || i.condition === "excellent" || i.furnishing === "fully") {
    return L.ready;
  }
  return null;
}

/** `Jakarta Selatan` -> `jakartaselatan`. */
function tagify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Hashtags from data, not from a model: property type, transaction and place.
 * Kept Indonesian regardless of listing language — they are what buyers in
 * this market actually search.
 */
export function suggestHashtags(i: StudioInput): string[] {
  const type = tagify(i.propertyTypeSlug ?? "");
  const verb = i.listingType === "rent" ? "disewakan" : "dijual";
  const deal = i.listingType === "rent" ? "sewa" : "jual";
  const regency = tagify(i.regency ?? "");
  const province = tagify(i.province ?? "");

  const tags = [
    type && `${type}${verb}`,
    type && `${deal}${type}`,
    regency,
    type && regency && `${type}${regency}`,
    province && province !== regency ? `properti${province}` : "",
    "properti",
    "propertiindonesia",
  ].filter((t): t is string => !!t);

  return [...new Set(tags)].slice(0, 8).map((t) => `#${t}`);
}

/**
 * WhatsApp broadcast: short, emoji-structured, readable at a glance in a chat,
 * link at the end. `*bold*` is WhatsApp formatting. No phone number — the link
 * routes the client through lead capture to the sending agent.
 */
export function writeWhatsappBroadcast(i: StudioInput): string {
  const L = T[langOf(i.language)];
  const p = place(i);

  const facts: string[] = [];
  if (p) facts.push(`📍 ${p}`);
  const specs = specLine(i, L);
  if (specs) facts.push(specs);
  const cert: string[] = [];
  const certLabel = tenureLabel(i.ownership, langOf(i.language));
  if (certLabel) cert.push(`📜 ${certLabel}`);
  if (i.furnishing === "fully") cert.push("🛋️ Full furnished");
  if (cert.length) facts.push(cert.join(" · "));
  const price = priceLine(i, L, false);
  if (price) facts.push(price);

  const blocks: string[] = [`🏡 *${i.title}*`, facts.join("\n")];
  const ready = readyLine(i, L);
  if (ready) blocks.push(`✅ ${ready}`);
  if (i.url) blocks.push(`${L.cta} ${i.url}`);

  return blocks.filter(Boolean).join("\n\n");
}

/**
 * Instagram / Facebook caption: longer, bullet details, hashtag block, with
 * blank lines that survive the paste. Same facts, same rules — nothing here
 * that is not in the listing.
 */
export function writeSocialCaption(i: StudioInput): string {
  const L = T[langOf(i.language)];
  const p = place(i);
  const blocks: string[] = [`🏡 ${i.title}`];

  const hook: string[] = [];
  if (i.condition && L.cond[i.condition]) hook.push(`${L.cond[i.condition]}.`);
  const ready = readyLine(i, L);
  if (ready) hook.push(ready);
  if (hook.length) blocks.push(hook.join(" "));

  const details: string[] = [];
  const specs = specLine(i, L);
  if (specs) for (const s of specs.split(" · ")) details.push(`• ${s}`);
  if (i.parking) details.push(`• 🚗 Carport ${i.parking}`);
  if (i.floors && i.floors > 1) details.push(`• 🏢 ${L.floors(i.floors)}`);
  const tenure = tenureLabel(i.ownership, langOf(i.language));
  if (tenure) details.push(`• 📜 ${tenure}`);
  if (i.furnishing && L.furn[i.furnishing]) details.push(`• 🛋️ ${L.furn[i.furnishing]}`);
  if (details.length) blocks.push(`${L.details}\n${details.join("\n")}`);

  if (i.facilities?.length) {
    const f = i.facilities
      .slice(0, 6)
      .map((x) => `• ✅ ${x.charAt(0).toUpperCase()}${x.slice(1)}`)
      .join("\n");
    blocks.push(`${L.facilities}\n${f}`);
  }

  const tail: string[] = [];
  const price = priceLine(i, L, true);
  if (price) tail.push(price);
  if (p) tail.push(`📍 ${p}`);
  if (tail.length) blocks.push(tail.join("\n"));

  blocks.push(i.url ? `${L.cta} ${i.url}\n${L.dm}` : L.dm);

  const tags = suggestHashtags(i);
  if (tags.length) blocks.push(tags.join(" "));

  return blocks.join("\n\n");
}

/**
 * A structured, scannable description: hook → specs → facilities → location →
 * reason to act → contact.
 */
export function writeDescription(i: WriterInput): string {
  if (copyLanguage(i.language).lang === "en") return writeDescriptionEn(i);
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
    specs.push(withUnit(`📐 LT ${i.landSize} m² / LB ${i.buildingSize} m²`, i.sizeUnit));
  } else if (i.buildingSize) {
    specs.push(withUnit(`📐 Luas bangunan ${i.buildingSize} m²`, i.sizeUnit));
  } else if (i.landSize) {
    specs.push(withUnit(`📐 Luas tanah ${i.landSize} m²`, i.sizeUnit));
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
    blocks.push(`💰 HARGA\n• ${priceText(i.price, i.currency)}${period}${nego}`);
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

/* -------------------------------------------------------------------------- */
/* English (P0-d-1c): same structure and the same rule — only the agent's own */
/* fields, no invented urgency. "Move-in ready" is claimed only when the      */
/* condition or furnishing says so.                                           */
/* -------------------------------------------------------------------------- */

function sizeEn(n: number): string {
  return n.toLocaleString("en-US");
}

function writeTitlesEn(i: WriterInput): string[] {
  const p = i.area || i.regency || i.province || "";
  const beds = i.bedrooms ? `${i.bedrooms}BR ` : "";
  const type = i.propertyTypeLabel;
  const furn = i.furnishing === "fully" ? ", fully furnished" : "";
  const ready = i.condition === "new" || i.condition === "excellent" || i.furnishing === "fully";
  const verb = i.listingType === "rent" ? "For rent" : "For sale";
  const tenure = i.ownership ? OWNERSHIP_EN[i.ownership] : undefined;

  const options = [
    `${verb}: ${type} ${beds}in ${p}${furn}${ready ? ", move-in ready" : ""}`,
    i.buildingName ? `${type} ${beds}at ${i.buildingName}, ${p}` : `${type} ${beds}in ${p}, close to amenities`,
    i.condition === "new" ? `New ${type} ${beds}in ${p}, never occupied` : `${type} ${beds}${p}${tenure ? ` — ${tenure}` : ""}`,
  ];

  return options
    .map((s) => s.replace(/\s+/g, " ").replace(/\s,/g, ",").replace(/ in ,/g, ",").replace(/ — $/, "").trim())
    .filter((s, idx, arr) => s.length > 15 && arr.indexOf(s) === idx);
}

function writeDescriptionEn(i: WriterInput): string {
  const L = T.en;
  const blocks: string[] = [];
  const p = place(i);
  const type = i.propertyTypeLabel;
  const verb = i.listingType === "rent" ? "FOR RENT" : "FOR SALE";
  const beds = i.bedrooms ? ` ${i.bedrooms}BR` : "";
  const unit = unitSuffix(i.sizeUnit ?? "sqm");

  blocks.push(`🏡 ${verb}: ${type.toUpperCase()}${beds}${p ? ` IN ${p.toUpperCase()}` : ""}`);

  const hook: string[] = [];
  if (i.buildingName) hook.push(`Located at ${i.buildingName}${p ? `, ${p}` : ""}.`);
  else if (p) hook.push(`Located in ${p}.`);
  if (i.condition && L.cond[i.condition]) hook.push(`${L.cond[i.condition]}.`);
  if (i.furnishing === "fully") hook.push("Fully furnished — just bring your suitcase.");
  if (hook.length) blocks.push(hook.join(" "));

  const specs: string[] = [];
  if (i.bedrooms) specs.push(`🛏️ ${i.bedrooms} bedroom${i.bedrooms === 1 ? "" : "s"}`);
  if (i.bathrooms) specs.push(`🚿 ${i.bathrooms} bathroom${i.bathrooms === 1 ? "" : "s"}`);
  if (i.parking) specs.push(`🚗 Parking for ${i.parking} car${i.parking === 1 ? "" : "s"}`);
  if (i.floors && i.floors > 1) specs.push(`🏢 ${i.floors} floors`);
  if (i.landSize && i.buildingSize) specs.push(`📐 Land ${sizeEn(i.landSize)} ${unit} / built-up ${sizeEn(i.buildingSize)} ${unit}`);
  else if (i.buildingSize) specs.push(`📐 Built-up ${sizeEn(i.buildingSize)} ${unit}`);
  else if (i.landSize) specs.push(`📐 Land ${sizeEn(i.landSize)} ${unit}`);
  if (i.ownership && OWNERSHIP_EN[i.ownership]) specs.push(`📜 ${OWNERSHIP_EN[i.ownership]}`);
  if (i.furnishing && L.furn[i.furnishing]) specs.push(`🛋️ ${L.furn[i.furnishing]}`);
  if (i.yearBuilt) specs.push(`📅 Built ${i.yearBuilt}`);
  if (specs.length) blocks.push(`📋 SPECIFICATIONS\n${specs.map((s) => `• ${s}`).join("\n")}`);

  if (i.facilities?.length) {
    const f = i.facilities.slice(0, 10).map((x) => `• ✅ ${x.charAt(0).toUpperCase()}${x.slice(1)}`).join("\n");
    blocks.push(`${L.facilities}\n${f}`);
  }

  if (i.price) {
    const period = i.listingType === "rent" ? (i.rentPeriod === "yearly" ? L.perYear : L.perMonth) : "";
    const nego = i.negotiable === false ? "" : L.negoLong;
    blocks.push(`💰 PRICE\n• ${priceText(i.price, i.currency)}${period}${nego}`);
  }

  if (p) blocks.push(`📍 LOCATION\n• ${p}\n• Add the nearest landmarks here (station, highway, school, mall)`);

  const now: string[] = [];
  if (i.condition === "new" || i.condition === "excellent" || i.furnishing === "fully") now.push("Move-in ready — no renovation needed.");
  now.push(i.listingType === "rent" ? L.surveySlot : L.docsReady);
  blocks.push(`⚡ ${now.join(" ")}`);

  blocks.push("📱 CONTACT ME\nTap the WhatsApp button on this listing to ask for details, request more photos or book a viewing. I reply quickly.");

  return blocks.join("\n\n");
}
