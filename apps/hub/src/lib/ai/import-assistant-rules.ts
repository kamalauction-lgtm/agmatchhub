/**
 * Import Assistant (screen 12): the contract, without a provider. Pure — no
 * imports, used by the unit tests and, once a provider is approved, by the
 * engine call. The assistant only SUGGESTS overrides for an import item; a
 * person applies them through the normal edit path.
 *
 *   input       buildAssistantInput(): the listing fields only, with phone
 *               numbers, emails and person names removed from free text;
 *   output      parseAssistantOutput(): a model's JSON is accepted field by
 *               field — property types must be in the agent's market, sale or
 *               rent only, numbers in sensible ranges, each with the quote it
 *               came from; anything else is dropped, never guessed;
 *   rules       ruleSuggestions(): deterministic suggestions from the text, so
 *               the feature works (as "rules") with no provider at all;
 *   permission  canUseImportAssistant(): the batch's own agent, or an admin with
 *               listing.import_assisted on an assisted batch the agent does not
 *               yet control.
 */

export type Market = "ID" | "MY";
export type Suggestion = { field: "propertyType" | "listingType" | "bedrooms" | "bathrooms" | "buildingSize" | "landSize"; value: string | number; quote: string };

const TYPES: Record<Market, Set<string>> = {
  ID: new Set(["rumah", "apartemen", "kondominium", "villa", "kost", "tanah", "kavling", "ruko", "rukan", "kantor", "toko", "hotel", "gudang", "pabrik", "lainnya"]),
  MY: new Set(["terrace", "semi_detached", "bungalow", "townhouse", "cluster_home", "condominium", "serviced_residence", "apartment", "flat", "soho", "penthouse", "residential_land", "agricultural_land", "shoplot", "shop_office", "retail_space", "office_space", "factory", "warehouse", "commercial_land", "lainnya"]),
};
const RANGE: Record<string, [number, number]> = { bedrooms: [0, 50], bathrooms: [0, 50], buildingSize: [1, 1_000_000], landSize: [1, 10_000_000] };

// Lead-in words match in any case; the name after them must be capitalised.
const ci = (w: string) => w.split("").map((c) => `[${c}${c.toUpperCase()}]`).join("");
const VERBS = ["hubungi", "contact", "call", "wa", "whatsapp"].map(ci).join("|");
const TITLES = ["pak", "bu", "ibu", "bapak", "mr", "mrs", "ms", "encik", "puan"].map(ci).join("|");
const NAME_AFTER_LEAD = new RegExp(
  `\\b((?:${VERBS}|${TITLES})\\.?(?:\\s+(?:${TITLES})\\.?)*)\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}`, "g");

