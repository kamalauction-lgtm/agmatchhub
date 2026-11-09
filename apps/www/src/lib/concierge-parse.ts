/**
 * Rule-based request parser for the Smart Property Concierge.
 *
 * Pure and deterministic: a sentence in Indonesian, Malay or English goes in,
 * a set of search criteria comes out, together with the words the rules could
 * not place. No model is consulted. This is deliberately the whole "AI" of the
 * pilot and the UI says so (§ rule-based disclosure); it also fixes the
 * contract a model-powered parser would have to satisfy later — see
 * `ConciergeParser` in concierge.ts.
 *
 * What it understands:
 *   intent       beli/buy/dijual → sale · sewa/rent/kontrak → rent
 *   rooms        "3 kamar", "3-bedroom", "3BR", "3KT", "tiga kamar", "2 bilik"
 *   bathrooms    "2 kamar mandi", "2 bathrooms", "2 bilik air"
 *   type         rumah/house, apartemen/apartment/condo, ruko/shophouse, tanah/land,
 *                villa, kost, gudang/warehouse, kantor/office, townhouse, cluster
 *   budget       "di bawah Rp2 miliar", "under 2 billion", "max 500 juta",
 *                "di atas 1 M", "antara 1 dan 3 miliar", "1–3 miliar"
 *   location     any regency or province name in the caller-supplied list,
 *                plus a few common aliases (jaksel, jakbar, bali, …)
 */

export type ParsedRequest = {
  type?: "sale" | "rent";
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  /** Display name of the place as written in the catalogue. */
  place?: string;
  /** Words the rules could not interpret, for honest feedback. */
  unrecognised: string[];
};

export type KnownPlace = { name: string; aliases?: string[] };

const NUMBER_WORDS: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
};

const TYPE_WORDS: Array<[RegExp, string]> = [
  [/\b(rumah|house|houses|home|homes|landed)\b/i, "rumah"],
  [/\b(apartemen|apartment|apartments|apt|condo|condominium|kondominium|unit)\b/i, "apartemen"],
  [/\b(ruko|shophouse|shop house|shoplot|shop lot)\b/i, "ruko"],
  [/\b(tanah|land|kavling|kaveling|plot)\b/i, "tanah"],
  [/\b(villa|vila)\b/i, "villa"],
  [/\b(kost|kos|kos-kosan|boarding house|boarding)\b/i, "kost"],
  [/\b(gudang|warehouse)\b/i, "gudang"],
  [/\b(kantor|office|office space|pejabat)\b/i, "kantor"],
  [/\b(townhouse|town house)\b/i, "townhouse"],
  [/\b(cluster|klaster)\b/i, "cluster_home"],
];

const MAX_WORDS = /((?:bajet|budget|anggaran|harga|price)?\s*(?:di\s*bawah|dibawah|bawah|kurang\s+dari|maksimal|maksimum|maks|max|under|below|less\s+than|up\s+to|sampai|hingga|tidak\s+lebih\s+dari|≤|<=|<)|bajet|budget|anggaran)\s*$/i;
const MIN_WORDS = /(di\s*atas|diatas|lebih\s+dari|minimal|minimum|min|above|over|more\s+than|mulai\s+dari|mulai|from|starting|≥|>=|>)\s*$/i;

/** Scale words → multiplier, per currency. "M" is miliar in rupiah, million in ringgit. */
function scaleFor(unit: string, currency: string): number {
  const u = unit.toLowerCase();
  if (/^(miliar|milyar|billion|bn|b)$/.test(u)) return 1e9;
  if (u === "m") return currency === "IDR" ? 1e9 : 1e6;
  if (/^(juta|jt|million|mn|mio|mil)$/.test(u)) return 1e6;
  if (/^(ribu|rb|k|thousand)$/.test(u)) return 1e3;
  return 1;
}

function toNumber(raw: string): number {
  // "2,5" (id) and "2.5" (en) both mean two and a half when a scale word
  // follows; "2.000.000.000" is a grouped integer.
  const grouped = /^\d{1,3}([.,]\d{3})+$/.test(raw);
  if (grouped) return Number(raw.replace(/[.,]/g, ""));
  return Number(raw.replace(",", "."));
}

const AMOUNT = /(?:rp\.?|idr|rm|myr)?\s*(\d+(?:[.,]\d+)*)\s*(miliar|milyar|billion|bn|juta|jt|million|mn|mio|mil|ribu|rb|thousand|[mbk])?\b/gi;

