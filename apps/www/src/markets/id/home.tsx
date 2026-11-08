import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ListingCard } from "@/components/listing-card";
import { SearchBar } from "@/components/search-bar";
import { KprCalculator } from "@/components/kpr-calculator";
import { PromoBanner } from "@/components/promo-banner";
import { SectionHeading } from "@/components/section-heading";
import {
  ArrowRightIcon, BoltIcon, BuildingIcon, HomeIcon, KeyIcon, LockIcon,
  ShieldIcon, TreeIcon,
} from "@/components/icons";
import type { HomeData } from "../types";

/**
 * Indonesia's homepage.
 *
 * Structured after what the two incumbents actually do — Rumah123's homepage
 * (fetched 9 Aug 2026) and PropertyGuru MY's, which blocks automated fetches
 * and so is followed from its well-known shape rather than a fresh capture.
 * Both open with a tabbed search, then alternate inventory rails with browse
 * grids, and both end in a large by-region link grid that exists for search
 * engines as much as for people.
 *
 * What we deliberately do NOT copy: neither site's homepage is honest about
 * paid placement. Ours labels the promoted rail as promoted (§14) — promotion
 * may lift a listing, never disguise itself.
 *
 * Every section is backed by real rows. Sections with nothing behind them do
 * not render at all, rather than showing a plausible-looking empty frame; with
 * a cold catalogue that is the difference between a sparse honest page and one
 * that implies inventory it does not have.
 */

/**
 * Icons for the category tiles, keyed by the `property_type` the facets return.
 * Unmapped types fall back to the house icon rather than rendering nothing.
 */
const TYPE_ICONS: Record<string, (p: { className?: string }) => React.JSX.Element> = {
  rumah: HomeIcon,
  villa: HomeIcon,
  apartemen: BuildingIcon,
  kantor: BuildingIcon,
  kost: KeyIcon,
  ruko: BuildingIcon,
  gudang: BuildingIcon,
  tanah: TreeIcon,
};

