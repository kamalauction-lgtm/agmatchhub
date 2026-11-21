import "server-only";
import { cache } from "react";
import { market } from "@/config/market";
import { publicDb } from "./supabase/public";
import { numberLocaleFor } from "./format";
import { usdEquivalent, type FxRates } from "./international-price";

export * from "./international-price";

/**
 * International listings (migration 00134): every read the marketplace makes
 * for the section. Three `public_*` views with the anon key, nothing else —
 * the base tables, the private companion and the PIC list are unreachable
 * from here by design (CLAUDE.md, hard rules 1 and 2).
 *
 * This type mirrors `public_international_listings`. A field that is not here
 * is not public; adding one means changing the view and reviewing that change
 * as security-critical code.
 */
export type InternationalListing = {
  id: string;
  slug: string;
  country_code: string;
  region: string | null;
  city: string | null;
  area: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  listing_type: "sale" | "rent";
  category: string;
  property_type_label: string | null;
  developer_name: string | null;
  tenure_label: string | null;
  completion_label: string | null;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  bathrooms_min: number | null;
  bathrooms_max: number | null;
  size_min: number | null;
  size_max: number | null;
  size_unit: string;
  currency: string;
  price_min: number | null;
  price_max: number | null;
  highlights: string[];
  is_featured: boolean;
  published_at: string | null;
  /** The country's person in charge. All three are null when none is set. */
  contact_name: string | null;
  contact_role: string | null;
  contact_whatsapp: string | null;
  /** "<bucket>/<path>" of the first photo, ready for `mediaUrl`. */
  cover_path: string | null;
  photo_count: number;
  /** Added by 00135. */
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  total_units: number | null;
  land_size: number | null;
  /** The source's own wording ("2 - 6+2"); shown instead of the figures when present. */
  bedrooms_label: string | null;
  bathrooms_label: string | null;
};

/** Mirrors `public_international_media`. */
export type InternationalMedia = {
  id: string;
  listing_id: string;
  storage_bucket: string;
  storage_path: string;
  position: number;
  alt: string | null;
  width: number | null;
  height: number | null;
};

export type InternationalSort = "newest" | "price_asc";

export type InternationalSearch = {
  /** ISO 3166-1 alpha-2, or undefined for every country. */
  country?: string;
  q?: string;
  sort?: InternationalSort;
  page?: number;
};

export type InternationalResult = {
  listings: InternationalListing[];
  total: number;
  page: number;
  pageCount: number;
};

export const INTERNATIONAL_PAGE_SIZE = 24;

/** Upper bound on any single read here; nothing is ever unbounded. */
const MAX_ROWS = 1000;

const VIEW = "public_international_listings";
const SLUG = /^[a-z0-9][a-z0-9-]{2,160}$/;
const COUNTRY = /^[A-Z]{2}$/;

/** The country this build treats as home: first tab, first on the homepage. */
export const homeCountry = market.country;

