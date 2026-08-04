import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { searchListings, type SearchParams } from "@/lib/listings";
import { ListingCard } from "@/components/listing-card";
import { SearchBar } from "@/components/search-bar";
import { routing } from "@/i18n/routing";

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

  const base = locale === routing.defaultLocale ? "/cari" : `/${locale}/cari`;

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

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">
          {t("resultCount", { count: total })}
        </h1>

        <nav aria-label={t("sort")} className="flex flex-wrap gap-1.5 text-sm">
          {sorts.map(([value, label]) => {
            const active = (parsed.sort ?? "relevance") === value;
            return (
              <Link
                key={value}
                href={buildHref(base, parsed, { sort: value, page: 1 })}
                aria-current={active ? "true" : undefined}
                className={`rounded-lg border px-3 py-1.5 font-medium ${
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-line hover:bg-surface"
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
          <p className="font-semibold">{t("noResults")}</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t("noResultsHelp")}</p>
          <Link
            href={base}
            className="mt-5 inline-flex rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface"
          >
            {t("clearFilters")}
          </Link>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="mt-10 flex items-center justify-between gap-4" aria-label="pagination">
          {page > 1 ? (
            <Link
              href={buildHref(base, parsed, { page: page - 1 })}
              rel="prev"
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface"
            >
              ← {t("previous")}
            </Link>
          ) : (
            <span />
          )}

          <span className="text-sm text-muted">
            {t("pageOf", { page, total: pageCount })}
          </span>

          {page < pageCount ? (
            <Link
              href={buildHref(base, parsed, { page: page + 1 })}
              rel="next"
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface"
            >
              {t("next")} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
