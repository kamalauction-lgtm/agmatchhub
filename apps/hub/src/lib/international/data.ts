import "server-only";
import { createClient } from "@/lib/supabase/server";
import { publicSiteUrl } from "@/lib/public-site-url";
import { MARKETPLACE_LOCALES } from "./countries";
import { INTL_LISTING_COLUMNS, type FxRate, type IntlListing, type IntlMedia, type RatesMap } from "./types";

/**
 * Loaders for the agent-facing International pages. Everything is read with
 * the signed-in agent's own session through the public views of 00134 — the
 * same window the marketplace has, so an agent can never see more of a
 * listing here than a buyer will.
 */

function normalise(row: Record<string, unknown>): IntlListing {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...(row as unknown as IntlListing),
    bedrooms_min: n(row.bedrooms_min),
    bedrooms_max: n(row.bedrooms_max),
    bathrooms_min: n(row.bathrooms_min),
    bathrooms_max: n(row.bathrooms_max),
    size_min: n(row.size_min),
    size_max: n(row.size_max),
    price_min: n(row.price_min),
    price_max: n(row.price_max),
    highlights: Array.isArray(row.highlights) ? (row.highlights as string[]) : [],
    photo_count: Number(row.photo_count ?? 0),
  };
}

/** Every published listing: featured first, then newest. */
export async function loadIntlListings(): Promise<IntlListing[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_international_listings")
    .select(INTL_LISTING_COLUMNS)
    .order("is_featured", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error) {
    console.error("[international] list failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalise);
}

export async function loadIntlListing(slug: string): Promise<IntlListing | null> {
  if (!/^[a-z0-9][a-z0-9-]{2,160}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_international_listings")
    .select(INTL_LISTING_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  return data ? normalise(data as unknown as Record<string, unknown>) : null;
}

export async function loadIntlMedia(listingId: string): Promise<IntlMedia[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_international_media")
    .select("id, listing_id, storage_bucket, storage_path, position, alt, width, height")
    .eq("listing_id", listingId)
    .order("position")
    .limit(60);
  return (data ?? []) as IntlMedia[];
}

export async function loadRates(): Promise<RatesMap> {
  const supabase = await createClient();
  const { data } = await supabase.from("public_fx_rates").select("currency, per_usd, as_of");
  const map: RatesMap = {};
  for (const r of (data ?? []) as FxRate[]) {
    map[r.currency] = { perUsd: Number(r.per_usd), asOf: r.as_of };
  }
  return map;
}

/** Public URL of a stored photo given `bucket/path`; null when the project URL is not configured. */
export function intlPhotoUrl(bucketAndPath: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!bucketAndPath || !base) return null;
  const path = bucketAndPath.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${path}`;
}

/**
 * The listing's page on the public marketplace, in the reader's language when
 * the marketplace ships it. Null when no marketplace URL is configured — the
 * caller then hides the share-link control.
 */
export function intlPublicUrl(slug: string, locale: string): string | null {
  const site = publicSiteUrl();
  if (!site) return null;
  const lang = (MARKETPLACE_LOCALES as readonly string[]).includes(locale) ? locale : MARKETPLACE_LOCALES[0];
  return `${site}/${lang}/internasional/${slug}`;
}