export async function IndonesiaHome(data: HomeData) {
  const {
    locale, country, searchHref, hubUrl, total, latest, promoted,
    typeFacets, cityFacets, provinces, topBanners, middleBanners, adLabel,
  } = data;

  const t = await getTranslations("home");
  const tp = await getTranslations("propertyType");

  const whyIcons = {
    whyVerifiedTitle: ShieldIcon,
    whyFastTitle: BoltIcon,
    whyProtectedTitle: LockIcon,
  };

  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      {/* A dark band rather than a photograph. The design sheet's hero sits on
          a property image; `listing_media` currently holds zero rows, so there
          is no photograph on this platform to put here — and a stock house
          from somewhere else would be advertising a property that is not for
          sale. Navy carries the same weight and is honest. Swap it for a real
          hero image the day the catalogue has one. */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(ellipse_at_top_right,rgb(37_99_235/0.5),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgb(229_57_53/0.35),transparent_55%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:64px_64px]"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h1 className="max-w-3xl text-[2.15rem] font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/70 sm:text-lg">{t("heroSubtitle", { country })}</p>

          <div className="mt-9 max-w-3xl">
            <SearchBar locale={locale} advanced onDark />
          </div>

          {/* Popular searches, from cities that actually have stock. */}
          {cityFacets.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-sm text-white/60">{t("popularSearches")}</span>
              {cityFacets.slice(0, 6).map((c) => (
                <Link
                  key={c.regency_name}
                  href={`${searchHref}?q=${encodeURIComponent(c.regency_name)}`}
                  className="rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/20"
                >
                  {c.regency_name}
                </Link>
              ))}
            </div>
          )}

          {/* Real counts only. An empty catalogue says nothing rather than
              claiming a number it cannot back. */}
          {total > 0 && (
            <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-4 border-t border-white/10 pt-6">
              {[
                [String(total), t("statListings")],
                [String(cityFacets.length), t("statCities")],
                [String(provinces.length), t("statProvinces")],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd>
                    <span className="block text-2xl font-bold tracking-tight text-white">{value}</span>
                    <span className="mt-0.5 block text-xs font-medium uppercase tracking-wide text-white/50">
                      {label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* Browse by category ------------------------------------------------ */}
      {/* The design sheet's category tiles, each carrying its real stock count.

          This replaced BOTH the old quick-action row and a second by-type grid
          further down the page, which listed the same property types twice.

          NO "FROM" PRICE HERE, DELIBERATELY. The removed grid appeared to show
          one, but `getPropertyTypeFacets()` nulls `min_price` whenever sale and
          rent are rolled together — otherwise a monthly rent would sit in the
          same "from Rp …" slot as an asking price and read as a bargain house.
          The homepage rolls both together, so that line never rendered here and
          is not reintroduced. A per-type page that filters to sale or rent can
          show it honestly.

          A type with nothing behind it is not shown at all: a tile that says
          "Gudang" and lands on an empty result set is worse than one fewer
          tile. */}
      {typeFacets.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-12">
          <SectionHeading title={t("browseTypeTitle")} subtitle={t("browseTypeSubtitle")} />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {typeFacets
              .filter((f) => f.listing_count > 0)
              .map((f) => {
                const Icon = TYPE_ICONS[f.property_type] ?? HomeIcon;
                return (
                  <Link
                    key={f.property_type}
                    href={`${searchHref}?propertyType=${encodeURIComponent(f.property_type)}`}
                    className="group flex flex-col items-center rounded-card border border-line bg-surface-raised p-4 shadow-card transition-colors duration-200 hover:border-brand hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-soft text-blue transition-colors duration-200 group-hover:bg-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="mt-2.5 text-center text-sm font-semibold leading-tight">
                      {tp(f.property_type)}
                    </span>
                    <span className="mt-0.5 text-xs text-muted tabular-nums">
                      {t("listingCount", { count: f.listing_count })}
                    </span>
                  </Link>
                );
              })}
            <Link
              href={searchHref}
              className="group flex flex-col items-center justify-center rounded-card border border-line bg-surface-raised p-4 shadow-card transition-colors duration-200 hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-surface text-muted transition-colors duration-200 group-hover:text-brand">
                <ArrowRightIcon className="h-5 w-5" />
              </span>
              <span className="mt-2.5 text-center text-sm font-semibold leading-tight">
                {t("browseAll")}
              </span>
            </Link>
          </div>
        </section>
      )}


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
          {/* Promotion is stated plainly, not buried in a tooltip (§14). */}
          <SectionHeading
            eyebrow={adLabel}
            title={t("promotedTitle")}
            subtitle={t("promotedSubtitle")}
          />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {promoted.map((listing) => (
              <ListingCard key={listing.id} listing={listing} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* Latest ----------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <SectionHeading
          title={t("latestTitle")}
          subtitle={t("latestSubtitle")}
          action={{ href: searchHref, label: t("seeAll") }}
        />

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
            <SectionHeading title={t("byCityTitle")} subtitle={t("byCitySubtitle")} />

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {cityFacets.map((c) => (
                <Link
                  key={c.regency_name}
                  href={`${searchHref}?q=${encodeURIComponent(c.regency_name)}`}
                  className="cursor-pointer rounded-card border border-line bg-surface-raised p-4 transition-colors duration-200 hover:border-brand hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
          <SectionHeading title={t("whyTitle")} />
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {([
              ["whyVerifiedTitle", "whyVerifiedBody"],
              ["whyFastTitle", "whyFastBody"],
              ["whyProtectedTitle", "whyProtectedBody"],
            ] as const).map(([title, body]) => {
              const Icon = whyIcons[title];
              return (
                <div key={title} className="rounded-card border border-line bg-surface-raised p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 font-semibold">{t(title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t(body)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>


      {/* Join as an agent -------------------------------------------------- */}
      {/* Phase 1 is measured in activated agents, and this is the only place
          on the public site that asks for one. It links to the hub — a
          different origin, so plain anchors rather than <Link>.

          The design sheet pairs this band with a photograph of two agents and
          a row of brokerage logos. Both are left out on purpose: there is no
          licensed photography yet, and printing other firms' marks would claim
          partnerships that do not exist. */}
      <section className="border-t border-line bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {t("agentCtaTitle")}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-white/70">{t("agentCtaBody")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`${hubUrl}/register`}
                className="rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t("agentCtaPrimary")}
              </a>
              <a
                href={`${hubUrl}/login`}
                className="rounded-lg border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {t("agentCtaSecondary")}
              </a>
            </div>
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
