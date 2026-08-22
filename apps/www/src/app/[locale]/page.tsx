import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  searchListings,
  getPropertyTypeFacets,
  getLocationFacets,
  getPromotedListings,
  getProvinceFacets,
  getBanners,
} from "@/lib/listings";
import { ListingCard } from "@/components/listing-card";
import { SearchBar } from "@/components/search-bar";
import { KprCalculator } from "@/components/kpr-calculator";
import { PromoBanner } from "@/components/promo-banner";
import { routing } from "@/i18n/routing";

/**
 * The marketplace homepage.
 *
 * Structured after what the two incumbents actually do — Rumah123's homepage
 * (fetched 9 Aug 2026) and PropertyGuru MY's, which blocks automated fetches
 * and so is followed from its well-known shape rather than a fresh capture.
 * Both open with a tabbed search over a quick-action row, then alternate
 * inventory rails with browse grids, and both end in a large by-region link
 * grid that exists for search engines as much as for people.
 *
 * What we deliberately do NOT copy: neither site's homepage is honest about
 * paid placement. Ours labels the promoted rail as promoted (§14) — promotion
 * may lift a listing, never disguise itself.
 *
 * Every section here is backed by real rows. Sections with nothing behind them
 * do not render at all, rather than showing a plausible-looking empty frame;
 * with a cold catalogue that is the difference between a sparse honest page and
 * one that implies inventory it does not have.
 */

// Public, cacheable, identical for everyone. Revalidating on an interval keeps
// the homepage off the database on every hit while staying fresh enough for a
// catalogue that changes a few times an hour.
export const revalidate = 300;

