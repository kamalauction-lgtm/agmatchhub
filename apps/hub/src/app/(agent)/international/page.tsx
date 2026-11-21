import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { CommandHeader } from "@/components/ui/command-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { GuideLink } from "@/components/help/guide-link";
import { PriceBlock } from "@/components/international/price-block";
import { CountryTag, ListingVisual } from "@/components/international/listing-visual";
import { HOME_COUNTRY, countryCounts, countryName, isCountryCode } from "@/lib/international/countries";
import { intlPhotoUrl, loadIntlListings, loadRates } from "@/lib/international/data";
import { matchesQuery, placeText, rangeText } from "@/lib/international/facts";
import { priceFigures } from "@/lib/international/price";

/**
 * International listings — overseas projects from the partner catalogue, for
 * an agent to find and pass to a buyer.
 *
 * Read through the public views with the agent's own session: what is shown
 * here is exactly what the marketplace shows. The home country is the default
 * tab; "All countries" follows it, then the rest by how much they hold.
 *
 * The catalogue is small (a weekly sync of project launches), so one read
 * feeds the tabs, the counts and the grid, and filtering happens here.
 */

export const dynamic = "force-dynamic";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";
const ALL = "all";

export default async function InternationalPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; q?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const t = await getTranslations("international");
  const locale = await getLocale();
  const format = await getFormatter();

  const [listings, rates] = await Promise.all([loadIntlListings(), loadRates()]);
  const countries = countryCounts(listings, locale);
  const homeCount = countries.find((c) => c.code === HOME_COUNTRY)?.count ?? 0;

  const asked = (sp.country ?? "").trim();
  const askedCode = asked.toUpperCase();
  // Home first by default; when the home country holds nothing yet, an empty
  // first screen would read as "broken", so the default falls back to all.
  const selected =
    asked.toLowerCase() === ALL ? ALL
    : isCountryCode(askedCode) && countries.some((c) => c.code === askedCode) ? askedCode
    : homeCount > 0 ? HOME_COUNTRY
    : ALL;

  const q = (sp.q ?? "").trim().slice(0, 80);
  const inCountry = selected === ALL ? listings : listings.filter((l) => l.country_code === selected);
  const shown = q ? inCountry.filter((l) => matchesQuery(l, q)) : inCountry;

  const href = (country: string, query = q) => {
    const p = new URLSearchParams();
    p.set("country", country === ALL ? ALL : country);
    if (query) p.set("q", query);
    return `/international?${p.toString()}`;
  };

  const tabs = [
    ...countries.filter((c) => c.code === HOME_COUNTRY).map((c) => ({ key: c.code, label: c.name, code: c.code as string | null, count: c.count })),
    { key: ALL, label: t("allCountries"), code: null, count: listings.length },
    ...countries.filter((c) => c.code !== HOME_COUNTRY).map((c) => ({ key: c.code, label: c.name, code: c.code as string | null, count: c.count })),
  ];
  const selectedLabel = selected === ALL ? t("allCountries") : countryName(selected, locale);
  const countriesWithListings = countries.filter((c) => c.count > 0).length;

  return (
    <AgentShell wide>
      <CommandHeader className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            {t("title")}
            <GuideLink slug="international-listings" />
          </h1>
          <p className="command-muted mt-2 text-sm leading-6 sm:text-base">{t("intro")}</p>
        </div>
        <dl className="flex gap-6">
          <div className="flex flex-col-reverse">
            <dt className="command-muted text-sm">{t("statListings")}</dt>
            <dd className="text-3xl font-bold tabular-nums text-white">{format.number(listings.length)}</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="command-muted text-sm">{t("statCountries")}</dt>
            <dd className="text-3xl font-bold tabular-nums text-white">{format.number(countriesWithListings)}</dd>
          </div>
        </dl>
      </CommandHeader>

      {/* Country tabs ------------------------------------------------------ */}
      <nav aria-label={t("countryNav")} className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const on = tab.key === selected;
            return (
              <li key={tab.key}>
                <Link
                  href={href(tab.key)}
                  aria-current={on ? "page" : undefined}
                  data-intl-tab={tab.key}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors duration-150 ${FOCUS} ${
                    on
                      ? "border-transparent bg-crimson-btn text-white"
                      : "border-line bg-card text-foreground hover:border-crimson hover:text-crimson-strong"
                  }`}
                >
                  {tab.code ? (
                    <span aria-hidden className={`font-mono text-[11px] font-bold tracking-wide ${on ? "text-white/85" : "text-muted-strong"}`}>
                      {tab.code}
                    </span>
                  ) : (
                    <Icon name="globe" size={16} />
                  )}
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${on ? "bg-white/20 text-white" : "bg-surface text-muted-strong"}`}>
                    {format.number(tab.count)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Search ------------------------------------------------------------ */}
      <form action="/international" role="search" className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="country" value={selected === ALL ? ALL : selected} />
        <div className="relative min-w-0 flex-1 sm:max-w-xl">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <label htmlFor="intl-q" className="sr-only">{t("searchLabel")}</label>
          <input
            id="intl-q"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={80}
            placeholder={t("searchPlaceholder")}
            className={`h-11 w-full rounded-xl border border-line bg-card pl-10 pr-3.5 text-[15px] outline-none transition-colors duration-150 placeholder:text-muted-strong focus:border-blue ${FOCUS}`}
          />
        </div>
        <button
          type="submit"
          className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-crimson-btn px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-crimson-btn-strong ${FOCUS}`}
        >
          {t("search")}
        </button>
        {q && (
          <Link
            href={href(selected, "")}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-card px-4 text-sm font-semibold text-muted-strong transition-colors duration-150 hover:border-crimson hover:text-crimson-strong ${FOCUS}`}
          >
            {t("clearSearch")}
          </Link>
        )}
      </form>

      <p className="mt-5 text-sm text-muted-strong" aria-live="polite">
        {q
          ? t("resultsFor", { count: shown.length, place: selectedLabel, q })
          : t("results", { count: shown.length, place: selectedLabel })}
      </p>

      {/* Grid -------------------------------------------------------------- */}
      {shown.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={<Icon name="plane" size={36} className="text-muted-strong" />}
          title={q ? t("emptySearchTitle") : t("emptyTitle")}
          action={
            selected !== ALL || q ? (
              <Link
                href={href(ALL, "")}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:border-crimson hover:text-crimson-strong ${FOCUS}`}
              >
                <Icon name="globe" size={18} />
                {t("showAll")}
              </Link>
            ) : undefined
          }
        >
          {q ? t("emptySearchBody") : selected === ALL ? t("emptyBody") : t("emptyCountryBody", { country: selectedLabel })}
        </EmptyState>
      ) : (
        <ul data-intl-grid className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((l, i) => {
            const place = placeText(l);
            const beds = rangeText(l.bedrooms_min, l.bedrooms_max, locale);
            const size = rangeText(l.size_min, l.size_max, locale);
            const country = countryName(l.country_code, locale);
            return (
              <li key={l.id} className="flex">
                <Link
                  href={`/international/${l.slug}`}
                  className={`group flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-card transition-colors duration-200 hover:border-crimson ${FOCUS}`}
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface">
                    <ListingVisual
                      src={intlPhotoUrl(l.cover_path)}
                      alt={l.title}
                      countryCode={l.country_code}
                      place={l.city ?? l.region ?? country}
                      caption={t("photosSoon")}
                      eager={i < 4}
                    />
                    {l.is_featured && (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-bold text-foreground shadow-card">
                        <Icon name="star" size={14} className="text-warning" />
                        {t("featured")}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-strong">
                      <CountryTag code={l.country_code} name={country} />
                      {l.property_type_label && <Badge tone="neutral" className="shrink-0">{l.property_type_label}</Badge>}
                    </div>

                    <h2 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-foreground transition-colors duration-200 group-hover:text-crimson-strong">
                      {l.title}
                    </h2>
                    {place && (
                      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-strong">
                        <Icon name="map-pin" size={16} className="mt-0.5" />
                        <span className="line-clamp-1">{place}</span>
                      </p>
                    )}

                    {(beds || size) && (
                      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground">
                        {beds && (
                          <li className="inline-flex items-center gap-1.5">
                            <Icon name="bed" size={16} className="text-muted-strong" />
                            {t("bedrooms", { range: beds })}
                          </li>
                        )}
                        {size && (
                          <li className="inline-flex items-center gap-1.5">
                            <Icon name="maximize" size={16} className="text-muted-strong" />
                            {t(l.size_unit === "sqft" ? "sizeSqft" : "sizeSqm", { range: size })}
                          </li>
                        )}
                      </ul>
                    )}

                    <div className="mt-4 border-t border-line pt-4">
                      <PriceBlock price={priceFigures(l, rates)} />
                    </div>

                    <div className="mt-auto pt-4">
                      <p className="flex min-h-11 items-center justify-between gap-2 border-t border-line pt-3 text-sm">
                        <span className="inline-flex min-w-0 items-center gap-2 text-muted-strong">
                          <Icon name="user" size={16} />
                          <span className="truncate">
                            {l.contact_name ? t("picLine", { name: l.contact_name }) : t("picNone")}
                          </span>
                        </span>
                        <Icon name="arrow-right" size={18} className="text-muted transition-colors duration-200 group-hover:text-crimson-strong" />
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AgentShell>
  );
}