export function parseRequest(
  input: string,
  places: KnownPlace[],
  currency = "IDR"
): ParsedRequest {
  const text = ` ${input.replace(/\s+/g, " ").trim()} `;
  let rest = text.toLowerCase();
  const out: ParsedRequest = { unrecognised: [] };

  const consume = (re: RegExp) => {
    rest = rest.replace(re, " ");
  };

  // --- intent --------------------------------------------------------------
  if (/\b(sewa|disewa|disewakan|menyewa|kontrak|rent|rental|renting|for rent|lease)\b/i.test(rest)) {
    out.type = "rent";
    consume(/\b(untuk\s+)?(di\s*sewa|disewakan|menyewa|sewa|kontrak|for rent|rent(al|ing)?|lease)\b/gi);
  } else if (/\b(beli|membeli|dijual|jual|buy|buying|purchase|for sale|own)\b/i.test(rest)) {
    out.type = "sale";
    consume(/\b(untuk\s+)?(mem?beli|dijual|jual|for sale|buy(ing)?|purchase|own)\b/gi);
  }

  // --- rooms (before type: "kamar" would otherwise never be seen) ----------
  const bedRe = /\b(\d+|satu|dua|tiga|empat|lima|enam|one|two|three|four|five|six)\s*(?:-|\s)?\s*(kamar tidur|kamar|bedrooms?|beds?|br|kt|bilik tidur|bilik)\b(?!\s*mandi)(?!\s*air)/i;
  const bed = rest.match(bedRe);
  if (bed) {
    out.bedrooms = NUMBER_WORDS[bed[1]] ?? Number(bed[1]);
    consume(bedRe);
  }
  const bathRe = /\b(\d+|satu|dua|tiga|empat|lima|one|two|three|four|five)\s*(?:-|\s)?\s*(kamar mandi|bathrooms?|baths?|km|bilik air|toilet)\b/i;
  const bath = rest.match(bathRe);
  if (bath) {
    out.bathrooms = NUMBER_WORDS[bath[1]] ?? Number(bath[1]);
    consume(bathRe);
  }

  // --- property type -------------------------------------------------------
  for (const [re, type] of TYPE_WORDS) {
    if (re.test(rest)) {
      out.propertyType = type;
      consume(new RegExp(re.source, "gi"));
      break;
    }
  }

  // --- budget ---------------------------------------------------------------
  // A range first: "antara 1 dan 3 miliar", "1-3 miliar", "between 1 and 2 bn".
  const range = rest.match(
    /(\d+(?:[.,]\d+)?)\s*(miliar|milyar|billion|bn|juta|jt|million|mn|[mbk])?\s*(?:-|–|sampai|hingga|s\/d|to|and|dan)\s*(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(miliar|milyar|billion|bn|juta|jt|million|mn|[mbk])\b/i
  );
  if (range) {
    const hiScale = scaleFor(range[4], currency);
    const loScale = range[2] ? scaleFor(range[2], currency) : hiScale;
    out.minPrice = toNumber(range[1]) * loScale;
    out.maxPrice = toNumber(range[3]) * hiScale;
    consume(new RegExp(range[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    consume(/\b(antara|between|dengan harga|harga|price|priced|seharga)\b/gi);
  } else {
    let m: RegExpExecArray | null;
    AMOUNT.lastIndex = 0;
    while ((m = AMOUNT.exec(rest))) {
      const value = toNumber(m[1]);
      const unit = m[2];
      // A bare small number with no scale word is a room count or noise, not a price.
      if (!unit && value < 1_000_000) continue;
      const amount = value * (unit ? scaleFor(unit, currency) : 1);
      const before = rest.slice(Math.max(0, m.index - 28), m.index);
      if (MIN_WORDS.test(before)) out.minPrice = amount;
      else out.maxPrice = amount; // "Rp2 miliar" alone reads as a ceiling
      const start = before.search(MIN_WORDS.test(before) ? MIN_WORDS : MAX_WORDS);
      const from = start >= 0 ? Math.max(0, m.index - 28) + start : m.index;
      rest = rest.slice(0, from) + " " + rest.slice(m.index + m[0].length);
      AMOUNT.lastIndex = 0;
    }
  }

  // --- location -------------------------------------------------------------
  const norm = (s: string) => s.toLowerCase().replace(/^(kota|kab\.?|kabupaten)\s+/, "").trim();
  const candidates = places
    .flatMap((p) => [p.name, ...(p.aliases ?? [])].map((a) => ({ alias: norm(a), name: p.name })))
    .filter((c) => c.alias.length >= 3)
    .sort((a, b) => b.alias.length - a.alias.length); // longest first: "jakarta selatan" before "jakarta"
  for (const c of candidates) {
    const re = new RegExp(`(?<![a-z])${c.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "i");
    if (re.test(rest)) {
      out.place = c.name;
      consume(new RegExp(re.source, "gi"));
      consume(/\b(di|dekat|daerah|area|kawasan|wilayah|sekitar|in|near|around|at|kota|kab\.?)\b/gi);
      break;
    }
  }

  // --- what is left -----------------------------------------------------------
  const STOP = new Set([
    "saya", "aku", "ingin", "mau", "cari", "mencari", "butuh", "perlu", "sedang", "yang", "dengan", "untuk",
    "dan", "atau", "di", "ke", "ada", "tolong", "mohon", "bisa", "harga", "sekitar", "kira-kira", "properti",
    "i", "i'm", "im", "want", "wanted", "need", "looking", "look", "for", "a", "an", "the", "with", "and", "or",
    "please", "find", "me", "some", "property", "properties", "in", "to", "of", "my", "is", "are", "that",
    "saya", "nak", "hendak", "sebuah", "satu", "unit", "rp", "idr", "rm", "sila", "tolong", "rumah2",
  ]);
  out.unrecognised = rest
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));

  return out;
}
