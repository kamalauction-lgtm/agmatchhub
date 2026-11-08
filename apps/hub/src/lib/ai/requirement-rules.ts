/**
 * Buyer Profile Builder — the deterministic floor.
 *
 * A client's chat ("cari rumah 3 kamar di Bintaro budget 2M nego, masuk
 * Januari") carries a handful of facts in a handful of shapes. These rules
 * pull out the ones that are unambiguous — transaction, bedrooms, bathrooms,
 * budget with local shorthand, furnishing, a few property types — and leave
 * everything else null. The model (lib/ai/requirement.ts) reads the whole
 * conversation when it can; the agent confirms every field either way.
 *
 * Pure: no imports, unit-tested in packages/db/tests/unit.
 */

export type RequirementDraft = {
  transaction_type: "buy" | "rent" | null;
  property_category: "residential" | "commercial" | "industrial" | "land" | null;
  property_type: string | null;
  city: string | null;
  state_region: string | null;
  preferred_areas: string[];
  budget_min: number | null;
  budget_max: number | null;
  max_monthly_rent: number | null;
  bedrooms_min: number | null;
  bathrooms_min: number | null;
  car_parks_min: number | null;
  min_built_up: number | null;
  furnishing: "unfurnished" | "partially" | "fully" | null;
  expected_move_in: string | null;
  other_requirements: string | null;
  client_profile: string | null;
  title: string;
  missing: string[];
};

const EMPTY: Omit<RequirementDraft, "title" | "missing"> = {
  transaction_type: null, property_category: null, property_type: null, city: null, state_region: null,
  preferred_areas: [], budget_min: null, budget_max: null, max_monthly_rent: null, bedrooms_min: null,
  bathrooms_min: null, car_parks_min: null, min_built_up: null, furnishing: null, expected_move_in: null,
  other_requirements: null, client_profile: null,
};

/**
 * "2M" means two million to a Malaysian and two billion to an Indonesian;
 * the currency hint decides. Everything else is unambiguous.
 */
function multiplier(unit: string, currency: string | null): number {
  const u = unit.toLowerCase();
  if (["jt", "juta", "million", "mil", "mn"].includes(u)) return 1e6;
  if (["miliar", "milyar", "bn", "b", "billion"].includes(u)) return 1e9;
  if (["rb", "ribu", "k"].includes(u)) return 1e3;
  if (u === "m") return currency === "IDR" ? 1e9 : 1e6;
  return 1;
}

