import "server-only";
import { safeFetch, sanitiseText, UnsafeUrlError } from "./safe-fetch";

/**
 * Portal adapters.
 *
 * Every adapter reads PUBLIC, STRUCTURED data — JSON-LD first, then OpenGraph,
 * then a small amount of permitted HTML. None of them logs in, solves a
 * CAPTCHA, rotates a user agent, or works around rate limiting. Where a portal
 * blocks automated access the honest answer is to say so and offer the agent
 * Excel or individual links, which is what `AutomaticImportUnavailable` is for.
 *
 * Why structured data rather than scraping markup: schema.org is a contract the
 * site publishes deliberately, it survives redesigns, and it is what search
 * engines are invited to read. Parsing a portal's CSS classes is both fragile
 * and a clearer overreach.
 *
 * NOTHING IS INVENTED. A field the source does not state stays undefined and
 * the agent fills it in on the review screen.
 */

export type ImportedListingDraft = {
  sourceUrl: string;
  sourceExternalId?: string;
  title?: string;
  description?: string;
  listingType?: "sale" | "rent";
  propertyType?: string;
  price?: number;
  currency?: string;
  province?: string;
  city?: string;
  district?: string;
  addressText?: string;
  developmentName?: string;
  landSize?: number;
  buildingSize?: number;
  bedrooms?: number;
  bathrooms?: number;
  imageUrls?: string[];
  /** Anything read but not mapped, kept so nothing is silently dropped. */
  raw?: Record<string, unknown>;
};

export type DiscoveredListing = { url: string; title?: string; thumbnail?: string };

export interface PortalImportAdapter {
  source: string;
  label: string;
  canHandle(url: URL): boolean;
  /** Optional: not every portal exposes a crawlable public profile. */
  discoverProfileListings?(profileUrl: URL): Promise<DiscoveredListing[]>;
  extractListing(listingUrl: URL): Promise<ImportedListingDraft>;
}

export class AutomaticImportUnavailable extends Error {
  constructor(
    public readonly portal: string,
    public readonly why: string,
    /** Which message the agent sees. Distinguishes "blocked" from "empty". */
    public readonly code: "blocked_by_site" | "no_listing_data" | "unavailable" = "unavailable",
  ) {
    super(`Automatic import unavailable for ${portal}: ${why}`);
    this.name = "AutomaticImportUnavailable";
  }
}

/**
 * An anti-bot interstitial rather than a page.
 *
 * Usually arrives as 403 and is caught in `safeFetch`, but some sites serve
 * one with a 200, so the body is checked too. The response to a challenge is
 * to stop and tell the agent — never to imitate a browser to get past it.
 */
const CHALLENGE_MARKERS = [
  "_cf_chl_opt", "cf_chl", "challenge-platform", "cf-browser-verification",
  "Enable JavaScript and cookies to continue", "Checking your browser before accessing",
  "Attention Required! | Cloudflare", "px-captcha", "distil_r_captcha",
  "/_Incapsula_Resource", "captcha-delivery.com",
];

function looksLikeChallenge(html: string): boolean {
  const head = html.slice(0, 20_000);
  return CHALLENGE_MARKERS.some((m) => head.includes(m));
}

/**
 * Does the draft describe a property, or is it the shape of one?
 *
 * A title alone is not evidence — a challenge page, a 404 and a consent wall
 * all have titles. Requiring a price, or two independent property facts,
 * is what separates a listing from a page that merely loaded.
 */
function hasListingSubstance(draft: ImportedListingDraft): boolean {
  if (draft.price !== undefined) return true;
  const facts = [
    draft.propertyType, draft.bedrooms, draft.bathrooms,
    draft.buildingSize, draft.landSize, draft.city, draft.addressText,
  ].filter((v) => v !== undefined && v !== null && v !== "");
  return facts.length >= 2;
}

/* -------------------------------------------------------------------------- */
/* Structured-data readers, shared by every adapter                            */
/* -------------------------------------------------------------------------- */

