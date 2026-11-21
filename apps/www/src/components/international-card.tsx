import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { displayTitle, isDemoListing } from "@/lib/listings";
import { joinPlaceParts, mediaUrl } from "@/lib/format";
import {
  bedroomsLabel,
  countryName,
  priceFigures,
  sizeLabel,
  type FxRates,
  type InternationalListing,
} from "@/lib/international";
import { publicPath } from "@/i18n/routing";
import { AreaIcon, BedIcon, BuildingIcon, PinIcon } from "./icons";
import { DemoBadge } from "./demo-badge";
import { CountryBadge } from "./international-country";
import { InternationalCardPrice } from "./international-price";

/**
 * The international project card. Same frame as the local listing card so the
 * two sit together on the homepage, with three differences that come from the
 * data: the country leads, the price is three figures and so lives in the body
 * rather than over the photo, and rooms and sizes are ranges.
 *
 * With no photo the top is a designed panel — tint, building mark, the city —
 * not a broken-image box. It never borrows a picture of some other building.
 */
export async function InternationalCard({
  listing,
  rates,
  locale,
  priority = false,
}: {
  listing: InternationalListing;
  rates: FxRates;
  locale: string;
  priority?: boolean;
}) {
  const t = await getTranslations("international");

  const href = publicPath(locale, "international", `/${listing.slug}`);
  const image = mediaUrl(listing.cover_path);
  const title = displayTitle(listing.title);
  const country = countryName(listing.country_code, locale);
  const place = joinPlaceParts([listing.area, listing.city, listing.region]);
  const beds = bedroomsLabel(listing, t("studio"));
  const size = sizeLabel(listing, locale);
  const block = priceFigures(listing.currency, listing.price_min, listing.price_max, rates);
  const typeLabel =
    listing.property_type_label ?? (listing.listing_type === "rent" ? t("forRent") : t("forSale"));

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-electric/40 hover:shadow-raised">
      <Link href={href} className="flex h-full flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface">
          {image ? (
            <Image
              src={image}
              alt={title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={priority}
              className="object-cover transition duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="relative grid h-full place-items-center bg-electric-soft">
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--gold-soft),transparent_65%)]"
              />
              <div className="relative flex flex-col items-center gap-2 px-4 pt-6 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-background text-electric shadow-card">
                  <BuildingIcon className="h-6 w-6" />
                </span>
                <span className="line-clamp-1 text-sm font-semibold text-muted-strong">
                  {listing.city ?? country}
                </span>
              </div>
            </div>
          )}

          <div className="absolute left-3 right-3 top-3 flex flex-wrap items-center gap-1.5">
            <CountryBadge
              code={listing.country_code}
              name={country}
              className="max-w-full rounded-md bg-background/90 py-1 pl-1 pr-2 text-[11px] font-bold text-foreground shadow-card backdrop-blur"
            />
            {listing.is_featured && (
              <span className="rounded-md bg-gold-soft px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-gold-ink">
                {t("featured")}
              </span>
            )}
            {isDemoListing(listing) && <DemoBadge label={t("demo")} />}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">{title}</h3>

          {place && (
            <p className="mt-1.5 flex items-start gap-1 text-sm text-muted">
              <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
              <span className="line-clamp-1">{place}</span>
            </p>
          )}

          <div className="mb-4 mt-3">
            <InternationalCardPrice block={block} locale={locale} />
          </div>

          <dl className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-sm text-muted">
            {beds && (
              <div className="flex items-center gap-1.5">
                <BedIcon className="h-4 w-4" />
                <dt className="sr-only">{t("factBedrooms")}</dt>
                <dd className="font-semibold text-foreground">{beds}</dd>
              </div>
            )}
            {size && (
              <div className="flex items-center gap-1.5">
                <AreaIcon className="h-4 w-4" />
                <dt className="sr-only">{t("factSize")}</dt>
                <dd className="font-semibold text-foreground">{size}</dd>
              </div>
            )}
            <div className="flex min-w-0 items-center gap-1.5">
              <dt className="sr-only">{t("factType")}</dt>
              <dd className="truncate">{typeLabel}</dd>
            </div>
          </dl>
        </div>
      </Link>
    </article>
  );
}
