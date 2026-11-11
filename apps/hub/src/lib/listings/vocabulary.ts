/**
 * Listing vocabulary per market: one list, shared by the hand-entry wizard,
 * its server action and partner ingest (D8, P0-d-1b).
 *
 * Mirrors the 00075 check constraints. Indonesian keys are Indonesian words,
 * Malaysian keys are English words, and they are NOT interchangeable: an
 * Indonesian `ruko` and a Malaysian shoplot are different products, and a
 * Malaysian freehold title is not an SHM. Which subset an agent is offered is
 * decided here, by the agent's own country, never by the form.
 *
 * Pure: no imports, safe on the server and in client components.
 */

export type MarketCountry = "ID" | "MY";
export type SizeUnit = "sqm" | "sqft";

export const MARKET_COUNTRIES: readonly MarketCountry[] = ["ID", "MY"];

export function asMarketCountry(code: string | null | undefined): MarketCountry | null {
  return code === "ID" || code === "MY" ? code : null;
}

/** Platform property-type keys per country, grouped the way the wizard offers them. */
export const TYPES_BY_CATEGORY: Record<MarketCountry, { residential: readonly string[]; commercial: readonly string[] }> = {
  ID: {
    residential: ["rumah", "apartemen", "kondominium", "villa", "kost", "tanah", "kavling", "lainnya"],
    commercial: ["ruko", "rukan", "kantor", "toko", "hotel", "gudang", "pabrik", "tanah", "kavling", "lainnya"],
  },
  MY: {
    residential: [
      "terrace", "semi_detached", "bungalow", "townhouse", "cluster_home", "condominium",
      "serviced_residence", "apartment", "flat", "soho", "penthouse", "residential_land", "agricultural_land", "lainnya",
    ],
    commercial: [
      "shoplot", "shop_office", "retail_space", "office_space", "factory", "warehouse",
      "commercial_land", "agricultural_land", "lainnya",
    ],
  },
};

/** Every platform type key a country may store. */
export const PLATFORM_TYPES: Record<MarketCountry, ReadonlySet<string>> = {
  ID: new Set([...TYPES_BY_CATEGORY.ID.residential, ...TYPES_BY_CATEGORY.ID.commercial]),
  MY: new Set([...TYPES_BY_CATEGORY.MY.residential, ...TYPES_BY_CATEGORY.MY.commercial]),
};

/** Tenure / land-title keys per country (00075). `strata` and `lainnya` are shared. */
export const TENURES: Record<MarketCountry, readonly string[]> = {
  ID: ["shm", "hgb", "hgu", "hp", "hbg", "girik", "strata", "ppjb", "adat", "lainnya"],
  MY: ["freehold", "leasehold_99", "leasehold_60", "leasehold_other", "strata", "malay_reserve", "bumi_lot", "lainnya"],
};

/** Stored category, derived from the type rather than from the card the agent tapped. */
export const CATEGORY_OF: Record<string, string> = {
  // ID
  rumah: "residential", apartemen: "residential", kondominium: "residential", villa: "residential", kost: "residential",
  ruko: "commercial", rukan: "commercial", kantor: "commercial", toko: "commercial", hotel: "commercial",
  gudang: "industrial", pabrik: "industrial", tanah: "land", kavling: "land",
  // MY
  terrace: "residential", semi_detached: "residential", bungalow: "residential", townhouse: "residential", cluster_home: "residential",
  condominium: "residential", serviced_residence: "residential", apartment: "residential", flat: "residential", soho: "residential", penthouse: "residential",
  shoplot: "commercial", shop_office: "commercial", retail_space: "commercial", office_space: "commercial",
  factory: "industrial", warehouse: "industrial", agricultural_land: "land", residential_land: "land", commercial_land: "land",
};

export function categoryForType(type: string, picked: string): string {
  return CATEGORY_OF[type] ?? (picked === "commercial" ? "commercial" : "other");
}

/** The two location levels the wizard offers, per country (00075 shapes). */
export const WIZARD_LOCATION_LEVELS: Record<MarketCountry, readonly [string, string]> = {
  ID: ["province", "regency"],
  MY: ["state", "district"],
};

export function isTypeAllowed(country: MarketCountry, type: string): boolean {
  return PLATFORM_TYPES[country].has(type);
}

export function isTenureAllowed(country: MarketCountry, tenure: string): boolean {
  return TENURES[country].includes(tenure);
}

/** Unit suffix used in labels and generated copy. */
export function unitSuffix(unit: SizeUnit): string {
  return unit === "sqft" ? "sq ft" : "m²";
}