/**
 * Every JSON-LD node on the page, including nested ones.
 *
 * Flattening `@graph` is not enough, and assuming it was cost a real import:
 * Rumah123 publishes a `WebPage`/`RealEstateListing` node carrying only the
 * title and description, and hangs the actual property — price, bedrooms,
 * floor size, address — off it as `mainEntity`. Reading only the top level
 * produced a listing with a title and nothing else.
 *
 * So this walks into the properties that schema.org uses to nest one entity
 * inside another, bounded by depth so a self-referential document cannot spin.
 */
const NESTED_KEYS = [
  "@graph", "mainEntity", "mainEntityOfPage", "about", "item",
  "itemOffered", "subjectOf", "itemListElement",
] as const;

function collectNodes(
  value: unknown,
  out: Record<string, unknown>[] = [],
  depth = 0,
): Record<string, unknown>[] {
  if (depth > 6 || value === null || typeof value !== "object") return out;

  if (Array.isArray(value)) {
    for (const v of value) collectNodes(v, out, depth + 1);
    return out;
  }

  const node = value as Record<string, unknown>;
  if (node["@type"]) out.push(node);
  for (const key of NESTED_KEYS) {
    if (node[key] !== undefined) collectNodes(node[key], out, depth + 1);
  }
  return out;
}

/** Every JSON-LD block on the page, flattened. */
function jsonLdBlocks(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      collectNodes(JSON.parse(m[1].trim()), out);
    } catch {
      // A malformed block is not a reason to abandon the page.
    }
  }
  return out;
}

function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map((x) => String(x).toLowerCase());
}

/**
 * How much this node is likely to BE the property.
 *
 * Applied as a sort, so the most specific node fills each field first and the
 * generic page wrapper only fills what is still empty. That is what stops the
 * page title — "… | Rumah123", site suffix and all — from beating the
 * property's own clean name.
 */
function specificity(node: Record<string, unknown>): number {
  const types = typesOf(node);
  let score = 0;
  if (node.offers !== undefined || node.price !== undefined) score += 4;
  if (node.floorSize !== undefined || node.numberOfBedrooms !== undefined) score += 3;
  if (types.some((t) => /residence|apartment|house|product|realestatelisting/.test(t))) score += 2;
  if (types.includes("webpage")) score -= 2;
  return score;
}

/**
 * Is this node the property, or somebody attached to it?
 *
 * `RealEstateAgent` contains the string "realestate", so a naive type filter
 * accepted the listing agent's node — and imported their profile photo as a
 * property photograph. People and companies are never the property.
 */
function isPropertyNode(node: Record<string, unknown>): boolean {
  const types = typesOf(node);
  if (types.some((t) => /^(person|organization|realestateagent|imageobject|breadcrumblist|listitem|postaladdress)$/.test(t))) {
    return false;
  }
  return types.some((t) =>
    /realestatelisting|residence|apartment|house|product|offer|place|accommodation/.test(t));
}

function meta(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return sanitiseText(m[1], 500) ?? undefined;
  }
  return undefined;
}

