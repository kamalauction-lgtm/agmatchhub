import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { searchListings, type SearchParams } from "@/lib/listings";
import { ListingCard } from "@/components/listing-card";
import { SearchBar } from "@/components/search-bar";
import { ActiveFilters, type ActiveFilter } from "@/components/active-filters";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "@/components/icons";
import { publicPath } from "@/i18n/routing";
import { market } from "@/config/market";
import { formatPriceExact } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "search" });
  return { title: t("title") };
}

type RawParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function num(v: string | string[] | undefined): number | undefined {
  const s = one(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Only values we recognise reach the query builder. */
function parseParams(raw: RawParams): SearchParams {
  const type = one(raw.type);
  const sort = one(raw.sort);
  return {
    q: one(raw.q)?.slice(0, 120),
    type: type === "sale" || type === "rent" ? type : undefined,
    category: one(raw.category)?.slice(0, 40),
    propertyType: one(raw.propertyType)?.slice(0, 40),
    minPrice: num(raw.minPrice),
    maxPrice: num(raw.maxPrice),
    bedrooms: num(raw.bedrooms),
    bathrooms: num(raw.bathrooms),
    locationId: one(raw.locationId),
    sort:
      sort === "newest" || sort === "price_asc" || sort === "price_desc" ? sort : "relevance",
    page: num(raw.page) || 1,
  };
}

function buildHref(base: string, params: SearchParams, overrides: Partial<SearchParams>): string {
  const merged = { ...params, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== "" && !(k === "page" && v === 1)) {
      qs.set(k, String(v));
    }
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("search");
  const raw = await searchParams;
  const parsed = parseParams(raw);
  const { listings, total, page, pageCount } = await searchListings(parsed);

  // Pagination, sort and filter links all hang off this, so it has to be the
  // PUBLIC segment — otherwise every one of them points at /cari and takes a
  // redirect hop on the Malaysian site.
  const base = publicPath(locale, "search");

  /* Every narrowing the query string applies, as its own removable chip.
     `undefined` on the override drops the key from the URL entirely, so each
     chip is simply "this search minus one filter". */
  const tType = await getTranslations("propertyType");
  /* Was a bare number with the message supplying "Rp". That hard-coded the
     rupiah into the English message file, so a Malaysian build rendered
     "Min Rp1,000,000". The symbol now comes from the market's currency. */
  const money = (n: number) => formatPriceExact(n, market.currency, locale);

  const filterCandidates: Array<ActiveFilter | null> = [
    parsed.q
      ? { key: "q", label: `"${parsed.q}"`, removeHref: buildHref(base, parsed, { q: undefined, page: 1 }) }
      : null,
    parsed.type
      ? {
          key: "type",
          label: parsed.type === "sale" ? t("filterSale") : t("filterRent"),
          removeHref: buildHref(base, parsed, { type: undefined, page: 1 }),
        }
      : null,
    parsed.propertyType
      ? {
          key: "propertyType",
          label: tType(parsed.propertyType as never) || parsed.propertyType,
          removeHref: buildHref(base, parsed, { propertyType: undefined, page: 1 }),
        }
      : null,
    parsed.category
      ? { key: "category", label: parsed.category, removeHref: buildHref(base, parsed, { category: undefined, page: 1 }) }
      : null,
    parsed.minPrice !== undefined
      ? {
          key: "minPrice",
          label: t("filterMinPrice", { amount: money(parsed.minPrice) }),
          removeHref: buildHref(base, parsed, { minPrice: undefined, page: 1 }),
        }
      : null,
    parsed.maxPrice !== undefined
      ? {
          key: "maxPrice",
          label: t("filterMaxPrice", { amount: money(parsed.maxPrice) }),
          removeHref: buildHref(base, parsed, { maxPrice: undefined, page: 1 }),
        }
      : null,
    parsed.bedrooms !== undefined
      ? {
          key: "bedrooms",
          label: t("filterBedrooms", { count: parsed.bedrooms }),
          removeHref: buildHref(base, parsed, { bedrooms: undefined, page: 1 }),
        }
      : null,
    parsed.bathrooms !== undefined
      ? {
          key: "bathrooms",
          label: t("filterBathrooms", { count: parsed.bathrooms }),
          removeHref: buildHref(base, parsed, { bathrooms: undefined, page: 1 }),
        }
      : null,
  ];
  const activeFilters = filterCandidates.filter((f): f is ActiveFilter => f !== null);

  const sorts = [
    ["relevance", t("sortRelevance")],
    ["newest", t("sortNewest")],
    ["price_asc", t("sortPriceAsc")],
    ["price_desc", t("sortPriceDesc")],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <SearchBar
        locale={locale}
        size="compact"
        defaultType={parsed.type ?? "sale"}
        defaultQuery={parsed.q ?? ""}
      />

      {activeFilters.length > 0 && (
        <div className="mt-5">
          <ActiveFilters
            filters={activeFilters}
            clearHref={base}
            clearLabel={t("clearFilters")}
            removeLabelPrefix={t("removeFilter")}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">
          {t("resultCount", { count: total })}
        </h1>

        {/* Segmented rather than four separate buttons: it reads as one
            control with one value, which is what it is. */}
        <nav
          aria-label={t("sort")}
          className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1 text-sm"
        >
          {sorts.map(([value, label]) => {
            const active = (parsed.sort ?? "relevance") === value;
            return (
              <Link
                key={value}
                href={buildHref(base, parsed, { sort: value, page: 1 })}
                aria-current={active ? "true" : undefined}
                className={`cursor-pointer rounded-md px-3 py-1.5 font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  active
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted hover:bg-surface-raised hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {listings.length > 0 ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing, i) => (
            <ListingCard key={listing.id} listing={listing} locale={locale} priority={i < 3} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-card border border-dashed border-line px-6 py-16 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
            <SearchIcon className="h-6 w-6" />
          </span>
          <p className="mt-4 font-semibold">{t("noResults")}</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t("noResultsHelp")}</p>
          <Link
            href={base}
            className="mt-5 inline-flex cursor-pointer rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("clearFilters")}
          </Link>
        </div>
      )}

      {pageCount > 1 && (
        <nav
          className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-6"
          aria-label={t("pagination")}
        >
          {page > 1 ? (
            <Link
              href={buildHref(base, parsed, { page: page - 1 })}
              rel="prev"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold transition-colors duration-200 hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}

          <span className="text-sm text-muted">{t("pageOf", { page, total: pageCount })}</span>

          {page < pageCount ? (
            <Link
              href={buildHref(base, parsed, { page: page + 1 })}
              rel="next"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold transition-colors duration-200 hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {t("next")}
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

    </div>
  );
}
