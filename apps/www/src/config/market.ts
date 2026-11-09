/**
 * Which market this build of the marketplace serves.
 *
 * The platform was designed for several countries on one database — every
 * profile, property and listing carries a `country_code`, the `countries` table
 * holds each market's language, currency, measurement unit and vocabulary, and
 * the rule is that fallback never crosses a country. The *app*, however, had
 * Indonesia written into it: locales, the rupiah, square metres, Indonesian URL
 * segments and an Indonesian mortgage calculator.
 *
 * This file is where that assumption now lives, once, driven by
 * `NEXT_PUBLIC_MARKET`. A deployment serves exactly one market; two markets
 * means two deployments of the same code pointed at the same database, each
 * filtered to its own country. That is deliberate:
 *
 *   · SEO — a Malaysian buyer should never be served an Indonesian listing,
 *     and one domain serving both would compete with itself on every query.
 *   · Language — the URL carries the locale, and the locale sets differ
 *     (ID is id/en, MY is en/ms). One router cannot have two default locales.
 *   · Law and money — currency, measurement and tenure vocabulary are not
 *     presentation details; getting them wrong misstates a price or a title.
 *
 * Values here MIRROR the `countries` row they name. The database is the source
 * of truth for anything an admin can change; this is the build-time copy the
 * router and the formatters need before any query runs.
 */

export type MarketCode = "ID" | "MY";

export type Market = {
  /** ISO country code — the value in `country_code` columns. */
  country: MarketCode;
  /** Locales this market serves, most important first. */
  locales: readonly string[];
  /** The locale served without a URL prefix. */
  defaultLocale: string;
  currency: string;
  /** Intl locale used for number and date formatting. */
  numberLocale: string;
  measurementUnit: "sqm" | "sqft";
  phoneCode: string;
  /** National number length range, excluding the country code. */
  phoneDigits: { min: number; max: number };
  /** Public URL segments for the indexed page types and the 2.0 tools. */
  segments: { listing: string; search: string; assistant: string; compare: string };
  /** What this market calls an agent — mirrors `countries.terminology`. */
  agentTerm: string;
  /**
   * Where agents in this market sign in.
   *
   * The agent platform is ONE application serving both countries — an agent's
   * country comes from their profile, not from the hostname — so this is a
   * second domain pointing at the same deployment, not a second hub.
   *
   * Overridable per deployment with NEXT_PUBLIC_HUB_URL.
   */
  hubUrl: string;
  /** Country name as it appears in copy, per locale. */
  countryName: Record<string, string>;
  /** Property types offered in the search form, in the order buyers expect. */
  searchPropertyTypes: readonly string[];
  /** Budget rungs for the hero's price filter, in the market's currency. */
  budgets: { sale: readonly number[]; rent: readonly number[] };
  /**
   * Home-loan calculator bounds, in the market's currency. A single set of
   * rupiah-scaled numbers made the slider useless in ringgit: its minimum was
   * RM100 million.
   */
  loan: {
    defaultPrice: number;
    minPrice: number;
    maxPrice: number;
    priceStep: number;
  };
};

const MARKETS: Record<MarketCode, Market> = {
  ID: {
    country: "ID",
    locales: ["id", "en"],
    defaultLocale: "id",
    currency: "IDR",
    numberLocale: "id-ID",
    measurementUnit: "sqm",
    phoneCode: "+62",
    phoneDigits: { min: 9, max: 13 },
    segments: { listing: "properti", search: "cari", assistant: "asisten", compare: "bandingkan" },
    agentTerm: "Agen Properti",
    countryName: { id: "Indonesia", en: "Indonesia" },
    hubUrl: "https://hub.propertiguru.id",
    searchPropertyTypes: [
      "rumah", "apartemen", "ruko", "tanah", "kantor", "gudang", "villa", "kost",
    ],
    budgets: {
      sale: [500_000_000, 1_000_000_000, 2_000_000_000, 3_000_000_000,
             5_000_000_000, 10_000_000_000],
      rent: [25_000_000, 50_000_000, 100_000_000, 200_000_000, 500_000_000],
    },
    loan: {
      defaultPrice: 1_500_000_000,
      minPrice: 100_000_000,
      maxPrice: 20_000_000_000,
      priceStep: 50_000_000,
    },
  },
  MY: {
    country: "MY",
    locales: ["en", "ms"],
    defaultLocale: "en",
    currency: "MYR",
    // en-MY formats as "1,234.56" with the grouping Malaysians read, and gives
    // "RM" rather than "MYR" for the currency symbol.
    numberLocale: "en-MY",
    measurementUnit: "sqft",
    phoneCode: "+60",
    phoneDigits: { min: 8, max: 10 },
    segments: { listing: "property", search: "search", assistant: "assistant", compare: "compare" },
    // `countries.terminology` for MY says "Real Estate Negotiator" — the
    // regulated BOVAEP term, not a styling choice.
    agentTerm: "Real Estate Negotiator",
    countryName: { en: "Malaysia", ms: "Malaysia" },
    /* PENDING THE MALAYSIAN DOMAIN.
     *
     * Still the Indonesian hostname, so "Agent login" works today — the hub is
     * country-aware and a Malaysian agent can sign in there now. But it is the
     * wrong brand to show a Malaysian agent, and it is the ONE line to change
     * when the domain exists (or set NEXT_PUBLIC_HUB_URL in .env.my.local and
     * wrangler.my.jsonc). Point the new hostname at the existing hub Worker as
     * a second custom domain; do not stand up a second hub. */
    hubUrl: "https://hub.propertiguru.id",
    // The volume products first: terrace, condo and semi-D are what most
    // Malaysian searches start from.
    searchPropertyTypes: [
      "terrace", "condominium", "semi_detached", "bungalow", "apartment",
      "serviced_residence", "townhouse", "shoplot", "office_space",
      "factory", "residential_land", "agricultural_land",
    ],
    // Ringgit rungs a Malaysian buyer actually thinks in. Rent is monthly.
    budgets: {
      sale: [300_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 5_000_000],
      rent: [1_000, 1_500, 2_500, 4_000, 6_000, 10_000],
    },
    // A median Klang Valley condominium is the useful starting point.
    loan: {
      defaultPrice: 500_000,
      minPrice: 100_000,
      maxPrice: 5_000_000,
      priceStep: 10_000,
    },
  },
};

function resolve(): Market {
  const raw = (process.env.NEXT_PUBLIC_MARKET ?? "ID").toUpperCase();
  const market = MARKETS[raw as MarketCode];
  if (!market) {
    // Loud, not silent. A typo in an env var that quietly serves the wrong
    // country would put rupiah prices on a Malaysian domain.
    throw new Error(
      `NEXT_PUBLIC_MARKET="${raw}" is not a market. Expected one of: ${Object.keys(MARKETS).join(", ")}`
    );
  }
  // A deployment may override where agents sign in without editing this file.
  return process.env.NEXT_PUBLIC_HUB_URL
    ? { ...market, hubUrl: process.env.NEXT_PUBLIC_HUB_URL }
    : market;
}

export const market = resolve();

/** Every market, for tooling that has to reason about all of them. */
export const allMarkets = MARKETS;
