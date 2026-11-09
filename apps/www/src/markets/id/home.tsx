import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ListingCard } from "@/components/listing-card";
import { SearchBar } from "@/components/search-bar";
import { KprCalculator } from "@/components/kpr-calculator";
import { PromoBanner } from "@/components/promo-banner";
import { SectionHeading } from "@/components/section-heading";
import { ConciergeForm } from "@/components/concierge-form";
import { RuleBasedNotice } from "@/components/rule-based-notice";
import { CompareTray } from "@/components/compare-tray";
import {
  ArrowRightIcon, BoltIcon, BuildingIcon, HomeIcon, KeyIcon, LockIcon,
  ShieldIcon, SparkIcon, TreeIcon,
} from "@/components/icons";
import { publicPath } from "@/i18n/routing";
import type { HomeData } from "../types";

/**
 * Indonesia's homepage — PropertiGuru 2.0.
 *
 * The 1.0 page (Rumah123-shaped: tabbed search, rails, SEO grid) is kept in
 * structure; what changes is the top of the page and the visual layer. The
 * hero now leads with the rule-based concierge — type what you want in plain
 * words — with the classic filter search one step below it, and the whole
 * surface moves to the hub's command-band palette: deep navy, electric blue
 * for actions, a restrained gold for premium cues.
 *
 * Honesty rules carried over unchanged: promoted stays labelled, empty
 * sections do not render, counts are real, and the assistant is described as
 * rule-based wherever it appears. Synthetic listings carry a DEMO badge.
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
  const tc = await getTranslations("compare");

  const assistantHref = publicPath(locale, "assistant");
  const compareHref = publicPath(locale, "compare");
  const featured = promoted.length > 0 ? promoted : latest.slice(0, 3);
  const whyIcons = { whyVerifiedTitle: ShieldIcon, whyFastTitle: BoltIcon, whyProtectedTitle: LockIcon };

  return (
    <>
      {/* Hero — command band -------------------------------------------- */}
      <section className="command-band relative overflow-hidden">
        <div aria-hidden className="command-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:pb-24 sm:pt-20">
          <div className="rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-command-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-command-gold" />
            {t("heroEyebrow")}
          </div>
          <h1 className="rise rise-2 mt-5 max-w-3xl text-[2.4rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            {t("heroTitle2")}
            <span className="block bg-gradient-to-r from-command-link to-white bg-clip-text text-transparent">
              {t("heroTitle2Accent")}
            </span>
          </h1>
          <p className="rise rise-3 mt-5 max-w-xl text-base text-command-muted sm:text-lg">
            {t("heroSubtitle2", { country })}
          </p>

          <div className="rise rise-3 mt-8 max-w-3xl">
            <ConciergeForm
              action={assistantHref}
              onDark
              placeholder={t("conciergePlaceholder")}
              submitLabel={t("conciergeSubmit")}
              examplesLabel={t("conciergeExamplesLabel")}
              examples={[t("conciergeExample1"), t("conciergeExample2"), t("conciergeExample3")]}
            />
            <div className="mt-3">
              <RuleBasedNotice tone="dark" title={t("ruleTitle")} body={t("ruleBody")} />
            </div>
          </div>

          <details className="mt-6 max-w-3xl">
            <summary className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-command-link hover:text-white">
              {t("orFilters")}
              <ArrowRightIcon className="h-4 w-4" />
            </summary>
            <div className="mt-3">
              <SearchBar locale={locale} advanced onDark />
            </div>
          </details>

          {cityFacets.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <span className="text-sm text-command-muted">{t("popularSearches")}</span>
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
                    <span className="block text-2xl font-bold tracking-tight">{value}</span>
                    <span className="mt-0.5 block text-xs font-medium uppercase tracking-wide text-command-muted">{label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* Featured ------------------------------------------------------------ */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-12">
          <SectionHeading
            eyebrow={promoted.length > 0 ? adLabel : t("featuredEyebrow")}
            title={promoted.length > 0 ? t("promotedTitle") : t("featuredTitle")}
            subtitle={promoted.length > 0 ? t("promotedSubtitle") : t("featuredSubtitle")}
            action={{ href: searchHref, label: t("seeAll") }}
          />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.slice(0, 3).map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} locale={locale} priority={i < 3} />
            ))}
          </div>
        </section>
      )}

      {/* Browse by category --------------------------------------------------- */}
      {typeFacets.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-14">
          <SectionHeading title={t("browseTypeTitle")} subtitle={t("browseTypeSubtitle")} />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {typeFacets.filter((f) => f.listing_count > 0).map((f) => {
              const Icon = TYPE_ICONS[f.property_type] ?? HomeIcon;
              return (
                <Link
                  key={f.property_type}
                  href={`${searchHref}?propertyType=${encodeURIComponent(f.property_type)}`}
                  className="group flex flex-col items-center rounded-2xl border border-line bg-surface-raised p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-electric/50 hover:shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-electric-soft text-electric transition-colors duration-200 group-hover:bg-electric group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="mt-2.5 text-center text-sm font-semibold leading-tight">{tp(f.property_type as never)}</span>
                  <span className="mt-0.5 text-xs text-muted tabular-nums">{t("listingCount", { count: f.listing_count })}</span>
                </Link>
              );
            })}
            <Link
              href={searchHref}
              className="group flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong p-4 transition-colors duration-200 hover:border-electric focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface text-muted transition-colors duration-200 group-hover:text-electric">
                <ArrowRightIcon className="h-5 w-5" />
              </span>
              <span className="mt-2.5 text-center text-sm font-semibold leading-tight">{t("browseAll")}</span>
            </Link>
          </div>
        </section>
      )}

      {topBanners.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-8">
          <div className={topBanners.length > 1 ? "grid gap-4 lg:grid-cols-2" : ""}>
            {topBanners.map((b) => <PromoBanner key={b.id} banner={b} adLabel={adLabel} />)}
          </div>
        </section>
      )}

      {/* Latest ------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <SectionHeading
          title={t("latestTitle")}
          subtitle={t("latestSubtitle")}
          action={{ href: searchHref, label: t("seeAll") }}
        />
        {latest.length > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((listing) => (
              <ListingCard key={listing.id} listing={listing} locale={locale} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center text-muted">
            <p>{t("latestSubtitle")}</p>
          </div>
        )}
      </section>

      {/* Concierge band ----------------------------------------------------- */}
      <section className="command-band relative overflow-hidden">
        <div aria-hidden className="command-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-command-gold">
                <SparkIcon className="h-4 w-4" />
                {t("conciergeBandEyebrow")}
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{t("conciergeBandTitle")}</h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-command-muted">{t("conciergeBandBody")}</p>
              <Link
                href={assistantHref}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong"
              >
                {t("conciergeCta")}
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
            <ol className="grid gap-3">
              {([1, 2, 3] as const).map((n) => (
                <li key={n} className="glass flex gap-4 rounded-2xl p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-electric text-sm font-bold text-white">{n}</span>
                  <div>
                    <p className="font-semibold">{t(`step${n}Title`)}</p>
                    <p className="mt-1 text-sm text-command-muted">{t(`step${n}Body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-8 max-w-3xl">
            <RuleBasedNotice tone="dark" title={t("ruleTitle")} body={t("ruleBody")} />
          </div>
        </div>
      </section>

      {middleBanners.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-10">
          <div className={middleBanners.length > 1 ? "grid gap-4 lg:grid-cols-2" : ""}>
            {middleBanners.map((b) => <PromoBanner key={b.id} banner={b} adLabel={adLabel} size="tall" />)}
          </div>
        </section>
      )}

      {/* Browse by city ------------------------------------------------------- */}
      {cityFacets.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14">
          <SectionHeading title={t("byCityTitle")} subtitle={t("byCitySubtitle")} />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {cityFacets.map((c) => (
              <Link
                key={c.regency_name}
                href={`${searchHref}?q=${encodeURIComponent(c.regency_name)}`}
                className="group rounded-2xl border border-line bg-surface-raised p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-electric/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric"
              >
                <p className="font-semibold group-hover:text-electric">{c.regency_name}</p>
                {c.province_name && <p className="text-xs text-muted">{c.province_name}</p>}
                <p className="mt-1 text-sm text-muted">{t("listingCount", { count: c.listing_count })}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* KPR ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 pb-14">
        <KprCalculator
          searchHref={searchHref}
          labels={{
            title: t("kpr.title"), intro: t("kpr.intro"), price: t("kpr.price"),
            downPayment: t("kpr.downPayment"), rate: t("kpr.rate"), years: t("kpr.years"),
            monthly: t("kpr.monthly"), loanAmount: t("kpr.loanAmount"),
            disclaimer: t("kpr.disclaimer"), cta: t("kpr.cta"),
          }}
        />
      </section>

      {/* Why us -------------------------------------------------------------- */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <SectionHeading title={t("whyTitle")} />
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {([
              ["whyVerifiedTitle", "whyVerifiedBody"],
              ["whyFastTitle", "whyFastBody"],
              ["whyProtectedTitle", "whyProtectedBody"],
            ] as const).map(([title, body]) => {
              const Icon = whyIcons[title];
              return (
                <div key={title} className="rounded-2xl border border-line bg-surface-raised p-5 shadow-card">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-electric-soft text-electric">
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

      {/* Agent CTA ------------------------------------------------------------ */}
      <section className="command-band">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("agentCtaTitle")}</h2>
            <p className="mt-3 text-base leading-relaxed text-command-muted">{t("agentCtaBody")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={`${hubUrl}/register`} className="rounded-xl bg-electric px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong">
                {t("agentCtaPrimary")}
              </a>
              <a href={`${hubUrl}/login`} className="rounded-xl border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10">
                {t("agentCtaSecondary")}
              </a>
            </div>
          </div>
        </div>
      </section>

      {provinces.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("byProvinceTitle")}</h2>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {provinces.map((p) => (
                <Link key={p.name} href={`${searchHref}?q=${encodeURIComponent(p.name)}`} className="text-muted hover:text-electric hover:underline">
                  {t("propertyIn", { place: p.name })}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CompareTray
        compareHref={compareHref}
        labels={{ title: tc("tray.title"), cta: tc("tray.cta"), clear: tc("tray.clear"), of: tc("tray.of") }}
      />
    </>
  );
}
