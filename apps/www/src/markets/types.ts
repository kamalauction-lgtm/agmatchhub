import type {
  PublicListing,
  PropertyTypeFacet,
  LocationFacet,
  SiteBanner,
} from "@/lib/listings";

/**
 * Everything a market's homepage is given.
 *
 * The dispatcher loads this once and hands the same shape to whichever market
 * composition is built. Keeping the loading in one place is deliberate: the
 * country filter lives in the query layer, and two copies of the loading code
 * would be two places to forget it.
 *
 * A market uses the parts it wants. A section missing from one market's page
 * is missing because that market did not compose it — not because of a
 * conditional buried inside shared markup.
 */
export type HomeData = {
  locale: string;
  /** Country name in the current locale, for copy that names it. */
  country: string;
  /** URL prefix for the current locale ("" for the default). */
  prefix: string;
  searchHref: string;
  hubUrl: string;

  listings: PublicListing[];
  total: number;
  latest: PublicListing[];
  promoted: PublicListing[];
  typeFacets: PropertyTypeFacet[];
  cityFacets: LocationFacet[];
  provinces: { name: string; count: number }[];
  topBanners: SiteBanner[];
  middleBanners: SiteBanner[];
  adLabel: string;
};