/** A number from messy text. Returns undefined rather than a guess. */
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return undefined;
  const cleaned = v.replace(/[^\d.,]/g, "");
  if (!cleaned) return undefined;
  // Same separator problem as the Excel import: a trailing group of exactly
  // three digits is a thousands mark, one or two is a decimal.
  let s = cleaned;
  if (/[.,]\d{3}(?:[.,]\d{3})*$/.test(s)) s = s.replace(/[.,]/g, "");
  else s = s.replace(/(\d)[.,](\d{1,2})$/, "$1.$2").replace(/[.,](?=\d{3})/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Map schema.org and OpenGraph onto our draft.
 *
 * Portals publish RealEstateListing, Product, Residence, Place or Offer — this
 * takes whichever is present and reads only the fields it recognises.
 */
/** schema.org's own classification of the building. The portal's word, not ours. */
const TYPE_FROM_SCHEMA: Record<string, string> = {
  singlefamilyresidence: "rumah",
  house: "rumah",
  apartment: "apartemen",
  apartmentcomplex: "apartemen",
  condominium: "kondominium",
  suite: "apartemen",
  hotel: "hotel",
  hotelroom: "hotel",
  office: "kantor",
  store: "toko",
  warehouse: "gudang",
  landform: "tanah",
};

/** Labelled name/value pairs, which is where portals put the local specifics. */
const ADDITIONAL_PROPERTY_MAP: { match: RegExp; field: keyof ImportedListingDraft }[] = [
  { match: /^(luas tanah|land size|lot size|land area)$/i, field: "landSize" },
  { match: /^(luas bangunan|building size|floor area|built up)$/i, field: "buildingSize" },
  { match: /^(kamar tidur|bedrooms?|jumlah kamar tidur)$/i, field: "bedrooms" },
  { match: /^(kamar mandi|bathrooms?|jumlah kamar mandi)$/i, field: "bathrooms" },
];

function pushImage(draft: ImportedListingDraft, value: unknown): void {
  if (typeof value === "string") {
    (draft.imageUrls ??= []).push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) pushImage(draft, v);
    return;
  }
  if (value && typeof value === "object") {
    // ImageObject. `contentUrl` is what Rumah123 uses; reading only `url`
    // missed every real photograph on the page.
    const o = value as { url?: unknown; contentUrl?: unknown };
    const url = typeof o.contentUrl === "string" ? o.contentUrl
      : typeof o.url === "string" ? o.url : undefined;
    if (url) (draft.imageUrls ??= []).push(url);
  }
}

/**
 * Drop images that are not photographs of the property.
 *
 * Portals generate share cards — the same photo with the price and a discount
 * badge burned across it. Importing one as the listing photo would put another
 * company's pricing graphic on our marketplace.
 */
export function isPropertyPhoto(url: string): boolean {
  return !/\/(image\/og|og\/ldp|share|watermark|logo|avatar)\b/i.test(url);
}

/**
 * Remove a site-name suffix from a page title.
 *
 * Only when it actually names the site being read — "… | Rumah123" on
 * rumah123.com. A blanket rule would eat real titles that happen to contain a
 * dash.
 */
function stripSiteSuffix(title: string, finalUrl: string): string {
  let host: string;
  try { host = new URL(finalUrl).hostname.toLowerCase(); } catch { return title; }
  const brand = host.replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9]/g, "");
  if (brand.length < 3) return title;

  const m = title.match(/^(.*?)\s*[|–—-]\s*([^|–—-]{2,40})$/);
  if (!m) return title;
  const tail = m[2].toLowerCase().replace(/[^a-z0-9]/g, "");
  return tail === brand || tail.includes(brand) ? m[1].trim() : title;
}

