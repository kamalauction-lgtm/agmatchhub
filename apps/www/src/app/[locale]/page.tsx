import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  searchListings,
  getPropertyTypeFacets,
  getLocationFacets,
  getPromotedListings,
  getProvinceFacets,
  getBanners,
} from "@/lib/listings";
import { routing } from "@/i18n/routing";
import { market } from "@/config/market";
import { MarketHome } from "@/markets";

/**
 * The marketplace homepage — a dispatcher, not a page.
 *
 * The two markets are separate products on separate domains with separate
 * layouts, so there is no shared markup here. This file does the one thing both
 * markets need identically: load the data. Everything visual belongs to
 * `src/markets/<code>/home.tsx`.
 *
 * LOADING STAYS HERE ON PURPOSE
 *   Every read is already filtered to this build's country inside the query
 *   layer. Duplicating the loading per market would be a second place to forget
 *   that filter — and forgetting it does not throw, it quietly serves another
 *   country's listings in the wrong currency.
 *
 * A section exists in one market and not the other because that market did not
 * compose it, never because of a country conditional buried inside shared JSX.
 */

// Public, cacheable, identical for everyone. Revalidating on an interval keeps
// the homepage off the database on every hit while staying fresh enough for a
// catalogue that changes a few times an hour.
export const revalidate = 300;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");

  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const searchHref = `${prefix}/${market.segments.search}`;
  const country =
    market.countryName[locale] ?? market.countryName[market.defaultLocale];

  // One round of parallel reads. Every one is a bounded query against a
  // public_* view, scoped to this market's country; none can reach a base table.
  const [
    { listings, total },
    typeFacets,
    cityFacets,
    promoted,
    provinces,
    topBanners,
    middleBanners,
  ] = await Promise.all([
    searchListings({ sort: "newest", page: 1 }),
    getPropertyTypeFacets(),
    getLocationFacets(undefined, 12),
    getPromotedListings(4),
    getProvinceFacets(),
    getBanners("home_top"),
    getBanners("home_middle"),
  ]);

  return (
    <MarketHome
      locale={locale}
      country={country}
      prefix={prefix}
      searchHref={searchHref}
      hubUrl={market.hubUrl}
      listings={listings}
      total={total}
      latest={listings.slice(0, 6)}
      promoted={promoted}
      typeFacets={typeFacets}
      cityFacets={cityFacets}
      provinces={provinces}
      topBanners={topBanners}
      middleBanners={middleBanners}
      adLabel={t("adLabel")}
    />
  );
}