/** Removes contact details and the most common person-name lead-ins from free text. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    // A contact verb and/or honorific (possibly chained, e.g. "Hubungi Pak"),
    // then a name of up to three capitalised words.
    .replace(NAME_AFTER_LEAD, (_m, lead: string) => `${lead.split(/\s+/)[0]} [name]`);
}

export function buildAssistantInput(item: { extracted?: Record<string, unknown> | null; overrides?: Record<string, unknown> | null }, market: Market) {
  const src = { ...(item.extracted ?? {}), ...(item.overrides ?? {}) } as Record<string, unknown>;
  const text = (k: string) => (typeof src[k] === "string" ? redact(String(src[k])).slice(0, 4000) : null);
  return {
    market,
    allowedPropertyTypes: [...TYPES[market]],
    title: text("title"),
    description: text("description"),
    known: Object.fromEntries(["propertyType", "listingType", "bedrooms", "bathrooms", "buildingSize", "landSize", "price"]
      .filter((k) => src[k] !== undefined && src[k] !== null && src[k] !== "").map((k) => [k, src[k]])),
  };
}

export function parseAssistantOutput(raw: unknown, market: Market): Suggestion[] {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return []; } }
  const list = Array.isArray((v as { suggestions?: unknown })?.suggestions) ? (v as { suggestions: unknown[] }).suggestions : [];
  const out: Suggestion[] = [];
  for (const s of list) {
    const r = s as { field?: unknown; value?: unknown; quote?: unknown };
    if (typeof r.quote !== "string" || !r.quote.trim() || r.quote.length > 200) continue;
    const quote = redact(r.quote.trim());
    if (r.field === "propertyType" && typeof r.value === "string" && TYPES[market].has(r.value)) out.push({ field: "propertyType", value: r.value, quote });
    else if (r.field === "listingType" && (r.value === "sale" || r.value === "rent")) out.push({ field: "listingType", value: r.value, quote });
    else if (typeof r.field === "string" && r.field in RANGE && typeof r.value === "number" && Number.isFinite(r.value)) {
      const [lo, hi] = RANGE[r.field];
      if (r.value >= lo && r.value <= hi) out.push({ field: r.field as Suggestion["field"], value: Math.round(r.value * 100) / 100, quote });
    }
  }
  // One suggestion per field: the first valid one wins.
  return out.filter((s, i) => out.findIndex((x) => x.field === s.field) === i);
}

const TYPE_WORDS: Record<Market, [RegExp, string][]> = {
  ID: [[/\bruko\b/i, "ruko"], [/\bapartemen\b/i, "apartemen"], [/\bvilla\b/i, "villa"], [/\bkost\b/i, "kost"], [/\btanah\b/i, "tanah"], [/\brumah\b/i, "rumah"]],
  MY: [[/\bsemi[- ]?d(etached)?\b/i, "semi_detached"], [/\bbungalow\b/i, "bungalow"], [/\bcondo(minium)?\b/i, "condominium"], [/\bservice[d]? residence\b/i, "serviced_residence"], [/\bshop ?lot\b/i, "shoplot"], [/\bterrace\b|\bteres\b/i, "terrace"], [/\bapartment\b/i, "apartment"]],
};

export function ruleSuggestions(item: { extracted?: Record<string, unknown> | null; overrides?: Record<string, unknown> | null }, market: Market): Suggestion[] {
  const input = buildAssistantInput(item, market);
  const text = `${input.title ?? ""}\n${input.description ?? ""}`;
  const out: Suggestion[] = [];
  const quoteOf = (m: RegExpMatchArray) => text.slice(Math.max(0, (m.index ?? 0) - 20), (m.index ?? 0) + m[0].length + 20).trim();
  if (!input.known.propertyType) for (const [re, type] of TYPE_WORDS[market]) { const m = text.match(re); if (m) { out.push({ field: "propertyType", value: type, quote: quoteOf(m) }); break; } }
  if (!input.known.listingType) {
    const sale = text.match(/\b(dijual|jual|for sale|untuk dijual)\b/i), rent = text.match(/\b(disewa|disewakan|sewa|for rent|untuk disewa)\b/i);
    if (sale && !rent) out.push({ field: "listingType", value: "sale", quote: quoteOf(sale) });
    else if (rent && !sale) out.push({ field: "listingType", value: "rent", quote: quoteOf(rent) });
  }
  if (input.known.bedrooms === undefined) { const m = text.match(/(\d{1,2})\s*(kt|kamar tidur|bilik( tidur)?|bedrooms?|br|bed)\b/i); if (m) out.push({ field: "bedrooms", value: Number(m[1]), quote: quoteOf(m) }); }
  if (input.known.bathrooms === undefined) { const m = text.match(/(\d{1,2})\s*(km|kamar mandi|bilik air|bathrooms?|ba|bath)\b/i); if (m) out.push({ field: "bathrooms", value: Number(m[1]), quote: quoteOf(m) }); }
  return parseAssistantOutput({ suggestions: out }, market);
}

export function canUseImportAssistant(ctx: {
  userId: string;
  batchAgentId: string;
  batchIsAssisted: boolean;
  agentInControl: boolean;
  adminCanImportFor: boolean;
}): boolean {
  if (ctx.userId === ctx.batchAgentId) return true;                 // the agent, on their own batch
  return ctx.batchIsAssisted && ctx.adminCanImportFor && !ctx.agentInControl; // the team, while preparing
}
