import { defineRouting } from "next-intl/routing";
import { market } from "@/config/market";

/**
 * Unlike the hub — a private tool that resolves locale from a cookie — the
 * marketplace is an SEO surface, so locale must live in the URL. One URL, one
 * language, so a search engine can index both without seeing the same address
 * serve different content to different visitors.
 *
 * The locale set comes from the MARKET, not from a literal. Indonesia serves
 * id (unprefixed) then en; Malaysia serves en (unprefixed) then ms. One
 * deployment, one market, one default locale — a single router cannot have
 * two defaults, which is why the two markets are two deployments of this code
 * rather than one site trying to be both.
 */

/**
 * Public URL segments, per market.
 *
 * The folders on disk stay `cari` and `properti` — renaming them would mean a
 * second copy of every page. `pathnames` maps the PUBLIC url onto them, and
 * next-intl's middleware does the rewrite, so Malaysia serves `/property/…`
 * and `/search` from the same files Indonesia serves `/properti/…` and `/cari`
 * from.
 *
 * THE SAME SEGMENT FOR BOTH LOCALES IN A MARKET, DELIBERATELY.
 *   Malaysia is English-first with Malay second, and Malaysian portals keep
 *   English URLs on their Malay pages. So `/property/…` and `/ms/property/…`,
 *   not `/ms/hartanah/…`. Only the locale prefix differs. If you ever want
 *   Malay-language URLs for SEO, this is the one place to add them — give the
 *   `ms` key a different value below.
 */
const localisedPath = (internal: string, segment: string) =>
  Object.fromEntries(
    market.locales.map((locale) => [locale, internal.replace(/^\/[^/]+/, `/${segment}`)])
  );

export const routing = defineRouting({
  locales: market.locales,
  defaultLocale: market.defaultLocale,
  localePrefix: "as-needed",
  localeDetection: false,
  pathnames: {
    "/": "/",
    "/cari": localisedPath("/cari", market.segments.search),
    "/properti/[slug]": localisedPath("/properti/[slug]", market.segments.listing),
    // Agents keep `/agent` in both markets: it is already English, and the
    // Malay "ejen" would gain nothing an English-first site wants.
    "/agent/[slug]": "/agent/[slug]",
  },
});

export type Locale = (typeof routing.locales)[number];

/**
 * The public path for an internal route, in the current locale.
 *
 * Href construction in this codebase is manual (the locale prefix is added by
 * hand in several components), so this keeps the segment lookup in one place
 * rather than leaving `"/cari"` written out where it would not be rewritten.
 */
export function publicPath(locale: string, internal: "search" | "listing", rest = ""): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const segment = internal === "search" ? market.segments.search : market.segments.listing;
  return `${prefix}/${segment}${rest}`;
}