const NUM = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(jt|juta|miliar|milyar|million|billion|mil|mn|bn|rb|ribu|k|m|b)?`;

function toNumber(raw: string, unit: string | undefined, currency: string | null): number | null {
  // "1.500.000" / "1,500,000" are thousands groups; "1.5" / "2,5" are decimals.
  const grouped = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw);
  const n = grouped ? Number(raw.replace(/[.,]/g, "")) : Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const v = Math.round(n * multiplier(unit ?? "", currency));
  return v >= 1000 ? v : null; // a bare "3" is a bedroom count, not a budget
}

export function parseBudget(text: string, currency: string | null): { min: number | null; max: number | null } {
  const t = text.replace(/\s+/g, " ");
  // Range: "2 - 3 miliar", "RM2k–3k", "antara 500 jt dan 700 jt", "1.5 to 2 bn".
  const range = new RegExp(String.raw`(?:rm|rp|idr|myr|usd)?\s*${NUM}\s*(?:-|–|to|sampai|hingga|dan|s\/d)\s*(?:rm|rp|idr|myr|usd)?\s*${NUM}`, "i").exec(t);
  if (range) {
    const a = toNumber(range[1], range[2] ?? range[4], currency);
    const b = toNumber(range[3], range[4], currency);
    if (a && b) return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  // Ceiling: "max 2M", "budget 3 miliar", "under RM600k", "di bawah 1.5 miliar", "≤ 4000".
  const cap = new RegExp(String.raw`(?:max(?:imum)?|maks(?:imal)?|budget|bajet|anggaran|under|below|di bawah|tidak lebih|up to|sekitar|around|≤|<=)\s*(?:of\s*)?(?:rm|rp|idr|myr|usd)?\s*${NUM}`, "i").exec(t);
  if (cap) {
    const v = toNumber(cap[1], cap[2], currency);
    if (v) return { min: null, max: v };
  }
  // A lone amount with a currency marker or a magnitude word.
  const lone = new RegExp(String.raw`(?:rm|rp|idr|myr|usd)\s*${NUM}|${NUM}\s*(?=(?:nego|negotiable|per|/|sebulan|setahun|a month|a year|\b))`, "i").exec(t);
  if (lone) {
    const raw = lone[1] ?? lone[3];
    const unit = lone[2] ?? lone[4];
    if (raw && (unit || /rm|rp|idr|myr|usd/i.test(lone[0]))) {
      const v = toNumber(raw, unit, currency);
      if (v) return { min: null, max: v };
    }
  }
  return { min: null, max: null };
}

/** Month names in the three languages — "in January" is a date, not a place. */
const MONTHS = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "januari", "februari", "maret", "mac", "mei", "juni", "jun", "juli", "julai", "agustus", "ogos", "oktober", "desember", "disember"]);

const TYPES: [RegExp, string, RequirementDraft["property_category"]][] = [
  [/\b(apartemen|apartment|apt|kondominium|condominium|condo|kondo|serviced residence|flat)\b/i, "apartment", "residential"],
  [/\b(rumah|house|landed|terrace|teres|semi-?d|bungalow|banglo|villa|cluster|townhouse)\b/i, "house", "residential"],
  [/\b(studio)\b/i, "studio", "residential"],
  [/\b(ruko|shop ?lot|shophouse|shop)\b/i, "shophouse", "commercial"],
  [/\b(kantor|office|pejabat)\b/i, "office", "commercial"],
  [/\b(gudang|warehouse|kilang|factory|pabrik)\b/i, "warehouse", "industrial"],
  [/\b(tanah|land|kavling|kaveling|lot tanah)\b/i, "land", "land"],
];

export function ruleRequirement(chat: string, hint: { country: string | null; currency: string | null }): RequirementDraft {
  const text = chat.replace(/\s+/g, " ").trim();
  const out: Omit<RequirementDraft, "title" | "missing"> = { ...EMPTY, preferred_areas: [] };

  if (/\b(sewa|disewa|menyewa|rent|rental|lease|kontrak|to let)\b/i.test(text)) out.transaction_type = "rent";
  else if (/\b(beli|membeli|dibeli|buy|purchase|invest|dijual|for sale|own)\b/i.test(text)) out.transaction_type = "buy";

  for (const [re, type, cat] of TYPES) {
    if (re.test(text)) { out.property_type = type; out.property_category = cat; break; }
  }

  const br = /(\d)\s*(?:\+1\s*)?(?:br|bed(?:room)?s?|kamar(?: tidur)?|kt|bilik(?: tidur)?)\b/i.exec(text);
  if (br) out.bedrooms_min = Number(br[1]);
  const ba = /(\d)\s*(?:ba|bath(?:room)?s?|kamar mandi|km|bilik air|toilet)\b/i.exec(text);
  if (ba) out.bathrooms_min = Number(ba[1]);
  const cp = /(\d)\s*(?:car ?parks?|parking|parkir|mobil|petak)\b/i.exec(text);
  if (cp) out.car_parks_min = Number(cp[1]);
  const sqm = /(\d{2,5})\s*(?:m2|m²|sqm|sq ?ft|kaki persegi|meter)/i.exec(text);
  if (sqm) {
    const n = Number(sqm[1]);
    out.min_built_up = /sq ?ft|kaki/i.test(sqm[0]) ? Math.round(n * 0.0929) : n;
  }

  if (/\b(full(?:y)? ?furnished|lengkap|berperabot penuh)\b/i.test(text)) out.furnishing = "fully";
  else if (/\b(semi|partial(?:ly)?|sebahagian|sebagian)\b/i.test(text)) out.furnishing = "partially";
  else if (/\b(unfurnished|kosong|tanpa perabot)\b/i.test(text)) out.furnishing = "unfurnished";

  const budget = parseBudget(text, hint.currency);
  if (out.transaction_type === "rent") out.max_monthly_rent = budget.max;
  else { out.budget_min = budget.min; out.budget_max = budget.max; }

  // Places: capitalised words after a location preposition, up to a comma or stop.
  const places = [...text.matchAll(/\b(?:di|at|in|area|kawasan|daerah|sekitar|near|dekat|around)\s+([A-Z][\p{L}.'-]+(?:\s+[A-Z][\p{L}.'-]+){0,2})/gu)]
    .map((m) => m[1].trim())
    .filter((p) => !MONTHS.has(p.split(" ")[0].toLowerCase()))
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .slice(0, 4);
  out.preferred_areas = places;
  if (places[0]) out.city = places[0];

  // The title speaks the chat's language, not the agent's country's.
  const english = /\b(rent|rental|lease|buy|purchase|looking|bedroom|condo|house)\b/i.test(text);
  const parts = [
    out.bedrooms_min ? `${out.bedrooms_min}BR` : null,
    out.property_type,
    out.transaction_type === "rent" ? (english ? "to rent" : "disewa") : out.transaction_type === "buy" ? (english ? "to buy" : "dibeli") : null,
    places[0] ?? null,
  ].filter(Boolean);
  const title = parts.length ? parts.join(" · ") : text.slice(0, 80);

  const missing: string[] = [];
  if (!out.transaction_type) missing.push("transaction_type");
  if (!out.property_type) missing.push("property_type");
  if (!out.city && !out.preferred_areas.length) missing.push("location");
  if (out.transaction_type === "rent" ? !out.max_monthly_rent : !out.budget_max) missing.push("budget");
  if (out.property_category !== "land" && out.property_category !== "commercial" && !out.bedrooms_min) missing.push("bedrooms");

  return { ...out, title: title.slice(0, 80), missing };
}
