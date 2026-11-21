import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  countryName,
  formatRateDate,
  getFxRates,
  getInternationalCountryCounts,
  homeCountry,
  priceFigures,
  searchInternational,
  type InternationalSort,
} from "@/lib/international";
import { InternationalCard } from "@/components/international-card";
import { CountryBadge } from "@/components/international-country";
import { ChevronLeftIcon, ChevronRightIcon, GlobeIcon, SearchIcon } from "@/components/icons";
import { publicPath } from "@/i18n/routing";
import { market } from "@/config/market";
import { formatCount } from "@/lib/format";
import { requireLocale } from "@/i18n/require-locale";

/**
 * International listings — the list.
 *
 * The home country's tab is first and is what a visitor lands on; "all
 * countries" is second; the rest follow by how many projects each has. Which
 * countries exist is read from the data, so a country appears here the week
 * its first project is synced and disappears when its last one is withdrawn.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  requireLocale(locale);
  const t = await getTranslations({ locale, namespace: "international" });
  const title = t("title");
  const description = t("metaDescription");

  return {
    title,
    description,
    alternates: {
      canonical: publicPath(locale, "international"),
      languages: Object.fromEntries(market.locales.map((l) => [l, publicPath(l, "international")])),
    },
    openGraph: { title, description, type: "website" },
  };
}

type RawParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ALL = "all";

type View = { country: string; q?: string; sort: InternationalSort; page: number };

export default async function InternationalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawParams>;
}) {
  const { locale } = await params;
  requireLocale(locale);
  setRequestLocale(locale);

  const raw = await searchParams;
  const [t, counts, rates] = await Promise.all([
    getTranslations("international"),
    getInternationalCountryCounts(),
    getFxRates(),
  ]);

  const totalAll = counts.reduce((sum, c) => sum + c.count, 0);
  const homeCount = counts.find((c) => c.code === homeCountry)?.count ?? 0;
  // With nothing at home yet, landing on an empty tab would be a dead end.
  const defaultCountry = homeCount > 0 ? homeCountry : ALL;

  // Only values we recognise reach the query builder.
  const rawCountry = (one(raw.country) ?? "").toUpperCase();
  const pageNumber = Number(one(raw.page));
  const view: View = {
    country: rawCountry === "ALL" ? ALL : /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : defaultCountry,
    q: one(raw.q)?.trim().slice(0, 120) || undefined,
    sort: one(raw.sort) === "price_asc" ? "price_asc" : "newest",
    page: Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };

  const { listings, total, page, pageCount } = await searchInternational(
    { country: view.country === ALL ? undefined : view.country, q: view.q, sort: view.sort, page: view.page },
    rates
  );

  const base = publicPath(locale, "international");
  const hrefFor = (overrides: Partial<View>): string => {
    const next = { ...view, ...overrides };
    const qs = new URLSearchParams();
    if (next.country !== defaultCountry) qs.set("country", next.country === ALL ? ALL : next.country);
    if (next.q) qs.set("q", next.q);
    if (next.sort !== "newest") qs.set("sort", next.sort);
    if (next.page > 1) qs.set("page", String(next.page));
    const s = qs.toString();
    return s ? `${base}?${s}` : base;
  };

  const tabs = [
    ...(homeCount > 0 ? [{ code: homeCountry as string, count: homeCount }] : []),
    { code: ALL, count: totalAll },
    ...counts.filter((c) => c.code !== homeCountry),
  ];

  const sorts: Array<[InternationalSort, string]> = [
    ["newest", t("sortNewest")],
    ["price_asc", t("sortPriceAsc")],
  ];

  // The oldest rate behind any estimate on this page — the date the footnote names.
  const rateDates = listings
    .map((l) => priceFigures(l.currency, l.price_min, l.price_max, rates).asOf)
    .filter((d): d is string => !!d)
    .sort();
  const rateDate = formatRateDate(rateDates[0] ?? null, locale);

  const selectedName = view.country === ALL ? t("allCountries") : countryName(view.country, locale);
  const chip =
    "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-200";

  return (
    <>
      <section className="command-band relative overflow-hidden">
        <div aria-hidden className="command-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:py-12">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-command-gold">
            <GlobeIcon className="h-4 w-4" />
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-command-muted sm:text-base">
            {t("subtitle")}
          </p>

          <form action={base} method="get" role="search" className="mt-6 max-w-2xl">
            {view.country !== defaultCountry && <input type="hidden" name="country" value={view.country} />}
            {view.sort !== "newest" && <input type="hidden" name="sort" value={view.sort} />}
            <label htmlFor="intl-q" className="text-xs font-semibold uppercase tracking-wide text-command-muted">
              {t("searchLabel")}
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input
                  id="intl-q"
                  name="q"
                  type="search"
                  defaultValue={view.q ?? ""}
                  maxLength={120}
                  placeholder={t("searchPlaceholder")}
                  className="min-h-12 w-full rounded-xl border border-line bg-background pl-10 pr-3 text-foreground placeholder:text-muted"
                />
              </div>
              <button
                type="submit"
                className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-electric px-6 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong"
              >
                {t("searchButton")}
              </button>
            </div>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
        {totalAll > 0 && (
          <nav aria-label={t("countriesLabel")} className="min-w-0">
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {tabs.map((tab) => {
                const active = view.country === tab.code;
                return (
                  <li key={tab.code} className="shrink-0">
                    <Link
                      href={hrefFor({ country: tab.code, page: 1 })}
                      aria-current={active ? "page" : undefined}
                      className={`${chip} ${
                        active
                          ? "border-electric bg-electric text-white"
                          : "border-line bg-surface-raised text-muted-strong hover:border-electric/50 hover:text-foreground"
                      }`}
                    >
                      {tab.code === ALL ? (
                        <>
                          <GlobeIcon className="h-4 w-4" />
                          {t("allCountries")}
                        </>
                      ) : (
                        <CountryBadge code={tab.code} name={countryName(tab.code, locale)} />
                      )}
                      <span
                        className={`rounded-full px-1.5 text-xs font-bold ${
                          active ? "bg-white/20" : "bg-surface text-muted"
                        }`}
                      >
                        {formatCount(tab.count, locale)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">
            {t("resultCount", { count: total })}
            <span className="font-medium text-muted"> · {selectedName}</span>
          </h2>
          <nav aria-label={t("sortLabel")} className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
            {sorts.map(([value, label]) => {
              const active = view.sort === value;
              return (
                <Link
                  key={value}
                  href={hrefFor({ sort: value, page: 1 })}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 font-medium transition-colors duration-200 sm:min-h-9 ${
                    active
                      ? "bg-electric text-white shadow-sm"
                      : "text-muted hover:bg-surface-raised hover:text-foreground"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {view.q && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="rounded-full border border-line bg-surface px-3 py-1 font-medium text-foreground">
              “{view.q}”
            </span>
            <Link
              href={hrefFor({ q: undefined, page: 1 })}
              className="inline-flex min-h-11 items-center font-semibold text-electric hover:text-electric-strong"
            >
              {t("clearSearch")}
            </Link>
          </p>
        )}

        {listings.length > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {listings.map((listing, i) => (
              <InternationalCard key={listing.id} listing={listing} rates={rates} locale={locale} priority={i < 3} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-electric-soft text-electric">
              <GlobeIcon className="h-6 w-6" />
            </span>
            <p className="mt-4 font-semibold">{totalAll > 0 ? t("emptyTitle") : t("emptyNoneTitle")}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              {totalAll > 0 ? t("emptyBody") : t("emptyNoneBody")}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {totalAll > 0 && (view.q || view.country !== ALL) && (
                <Link
                  href={hrefFor({ country: ALL, q: undefined, page: 1 })}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-electric px-5 text-sm font-semibold text-white hover:bg-electric-strong"
                >
                  {t("emptyAll")}
                </Link>
              )}
              <Link
                href={publicPath(locale, "search")}
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold hover:border-electric hover:text-electric"
              >
                {t("emptyLocal")}
              </Link>
            </div>
          </div>
        )}

        {pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-6" aria-label={t("pagination")}>
            {page > 1 ? (
              <Link
                href={hrefFor({ page: page - 1 })}
                rel="prev"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-semibold hover:border-electric hover:text-electric"
              >
                <ChevronLeftIcon className="h-4 w-4" /> {t("previous")}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-muted">{t("pageOf", { page, total: pageCount })}</span>
            {page < pageCount ? (
              <Link
                href={hrefFor({ page: page + 1 })}
                rel="next"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm font-semibold hover:border-electric hover:text-electric"
              >
                {t("next")} <ChevronRightIcon className="h-4 w-4" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}

        {rateDate && (
          <p className="mt-10 max-w-3xl text-xs leading-relaxed text-muted">
            {t("estimateNote", { date: rateDate })}{" "}
            {t("ownCurrencyNoteList")}
          </p>
        )}
      </div>
    </>
  );
}