/** numeric can arrive from PostgREST as a string; coerce once, at the boundary. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalise(row: Record<string, unknown>): InternationalListing {
  return {
    ...(row as InternationalListing),
    price_min: num(row.price_min),
    price_max: num(row.price_max),
    size_min: num(row.size_min),
    size_max: num(row.size_max),
    photo_count: num(row.photo_count) ?? 0,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    total_units: num(row.total_units),
    land_size: num(row.land_size),
    highlights: Array.isArray(row.highlights) ? (row.highlights as string[]) : [],
  };
}

/** Same stripping as the local search: nothing PostgREST's filter grammar reads. */
function cleanTerm(q: string | undefined): string {
  return (q ?? "").replace(/[%,()"'\\.*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Exchange rates, keyed by currency.
 *
 * Fails SOFT, to an empty table: with no rates the price helper shows only the
 * listing's own currency, which is still the true price. Failing hard would
 * take a page down over its least important line; guessing a rate would print
 * a wrong number.
 */
export async function getFxRates(): Promise<FxRates> {
  const { data, error } = await publicDb()
    .from("public_fx_rates")
    .select("currency,per_usd,as_of")
    .limit(400);

  if (error) {
    console.error(`fx rates read failed: ${error.message}`);
    return {};
  }
  const rates: FxRates = {};
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const perUsd = num(row.per_usd);
    if (typeof row.currency === "string" && perUsd !== null && perUsd > 0) {
      rates[row.currency] = { per_usd: perUsd, as_of: String(row.as_of ?? "") };
    }
  }
  return rates;
}

/**
 * Is there anything to show? The header, the footer and the sitemap ask before
 * linking to the section, so an empty catalogue never sends a visitor to a
 * blank page. The link appears by itself when the first listing is published.
 *
 * One HEAD count per request (`cache`), and it fails CLOSED: if the read
 * fails, the link is hidden rather than the page broken.
 */
export const hasInternationalListings = cache(async (): Promise<boolean> => {
  try {
    const { count, error } = await publicDb().from(VIEW).select("id", { count: "exact", head: true });
    if (error) {
      console.error(`international presence check failed: ${error.message}`);
      return false;
    }
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
});

export type CountryCount = { code: string; count: number };

/** Published listings per country, most first, for the country tabs. */
export async function getInternationalCountryCounts(): Promise<CountryCount[]> {
  const { data, error } = await publicDb().from(VIEW).select("country_code").limit(MAX_ROWS);
  if (error) throw new Error(`international country counts failed: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { country_code: string }[]) {
    counts.set(row.country_code, (counts.get(row.country_code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export async function searchInternational(
  params: InternationalSearch,
  rates: FxRates
): Promise<InternationalResult> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const from = (page - 1) * INTERNATIONAL_PAGE_SIZE;
  const country = params.country && COUNTRY.test(params.country) ? params.country : undefined;
  const term = cleanTerm(params.q);
  const search = term ? `title.ilike.%${term}%,city.ilike.%${term}%` : null;

  if (params.sort === "price_asc") {
    /* Prices are in a dozen currencies, so "cheapest first" cannot be an ORDER
       BY on the view. Read the three columns the comparison needs for every
       match (bounded), order by US-dollar equivalent here, then fetch only the
       page being shown. Listings with no price, or no rate, go last. */
    let slim = publicDb().from(VIEW).select("id,currency,price_min,price_max").limit(MAX_ROWS);
    if (country) slim = slim.eq("country_code", country);
    if (search) slim = slim.or(search);

    const { data, error } = await slim;
    if (error) throw new Error(`international search failed: ${error.message}`);

    const ordered = ((data ?? []) as Record<string, unknown>[])
      .map((r) => ({
        id: String(r.id),
        usd: usdEquivalent(String(r.currency), num(r.price_min), num(r.price_max), rates),
      }))
      .sort((a, b) =>
        a.usd === null ? (b.usd === null ? 0 : 1) : b.usd === null ? -1 : a.usd - b.usd
      );

    const total = ordered.length;
    const ids = ordered.slice(from, from + INTERNATIONAL_PAGE_SIZE).map((r) => r.id);
    let listings: InternationalListing[] = [];
    if (ids.length) {
      const rows = await publicDb().from(VIEW).select("*").in("id", ids);
      if (rows.error) throw new Error(`international search failed: ${rows.error.message}`);
      const byId = new Map(
        ((rows.data ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), normalise(r)])
      );
      listings = ids.map((id) => byId.get(id)).filter((l): l is InternationalListing => !!l);
    }
    return { listings, total, page, pageCount: Math.max(1, Math.ceil(total / INTERNATIONAL_PAGE_SIZE)) };
  }

  let query = publicDb()
    .from(VIEW)
    .select("*", { count: "exact" })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, from + INTERNATIONAL_PAGE_SIZE - 1);
  if (country) query = query.eq("country_code", country);
  if (search) query = query.or(search);

  const { data, error, count } = await query;
  if (error) throw new Error(`international search failed: ${error.message}`);

  const total = count ?? 0;
  return {
    listings: ((data ?? []) as Record<string, unknown>[]).map(normalise),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / INTERNATIONAL_PAGE_SIZE)),
  };
}

export async function getInternationalBySlug(slug: string): Promise<InternationalListing | null> {
  // The slug comes from the URL; anything that cannot be one is a 404, not a query.
  if (!SLUG.test(slug)) return null;
  const { data, error } = await publicDb().from(VIEW).select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`international listing lookup failed: ${error.message}`);
  return data ? normalise(data as Record<string, unknown>) : null;
}

export async function getInternationalMedia(listingId: string): Promise<InternationalMedia[]> {
  const { data, error } = await publicDb()
    .from("public_international_media")
    .select("*")
    .eq("listing_id", listingId)
    .order("position", { ascending: true })
    .limit(40);

  // Photos are decoration next to the facts and the price; the page's designed
  // no-photo panel is a better failure than an error screen.
  if (error) {
    console.error(`international media read failed: ${error.message}`);
    return [];
  }
  return (data ?? []) as InternationalMedia[];
}

export type InternationalHome = { listings: InternationalListing[]; rates: FxRates };

export const EMPTY_INTERNATIONAL_HOME: InternationalHome = { listings: [], rates: {} };

/**
 * The homepage strip: up to `limit` listings, the home country's first, then
 * the rest, featured and newest leading within each.
 *
 * Fails SOFT, like the banners: this is an extra on the homepage, and a failed
 * read here (including a database that does not have migration 00134 yet) must
 * leave the local catalogue standing. An empty result renders no section.
 */
export async function getInternationalForHome(limit = 6): Promise<InternationalHome> {
  const pick = (home: boolean) => {
    const q = publicDb().from(VIEW).select("*");
    return (home ? q.eq("country_code", homeCountry) : q.neq("country_code", homeCountry))
      .order("is_featured", { ascending: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit);
  };

  try {
    const [home, abroad, rates] = await Promise.all([pick(true), pick(false), getFxRates()]);
    if (home.error || abroad.error) {
      console.error(
        `international home strip failed: ${(home.error ?? abroad.error)?.message ?? "unknown"}`
      );
      return EMPTY_INTERNATIONAL_HOME;
    }
    const rows = [...(home.data ?? []), ...(abroad.data ?? [])] as Record<string, unknown>[];
    return { listings: rows.slice(0, limit).map(normalise), rates };
  } catch (err) {
    console.error(`international home strip failed: ${err instanceof Error ? err.message : "unknown"}`);
    return EMPTY_INTERNATIONAL_HOME;
  }
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A country's name in the page's language, from the runtime's own data — no
 * country list lives in this codebase. Falls back to the code itself if the
 * runtime cannot name it.
 */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** A currency's name ("US Dollar", "Rupiah Indonesia"), same source. */
export function currencyName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The date of an exchange rate ("2026-11-21"), written for a reader. */
export function formatRateDate(iso: string | null, locale: string): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(numberLocaleFor(locale), { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** "2", "1–3", or the studio word for zero. Null when the listing says nothing. */
export function formatRange(
  min: number | null,
  max: number | null,
  one: (n: number) => string
): string | null {
  const low = min ?? max;
  if (low === null || low === undefined) return null;
  const high = max !== null && min !== null && max > min ? max : null;
  return high === null ? one(low) : `${one(low)}–${one(high)}`;
}

/** "48–162 m²". The unit is the LISTING's, never the market's. */
export function sizeLabel(
  l: Pick<InternationalListing, "size_min" | "size_max" | "size_unit">,
  locale: string
): string | null {
  const numberLocale = numberLocaleFor(locale);
  const range = formatRange(l.size_min, l.size_max, (n) =>
    (n % 1 === 0 ? n : Number(n.toFixed(1))).toLocaleString(numberLocale)
  );
  return range ? `${range} ${l.size_unit === "sqft" ? "sqft" : "m²"}` : null;
}

/** "1–3", "2", or "Studio–2": a studio is stored as zero bedrooms. */
export function bedroomsLabel(
  l: Pick<InternationalListing, "bedrooms_min" | "bedrooms_max" | "bedrooms_label">,
  studioWord: string
): string | null {
  return l.bedrooms_label ?? formatRange(l.bedrooms_min, l.bedrooms_max, (n) => (n === 0 ? studioWord : String(n)));
}

export function bathroomsLabel(
  l: Pick<InternationalListing, "bathrooms_min" | "bathrooms_max" | "bathrooms_label">
): string | null {
  return l.bathrooms_label ?? formatRange(l.bathrooms_min, l.bathrooms_max, String);
}