const shortIdr = (n: number) =>
  n >= 1_000_000_000
    ? `Rp ${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1).replace(".", ",")} M`
    : `Rp ${Math.round(n / 1_000_000)} jt`;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");
  const tp = await getTranslations("propertyType");

  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const searchHref = `${prefix}/cari`;

  // One round of parallel reads. Every one is a bounded query against a
  // public_* view; none can reach a base table.
  const [
    { listings },
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

  const adLabel = t("adLabel");

  const latest = listings.slice(0, 6);

  // Rumah123's quick-action row, reduced to destinations that exist. A shortcut
  // to a page we have not built would be worse than one fewer shortcut.
  const quickActions = [
    { key: "buy", icon: "🏠", href: `${searchHref}?type=sale` },
    { key: "rent", icon: "🔑", href: `${searchHref}?type=rent` },
    { key: "land", icon: "🌳", href: `${searchHref}?propertyType=tanah` },
    { key: "commercial", icon: "🏢", href: `${searchHref}?category=commercial` },
    { key: "newest", icon: "✨", href: `${searchHref}?sort=newest` },
  ] as const;

  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      <section className="border-b border-line bg-gradient-to-b from-brand-soft to-background">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">{t("heroSubtitle")}</p>

          <div className="mt-8 max-w-3xl">
            <SearchBar locale={locale} advanced />
          </div>

          {/* Popular searches, from cities that actually have stock. */}
          {cityFacets.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">{t("popularSearches")}</span>
              {cityFacets.slice(0, 6).map((c) => (
                <Link
                  key={c.regency_name}
                  href={`${searchHref}?q=${encodeURIComponent(c.regency_name)}`}
                  className="rounded-full border border-line bg-surface-raised px-3 py-1.5 text-sm font-medium hover:border-brand hover:text-brand"
                >
                  {c.regency_name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Quick actions ---------------------------------------------------- */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-3 gap-2 px-4 py-6 sm:grid-cols-6">
          {quickActions.map((a) => {
            const inner = (
              <>
                <span aria-hidden className="text-2xl">
                  {a.icon}
                </span>
                <span className="mt-2 text-center text-xs font-medium leading-tight">
                  {t(`quick.${a.key}`)}
                </span>
              </>
            );
            const className =
              "flex flex-col items-center rounded-card border border-line bg-surface-raised p-3 hover:border-brand hover:text-brand";

            return "external" in a && a.external ? (
              <a key={a.key} href={a.href} className={className}>
                {inner}
              </a>
            ) : (
              <Link key={a.key} href={a.href} className={className}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Advertising — top slot ------------------------------------------- */}
      {topBanners.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-8">
          <div className={topBanners.length > 1 ? "grid gap-4 lg:grid-cols-2" : ""}>
            {topBanners.map((b) => (
              <PromoBanner key={b.id} banner={b} adLabel={adLabel} />
            ))}
          </div>
        </section>
      )}

      {/* Promoted rail ---------------------------------------------------- */}
      {promoted.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                {t("promotedTitle")}
              </h2>
              {/* Stated plainly, not buried in a tooltip. */}
              <p className="mt-1 text-sm text-muted">{t("promotedSubtitle")}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {promoted.map((listing) => (
              <ListingCard key={listing.id} listing={listing} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* Browse by property type ------------------------------------------ */}
      {typeFacets.length > 0 && (
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("byTypeTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("byTypeSubtitle")}</p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {typeFacets.map((f) => (
                <Link
                  key={f.property_type}
                  href={`${searchHref}?propertyType=${f.property_type}`}
                  className="rounded-card border border-line bg-surface-raised p-4 hover:border-brand"
                >
                  <p className="font-semibold">{tp(f.property_type)}</p>
                  <p className="mt-1 text-sm text-muted">
                    {t("listingCount", { count: f.listing_count })}
                  </p>
                  {f.min_price !== null && (
                    <p className="mt-1 text-xs font-medium text-brand">
                      {t("fromPrice", { amount: shortIdr(f.min_price) })}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Latest ----------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("latestTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("latestSubtitle")}</p>
          </div>
          <Link
            href={searchHref}
            className="shrink-0 text-sm font-semibold text-brand hover:underline"
          >
            {t("seeAll")} →
          </Link>
        </div>

        {latest.length > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} locale={locale} priority={i < 3} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-card border border-dashed border-line p-10 text-center text-muted">
            {/* An empty catalogue is the expected state before inventory
                lands, so it gets a designed state rather than a blank page. */}
            <p>{t("latestSubtitle")}</p>
          </div>
        )}
      </section>

      {/* Advertising — middle slot ---------------------------------------- */}
      {middleBanners.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-4">
          <div className={middleBanners.length > 1 ? "grid gap-4 lg:grid-cols-2" : ""}>
            {middleBanners.map((b) => (
              <PromoBanner key={b.id} banner={b} adLabel={adLabel} size="tall" />
            ))}
          </div>
        </section>
      )}

      {/* Browse by city --------------------------------------------------- */}
      {cityFacets.length > 0 && (
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("byCityTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("byCitySubtitle")}</p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {cityFacets.map((c) => (
                <Link
                  key={c.regency_name}
                  href={`${searchHref}?q=${encodeURIComponent(c.regency_name)}`}
                  className="rounded-card border border-line bg-surface-raised p-4 hover:border-brand"
                >
                  <p className="font-semibold">{c.regency_name}</p>
                  {c.province_name && (
                    <p className="text-xs text-muted">{c.province_name}</p>
                  )}
                  <p className="mt-1 text-sm text-muted">
                    {t("listingCount", { count: c.listing_count })}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* KPR estimator ---------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <KprCalculator
          searchHref={searchHref}
          labels={{
            title: t("kpr.title"),
            intro: t("kpr.intro"),
            price: t("kpr.price"),
            downPayment: t("kpr.downPayment"),
            rate: t("kpr.rate"),
            years: t("kpr.years"),
            monthly: t("kpr.monthly"),
            loanAmount: t("kpr.loanAmount"),
            disclaimer: t("kpr.disclaimer"),
            cta: t("kpr.cta"),
          }}
        />
      </section>

      {/* Why us ----------------------------------------------------------- */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("whyTitle")}</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {[
              ["whyVerifiedTitle", "whyVerifiedBody"],
              ["whyFastTitle", "whyFastBody"],
              ["whyProtectedTitle", "whyProtectedBody"],
            ].map(([title, body]) => (
              <div key={title} className="rounded-card border border-line bg-surface-raised p-5">
                <h3 className="font-semibold">{t(title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t(body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* By province — an SEO surface as much as a navigation one. --------- */}
      {provinces.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t("byProvinceTitle")}
            </h2>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {provinces.map((p) => (
                <Link
                  key={p.name}
                  href={`${searchHref}?q=${encodeURIComponent(p.name)}`}
                  className="text-muted hover:text-brand hover:underline"
                >
                  {t("propertyIn", { place: p.name })}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
