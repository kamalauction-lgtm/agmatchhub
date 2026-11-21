/**
 * International listings — shapes that mirror the three public views of
 * migration 00134 (`public_international_listings`, `public_international_media`,
 * `public_fx_rates`). Agents read only through those views; the base tables
 * are admin-only and the private companion is never read here.
 */

export type IntlListing = {
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
  category: "residential" | "commercial" | "industrial" | "land" | "other";
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
  size_unit: "sqm" | "sqft";
  /** The listing's OWN currency (ISO 4217). IDR and USD are derived for display. */
  currency: string;
  price_min: number | null;
  price_max: number | null;
  highlights: string[];
  is_featured: boolean;
  published_at: string | null;
  /** Person in charge for the listing's country, resolved by the view. */
  contact_name: string | null;
  contact_role: string | null;
  contact_whatsapp: string | null;
  /** `bucket/path` of the first photo, or null. */
  cover_path: string | null;
  photo_count: number;
};

export type IntlMedia = {
  id: string;
  listing_id: string;
  storage_bucket: string;
  storage_path: string;
  position: number;
  alt: string | null;
  width: number | null;
  height: number | null;
};

/** One row of `public_fx_rates`: units of `currency` that one US dollar buys. */
export type FxRate = { currency: string; per_usd: number; as_of: string };

/** Rates keyed by currency code. */
export type RatesMap = Record<string, { perUsd: number; asOf: string }>;

export const INTL_LISTING_COLUMNS =
  "id, slug, country_code, region, city, area, title, summary, description, listing_type, category, " +
  "property_type_label, developer_name, tenure_label, completion_label, bedrooms_min, bedrooms_max, " +
  "bathrooms_min, bathrooms_max, size_min, size_max, size_unit, currency, price_min, price_max, " +
  "highlights, is_featured, published_at, contact_name, contact_role, contact_whatsapp, cover_path, photo_count";
