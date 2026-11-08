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
 * Malaysia's homepage.
 *
 * A DIFFERENT LAYOUT FROM INDONESIA, NOT A TRANSLATION OF IT
 *   Separate domain, separate audience, separate composition. The structural
 *   differences from the Indonesian page, and why:
 *
 *   · **Light hero, not a dark band.** Indonesia's navy hero exists because
 *     `listing_media` is empty there and a dark band was the honest substitute
 *     for a photograph. Malaysia starts with no listings at all, so the hero
 *     leads with the search itself rather than pretending at imagery.
 *   · **Search first, inventory second.** With a cold catalogue, a Malaysian
 *     visitor is far more likely to be an AGENT evaluating the platform than a
 *     buyer. The join-as-an-agent band is therefore high on the page, not
 *     buried at the bottom as it is in Indonesia.
 *   · **Categories as a wide strip**, because Malaysian search starts from
 *     property type (terrace / condo / semi-D) far more than from district.
 *   · **No by-province link grid.** Indonesia's exists as an SEO surface over
 *     34 provinces with real stock. Malaysia has stock in none of its 16
 *     states yet, so that grid would be sixteen links to empty result sets.
 *
 * Everything still renders only when it has real rows behind it. A section
 * with nothing behind it does not appear.
 */

/** Icons for the category strip, keyed by the Malaysian `property_type`. */
const TYPE_ICONS: Record<string, (p: { className?: string }) => React.JSX.Element> = {
  terrace: HomeIcon,
  semi_detached: HomeIcon,
  bungalow: HomeIcon,
  townhouse: HomeIcon,
  cluster_home: HomeIcon,
  condominium: BuildingIcon,
  serviced_residence: BuildingIcon,
  apartment: BuildingIcon,
  flat: BuildingIcon,
  soho: BuildingIcon,
  penthouse: BuildingIcon,
  shoplot: BuildingIcon,
  shop_office: BuildingIcon,
  office_space: BuildingIcon,
  factory: BuildingIcon,
  warehouse: BuildingIcon,
  residential_land: TreeIcon,
  commercial_land: TreeIcon,
  agricultural_land: TreeIcon,
  retail_space: KeyIcon,
};

export async function MalaysiaHome(data: HomeData) {
  const {
    locale, country, searchHref, hubUrl, total, latest, promoted,
    typeFacets, cityFacets, topBanners, middleBanners, adLabel,
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
      {/* Hero — light, search-led ------------------------------------------ */}
      <section className="border-b border-line bg-gradient-to-b from-surface to-background">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-3xl text-[2.15rem] font-bold leading-[1.1] tracking-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
            {t("heroSubtitle", { country })}
          </p>

          <div className="mt-9 max-w-3xl">
            <SearchBar locale={locale} advanced />
          </div>

          {/* Only shown once there is stock behind it. On a cold catalogue a
              row of zeroes is worse than no row. */}
          {total > 0 && cityFacets.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">{t("popularSearches")}</span>
              {cityFacets.slice(0, 6).map((c) => (
                <Link
                  key={c.regency_name}
                  href={`${searchHref}?q=${encodeURIComponent(c.regency_name)}`}
                  className="rounded-full border border-line bg-surface-raised px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 hover:border-brand hover:text-brand"
                >
                  {c.regency_name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Categories — a wide strip, the Malaysian entry point --------------- */}
      {typeFacets.filter((f) => f.listing_count > 0).length > 0 && (
        <section className="border-b border-line bg-surface-raised">
          <div className="mx-auto max-w-6xl px-4 py-8">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
              {typeFacets
                .filter((f) => f.listing_count > 0)
                .slice(0, 13)
                .map((f) => {
                  const Icon = TYPE_ICONS[f.property_type] ?? HomeIcon;
                  return (
                    <Link
                      key={f.property_type}
                      href={`${searchHref}?propertyType=${encodeURIComponent(f.property_type)}`}
                      className="group flex flex-col items-center rounded-card px-2 py-3 transition-colors duration-200 hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-brand transition-colors duration-200 group-hover:bg-background">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="mt-2 text-center text-xs font-semibold leading-tight">
                        {tp(f.property_type as never)}
                      </span>
                      <span className="mt-0.5 text-[11px] text-muted tabular-nums">
                        {f.listing_count}
                      </span>
                    </Link>
                  );
                })}
              <Link
                href={searchHref}
                className="group flex flex-col items-center justify-center rounded-card px-2 py-3 transition-colors duration-200 hover:bg-brand-soft"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-muted transition-colors duration-200 group-hover:text-brand">
                  <ArrowRightIcon className="h-5 w-5" />
                </span>
                <span className="mt-2 text-center text-xs font-semibold leading-tight">
                  {t("browseAll")}
                </span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Join as an agent — high on the page while the catalogue is cold --- */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-14">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {t("agentCtaTitle")}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-white/70">
                {t("agentCtaBody")}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
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

      {topBanners.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-8">
          <div className={topBanners.length > 1 ? "grid gap-4 lg:grid-cols-2" : ""}>
            {topBanners.map((b) => (
              <PromoBanner key={b.id} banner={b} adLabel={adLabel} />
            ))}
          </div>
        </section>
      )}

      {/* Promotion is stated plainly, not buried in a tooltip (§14). */}
      {promoted.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12">
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

      {latest.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <SectionHeading
            title={t("latestTitle")}
            subtitle={t("latestSubtitle")}
            action={{ href: searchHref, label: t("seeAll") }}
          />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((listing) => (
              <ListingCard key={listing.id} listing={listing} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {middleBanners.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-4">
          <div className={middleBanners.length > 1 ? "grid gap-4 lg:grid-cols-2" : ""}>
            {middleBanners.map((b) => (
              <PromoBanner key={b.id} banner={b} adLabel={adLabel} />
            ))}
          </div>
        </section>
      )}

      {/* Financing. Malaysian buyers shop by monthly instalment at least as
          much as by headline price. */}
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
                <div
                  key={title}
                  className="rounded-card border border-line bg-surface-raised p-5 shadow-card"
                >
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
    </>
  );
}
