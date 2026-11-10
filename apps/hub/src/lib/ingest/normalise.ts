/**
 * Ingest normalisation — pure, per country, unit-tested.
 *
 * Hero (and any later sender) speaks its own vocabulary; this platform stores
 * the per-country keys that 00075's check constraints allow. Indonesian keys
 * are Indonesian words, Malaysian keys are English words, and they are NOT
 * interchangeable (an Indonesian `ruko` and a Malaysian `shoplot` differ).
 *
 * Sizes: the sender says its unit (`size_unit`, default sqm — Hero converts to
 * sqm before sending); the property is stored in the country's unit.
 */

// Relative, not `@/`: the unit tests import this module without the hub alias.
import { PLATFORM_TYPES, CATEGORY_OF, type MarketCountry, type SizeUnit } from "../listings/vocabulary";

export type IngestCountry = MarketCountry;
export type { SizeUnit };

const SQFT_PER_SQM = 10.7639104;

/** Platform keys per country: the shared list in lib/listings/vocabulary.ts (00075). */
export { PLATFORM_TYPES };

/** Sender vocabulary (Hero's) → platform key, per country. */
const FROM_SENDER: Record<IngestCountry, Record<string, string>> = {
  ID: {
    rumah: "rumah", terrace_house: "rumah", semi_detached: "rumah", bungalow: "rumah", townhouse: "rumah", cluster_house: "rumah",
    apartment: "apartemen", flat: "apartemen", serviced_apartment: "apartemen", soho: "apartemen", studio: "apartemen", penthouse: "kondominium", condominium: "kondominium",
    villa: "villa", ruko: "ruko", shop_lot: "ruko", office: "kantor", retail: "toko", hotel: "hotel", warehouse: "gudang", factory: "pabrik",
    residential_land: "tanah", commercial_land: "tanah", industrial_land: "kavling", agricultural_land: "tanah", other: "lainnya",
  },
  MY: {
    terrace_house: "terrace", link_house: "terrace", terrace: "terrace", semi_detached: "semi_detached", bungalow: "bungalow", villa: "bungalow", townhouse: "townhouse",
    cluster_house: "cluster_home", cluster_home: "cluster_home", condominium: "condominium", condo: "condominium", serviced_apartment: "serviced_residence", serviced_residence: "serviced_residence",
    apartment: "apartment", flat: "flat", soho: "soho", studio: "apartment", penthouse: "penthouse",
    shop_lot: "shoplot", shoplot: "shoplot", shop_office: "shop_office", retail: "retail_space", retail_space: "retail_space", office: "office_space", office_space: "office_space",
    factory: "factory", warehouse: "warehouse", residential_land: "residential_land", commercial_land: "commercial_land", industrial_land: "commercial_land",
    agricultural_land: "agricultural_land", hotel: "lainnya", other: "lainnya",
  },
};

export function normalisePropertyType(country: IngestCountry, sent: string): { propertyType: string; category: string } {
  const key = sent.trim().toLowerCase();
  const propertyType = FROM_SENDER[country][key] ?? (PLATFORM_TYPES[country].has(key) ? key : "lainnya");
  return { propertyType, category: CATEGORY_OF[propertyType] ?? "other" };
}

/** Convert a size from the sender's unit to the country's unit, 2 dp. */
export function convertSize(value: number | null | undefined, from: SizeUnit, to: SizeUnit): number | null {
  if (value == null) return null;
  if (from === to) return Math.round(value * 100) / 100;
  const out = from === "sqm" ? value * SQFT_PER_SQM : value / SQFT_PER_SQM;
  return Math.round(out * 100) / 100;
}

/** Which country a payload is for, when the sender did not say: currency is the honest hint. */
export function inferCountry(currency: string | null | undefined, fallback: IngestCountry = "ID"): IngestCountry {
  const c = (currency ?? "").toUpperCase();
  if (c === "MYR") return "MY";
  if (c === "IDR") return "ID";
  return fallback;
}

export type CountryDefaults = { default_currency: string; default_language: string; measurement_unit: SizeUnit };

/** Fill what the sender left out from the country's own row. */
export function applyCountryDefaults(
  listing: { currency?: string | null; language?: string | null },
  country: CountryDefaults,
): { currency: string; language: string } {
  return {
    currency: listing.currency ?? country.default_currency,
    language: listing.language ?? country.default_language,
  };
}