function draftFromStructuredData(html: string, finalUrl: string): ImportedListingDraft {
  const draft: ImportedListingDraft = { sourceUrl: finalUrl };
  const raw: Record<string, unknown> = {};

  // Most specific node first, so the property beats the page wrapper on every
  // field. `??=` below then means "unless something better already said so".
  const blocks = jsonLdBlocks(html)
    .filter(isPropertyNode)
    .sort((a, b) => specificity(b) - specificity(a));

  for (const b of blocks) {
    draft.title ??= sanitiseText(b.name as string, 140) ?? undefined;
    draft.description ??= sanitiseText(b.description as string, 4000) ?? undefined;
    draft.sourceExternalId ??= typeof b.sku === "string" ? b.sku
      : typeof b.productID === "string" ? b.productID : undefined;

    const offers = (Array.isArray(b.offers) ? b.offers[0] : b.offers) as Record<string, unknown> | undefined;
    if (offers) {
      draft.price ??= num(offers.price ?? (offers.priceSpecification as Record<string, unknown>)?.price);
      const cur = offers.priceCurrency;
      if (typeof cur === "string") draft.currency ??= cur.toUpperCase();
      // goodrelations businessFunction states sale vs lease outright. This is
      // the portal saying it, which beats guessing from words in the title.
      const fn = String(offers.businessFunction ?? "").toLowerCase();
      if (/leaseout|lease/.test(fn)) draft.listingType ??= "rent";
      else if (/sell/.test(fn)) draft.listingType ??= "sale";
      raw.offer = offers;
    }

    const address = (Array.isArray(b.address) ? b.address[0] : b.address) as Record<string, unknown> | undefined;
    if (address) {
      draft.province ??= sanitiseText(address.addressRegion as string, 120) ?? undefined;
      draft.city ??= sanitiseText(address.addressLocality as string, 120) ?? undefined;
      draft.addressText ??= sanitiseText(address.streetAddress as string, 400) ?? undefined;
      raw.address = address;
    }

    draft.bedrooms ??= num(b.numberOfBedrooms ?? b.numberOfRooms);
    draft.bathrooms ??= num(b.numberOfBathroomsTotal ?? b.numberOfBathrooms ?? b.numberOfFullBathrooms);

    const size = (Array.isArray(b.floorSize) ? b.floorSize[0] : b.floorSize) as Record<string, unknown> | undefined;
    if (size) draft.buildingSize ??= num(size.value ?? size.minValue);
    const lot = (Array.isArray(b.lotSize) ? b.lotSize[0] : b.lotSize) as Record<string, unknown> | undefined;
    if (lot) draft.landSize ??= num(lot.value ?? lot.minValue);

    for (const t of typesOf(b)) {
      if (TYPE_FROM_SCHEMA[t]) { draft.propertyType ??= TYPE_FROM_SCHEMA[t]; break; }
    }

    const extras = b.additionalProperty;
    if (Array.isArray(extras)) {
      for (const e of extras as Record<string, unknown>[]) {
        const name = String(e?.name ?? "").trim();
        const hit = ADDITIONAL_PROPERTY_MAP.find((r) => r.match.test(name));
        const value = num(e?.value);
        if (hit && value !== undefined && draft[hit.field] === undefined) {
          (draft as Record<string, unknown>)[hit.field] = value;
        }
      }
    }

    if (b.geo && typeof b.geo === "object") raw.geo = b.geo;
    pushImage(draft, b.image ?? b.photo);
  }

  // OpenGraph fills the gaps JSON-LD left.
  draft.title ??= meta(html, "og:title");
  draft.description ??= meta(html, "og:description");
  const ogImage = meta(html, "og:image");
  if (ogImage) pushImage(draft, ogImage);

  if (!draft.title) {
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    draft.title = sanitiseText(t?.[1], 140) ?? undefined;
  }
  if (draft.title) draft.title = stripSiteSuffix(draft.title, finalUrl) || draft.title;

  // Sale vs rent, from words the page itself uses — only if the structured
  // data did not already say. Guessing it wrong is a serious error.
  if (!draft.listingType) {
    const haystack = `${draft.title ?? ""} ${finalUrl}`.toLowerCase();
    if (/\bdisewa|sewa|for-rent|rent\b/.test(haystack)) draft.listingType = "rent";
    else if (/\bdijual|jual|for-sale|sale\b/.test(haystack)) draft.listingType = "sale";
  }

  if (draft.imageUrls) {
    draft.imageUrls = [...new Set(draft.imageUrls)].filter(isPropertyPhoto).slice(0, 12);
    if (!draft.imageUrls.length) delete draft.imageUrls;
  }
  if (Object.keys(raw).length) draft.raw = raw;
  return draft;
}

/* -------------------------------------------------------------------------- */
/* Adapters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The default. Every Indonesian portal in scope publishes schema.org for SEO,
 * so one careful structured-data reader handles all of them — and keeps
 * working when they redesign, which a per-portal HTML scraper would not.
 *
 * A portal gets its own subclass only when it needs something this cannot do.
 */
class StructuredDataAdapter implements PortalImportAdapter {
  constructor(
    public readonly source: string,
    public readonly label: string,
    private readonly hostPattern: RegExp,
    private readonly idFromUrl?: RegExp,
  ) {}

  canHandle(url: URL) { return this.hostPattern.test(url.hostname); }

