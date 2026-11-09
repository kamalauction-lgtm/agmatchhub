import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { displayTitle, getListingsByIds, isDemoListing, type PublicListing } from "@/lib/listings";
import { formatArea, formatPriceExact, formatRentPeriod, joinPlaceParts, mediaUrl, pricePerArea } from "@/lib/format";
import { publicPath, routing } from "@/i18n/routing";
import { DemoBadge } from "@/components/demo-badge";
import { RuleBasedNotice } from "@/components/rule-based-notice";
import { ArrowRightIcon, CheckBadgeIcon, CloseIcon, ImageOffIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "compare" });
  return { title: t("title") };
}

type Row = {
  key: string;
  label: string;
  values: (string | null)[];
  /** Index of the "best" column by a stated rule, or null when no rule applies. */
  best: number | null;
  bestLabel?: string;
};

function argBest(nums: (number | null)[], mode: "min" | "max"): number | null {
  let idx: number | null = null;
  nums.forEach((n, i) => {
    if (n == null) return;
    if (idx === null) idx = i;
    else if (mode === "min" ? n < (nums[idx] as number) : n > (nums[idx] as number)) idx = i;
  });
  // Only meaningful when at least two columns have a value.
  return nums.filter((n) => n != null).length >= 2 ? idx : null;
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tl, tp, tOwn, tFurn, tCond, th] = await Promise.all([
    getTranslations("compare"), getTranslations("listing"), getTranslations("propertyType"),
    getTranslations("ownership"), getTranslations("furnishing"), getTranslations("condition"), getTranslations("home"),
  ]);

  const sp = await searchParams;
  const rawIds = (Array.isArray(sp.ids) ? sp.ids.join(",") : sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const listings = await getListingsByIds(rawIds);
  const self = publicPath(locale, "compare");
  const searchHref = publicPath(locale, "search");
  const listingHref = (l: PublicListing) => {
    const p = publicPath(locale, "listing", `/${l.slug}`);
    return locale === routing.defaultLocale ? p : `/${locale}${p}`;
  };
  const removeHref = (id: string) => {
    const rest = listings.map((l) => l.id).filter((x) => x !== id);
    return rest.length ? `${self}?ids=${rest.join(",")}` : self;
  };

  const str = (v: string | number | null | undefined) => (v == null || v === "" ? null : String(v));
  const rows: Row[] = listings.length
    ? [
        {
          key: "price", label: t("rows.price"),
          values: listings.map((l) => `${formatPriceExact(l.price, l.currency, locale)}${formatRentPeriod(l.rent_period, locale)}`),
          best: argBest(listings.map((l) => l.price), "min"), bestLabel: t("best.lowestPrice"),
        },
        {
          key: "ppa", label: t("rows.pricePerArea"),
          values: listings.map((l) => pricePerArea(l.price, l.building_size ?? l.land_size, l.currency)),
          best: argBest(listings.map((l) => (l.price && (l.building_size ?? l.land_size) ? l.price / (l.building_size ?? l.land_size)! : null)), "min"),
          bestLabel: t("best.lowestPerArea"),
        },
        { key: "tx", label: t("rows.transaction"), values: listings.map((l) => (l.listing_type === "sale" ? tl("forSale") : tl("forRent"))), best: null },
        { key: "type", label: t("rows.type"), values: listings.map((l) => tp(l.property_type as never) || l.property_type), best: null },
        { key: "loc", label: t("rows.location"), values: listings.map((l) => joinPlaceParts([l.district_name, l.regency_name, l.province_name]) || null), best: null },
        {
          key: "bed", label: t("rows.bedrooms"), values: listings.map((l) => str(l.bedrooms)),
          best: argBest(listings.map((l) => l.bedrooms), "max"), bestLabel: t("best.mostRooms"),
        },
        { key: "bath", label: t("rows.bathrooms"), values: listings.map((l) => str(l.bathrooms)), best: null },
        {
          key: "bld", label: t("rows.building"), values: listings.map((l) => (l.building_size != null ? formatArea(l.building_size, l.measurement_unit, locale) : null)),
          best: argBest(listings.map((l) => l.building_size), "max"), bestLabel: t("best.largest"),
        },
        {
          key: "land", label: t("rows.land"), values: listings.map((l) => (l.land_size != null ? formatArea(l.land_size, l.measurement_unit, locale) : null)),
          best: argBest(listings.map((l) => l.land_size), "max"), bestLabel: t("best.largest"),
        },
        { key: "park", label: t("rows.parking"), values: listings.map((l) => str(l.parking_spaces)), best: null },
        { key: "floors", label: t("rows.floors"), values: listings.map((l) => str(l.floors)), best: null },
        {
          key: "year", label: t("rows.year"), values: listings.map((l) => str(l.year_built)),
          best: argBest(listings.map((l) => l.year_built), "max"), bestLabel: t("best.newest"),
        },
        { key: "furn", label: t("rows.furnishing"), values: listings.map((l) => (l.furnishing ? tFurn(l.furnishing as never) : null)), best: null },
        { key: "cond", label: t("rows.condition"), values: listings.map((l) => (l.property_condition ? tCond(l.property_condition as never) : null)), best: null },
        { key: "cert", label: t("rows.certificate"), values: listings.map((l) => (l.ownership_type ? tOwn(l.ownership_type as never) : null)), best: null },
        { key: "fac", label: t("rows.facilities"), values: listings.map((l) => (l.facilities.length ? l.facilities.join(", ") : null)), best: null },
        { key: "agent", label: t("rows.agent"), values: listings.map((l) => l.agent_display_name), best: null },
      ].filter((r) => r.values.some((v) => v != null))
    : [];

  const cols = Math.max(listings.length, 1);

  return (
    <>
      <section className="command-band">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-command-gold">{t("eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-command-muted">{t("subtitle")}</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8">
        {listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
            <p className="text-lg font-semibold">{t("empty")}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t("emptyBody")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href={searchHref} className="inline-flex items-center gap-2 rounded-xl bg-electric px-5 py-2.5 text-sm font-semibold text-white hover:bg-electric-strong">
                {t("pickFromSearch")} <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link href={publicPath(locale, "assistant")} className="inline-flex items-center rounded-xl border border-line px-5 py-2.5 text-sm font-semibold hover:border-electric hover:text-electric">
                {t("pickFromAssistant")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <RuleBasedNotice title={t("ruleTitle")} body={t("ruleBody")} />

            <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface-raised shadow-card">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="align-top">
                    <th scope="col" className="sticky left-0 z-10 w-40 bg-surface-raised p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("property")}
                    </th>
                    {listings.map((l) => {
                      const img = mediaUrl(l.cover_thumbnail_path ?? l.cover_image_path);
                      const title = displayTitle(l.title);
                      return (
                        <th key={l.id} scope="col" className="p-3 text-left font-normal" style={{ width: `${100 / cols}%` }}>
                          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface">
                            {img ? (
                              <Image src={img} alt={l.cover_alt_text ?? title} fill sizes="25vw" className="object-cover" />
                            ) : (
                              <div className="grid h-full place-items-center text-muted"><ImageOffIcon className="h-6 w-6" /></div>
                            )}
                            <Link
                              href={removeHref(l.id)}
                              aria-label={t("remove")}
                              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-foreground shadow hover:bg-white"
                            >
                              <CloseIcon className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {isDemoListing(l) && <DemoBadge label={tl("demo")} />}
                            {l.is_verified && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-success">
                                <CheckBadgeIcon className="h-3.5 w-3.5" /> {tl("verified")}
                              </span>
                            )}
                          </div>
                          <Link href={listingHref(l)} className="mt-1.5 line-clamp-2 block font-semibold leading-snug hover:text-electric">
                            {title}
                          </Link>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={r.key} className={ri % 2 ? "bg-surface/60" : ""}>
                      <th scope="row" className="sticky left-0 z-10 bg-inherit p-3 text-left align-top text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur">
                        {r.label}
                      </th>
                      {r.values.map((v, i) => (
                        <td key={i} className={`p-3 align-top ${r.key === "price" ? "text-base font-extrabold text-electric" : "font-medium"}`}>
                          {v ?? <span className="text-muted">—</span>}
                          {r.best === i && r.bestLabel && (
                            <span className="ml-1.5 inline-block rounded-md bg-gold-light/40 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-gold-ink">
                              {r.bestLabel}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="sticky left-0 z-10 bg-surface-raised p-3" />
                    {listings.map((l) => (
                      <td key={l.id} className="p-3">
                        <Link
                          href={`${listingHref(l)}#enquiry`}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-electric px-3 py-2.5 text-sm font-semibold text-white hover:bg-electric-strong"
                        >
                          {t("inquire")}
                        </Link>
                        <Link href={listingHref(l)} className="mt-2 block text-center text-xs font-semibold text-electric hover:underline">
                          {t("view")}
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {listings.length < 4 && (
              <p className="mt-5 text-sm text-muted">
                {t("addMore")}{" "}
                <Link href={searchHref} className="font-semibold text-electric hover:underline">{th("seeAll")}</Link>
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