  async extractListing(listingUrl: URL): Promise<ImportedListingDraft> {
    const res = await safeFetch(listingUrl.toString());
    if (looksLikeChallenge(res.body)) {
      throw new AutomaticImportUnavailable(
        this.source, "the site is serving an automated-access challenge", "blocked_by_site");
    }
    const draft = draftFromStructuredData(res.body, res.url);
    if (this.idFromUrl) {
      const m = res.url.match(this.idFromUrl);
      // `??=` — a `sku` in the structured data is the portal's own id and
      // beats one scraped out of the URL slug.
      if (m?.[1]) draft.sourceExternalId ??= m[1];
    }
    // A husk — a page that loaded but says nothing about a property — is
    // reported, not imported.
    if (!hasListingSubstance(draft)) {
      throw new AutomaticImportUnavailable(
        this.source, "no listing data found on the page", "no_listing_data");
    }
    return draft;
  }

  /**
   * Profile discovery from public listing links on the page.
   *
   * Deliberately conservative: it reads anchors already present in the HTML the
   * server returned. It does not paginate, execute JavaScript, or hit an
   * internal API. Portals that render results client-side will legitimately
   * yield nothing, and the UI says so rather than pretending.
   */
  async discoverProfileListings(profileUrl: URL): Promise<DiscoveredListing[]> {
    const res = await safeFetch(profileUrl.toString());
    if (looksLikeChallenge(res.body)) {
      throw new AutomaticImportUnavailable(
        this.source, "the site is serving an automated-access challenge", "blocked_by_site");
    }
    const found = new Map<string, DiscoveredListing>();

    for (const m of res.body.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi)) {
      let abs: URL;
      try { abs = new URL(m[1], res.url); } catch { continue; }
      if (abs.hostname !== profileUrl.hostname) continue;
      if (abs.toString() === profileUrl.toString()) continue;
      // A listing URL on these portals carries a numeric id somewhere.
      if (!/\/\d{4,}|\bhos\d+|\bprop\w*[-/]\d+/i.test(abs.pathname)) continue;
      if (/\/(agen|agent|profil|profile|search|cari|login|register)\b/i.test(abs.pathname)) continue;
      found.set(abs.toString(), { url: abs.toString() });
    }

    if (!found.size) {
      throw new AutomaticImportUnavailable(
        this.source,
        "no public listing links were found on that page"
      );
    }
    return [...found.values()].slice(0, 200);
  }
}

export const ADAPTERS: PortalImportAdapter[] = [
  // Rumah123 ids look like `hos18516197`, glued to the slug by a hyphen — the
  // earlier `/(\d{5,})` needed a slash in front and so never matched one.
  new StructuredDataAdapter("rumah123", "Rumah123", /(^|\.)rumah123\.com$/i, /\b((?:hos|apt|lnd|rum)\d{5,})/i),
  new StructuredDataAdapter("99co", "99.co Indonesia", /(^|\.)99\.co$/i, /[-/](\d{5,})/),
  new StructuredDataAdapter("pinhome", "Pinhome", /(^|\.)pinhome\.id$/i, /[-/](\d{5,})/),
  new StructuredDataAdapter("lamudi", "Lamudi", /(^|\.)lamudi\.co\.id$/i, /[-/](\d{5,})/),
  new StructuredDataAdapter("olx", "OLX Properti", /(^|\.)olx\.co\.id$/i, /iid-(\d+)/),
  new StructuredDataAdapter("brighton", "Brighton", /(^|\.)brighton\.co\.id$/i, /\/(\d{4,})/),
  new StructuredDataAdapter("dotproperty", "Dot Property", /(^|\.)dotproperty\.id$/i, /\/(\d{5,})/),
];

/** Anything else. Same structured-data reading, no portal-specific knowledge. */
const GENERIC = new StructuredDataAdapter("other", "Other website", /.*/);

export function adapterFor(url: URL): PortalImportAdapter {
  return ADAPTERS.find((a) => a.canHandle(url)) ?? GENERIC;
}

export function portalChoices() {
  return [...ADAPTERS.map((a) => ({ value: a.source, label: a.label })),
    { value: "other", label: GENERIC.label }];
}

export { UnsafeUrlError };

/**
 * Exposed for tests only.
 *
 * The extraction is the part that has actually been wrong in production, and
 * testing it through `extractListing` would mean a network call to a portal on
 * every run — slow, flaky, and rude. This lets the parser be run against
 * captured real markup instead.
 */
export const __extractForTest = draftFromStructuredData;
