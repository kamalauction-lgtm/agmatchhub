import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { displayTitle, isDemoListing, type PublicListing } from "@/lib/listings";
import {
  bedroomLabel,
  formatArea,
  formatPriceShort,
  formatRentPeriod,
  joinPlaceParts,
  mediaUrl,
} from "@/lib/format";
import { routing, publicPath } from "@/i18n/routing";
import { BathIcon, BedIcon, AreaIcon, CheckBadgeIcon, ImageOffIcon, PinIcon } from "./icons";
import { DemoBadge } from "./demo-badge";
import { CompareToggle } from "./compare-toggle";

/**
 * The 2.0 property card. Photo-first, price as the headline, facts as a quiet
 * row, and two honesty signals that never move: the verified mark (green,
 * reserved) and the DEMO badge on synthetic inventory. Promotion is labelled.
 */
export async function ListingCard({
  listing,
  locale,
  priority = false,
  compare = true,
}: {
  listing: PublicListing;
  locale: string;
  priority?: boolean;
  compare?: boolean;
}) {
  const t = await getTranslations("listing");
  const tType = await getTranslations("propertyType");

  const path = publicPath(locale, "listing", `/${listing.slug}`);
  const href = locale === routing.defaultLocale ? path : `/${locale}${path}`;
  const image = mediaUrl(listing.cover_thumbnail_path ?? listing.cover_image_path);

  const beds = bedroomLabel(listing.bedrooms, t("studio"));
  const area = listing.building_size ?? listing.land_size;
  const demo = isDemoListing(listing);
  const title = displayTitle(listing.title);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-electric/40 hover:shadow-raised">
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface">
          {image ? (
            <Image
              src={image}
              alt={listing.cover_alt_text ?? title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={priority}
              className="object-cover transition duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="relative grid h-full place-items-center bg-[radial-gradient(ellipse_at_top,var(--electric-soft),transparent_75%)]">
              <div className="flex flex-col items-center gap-1.5 text-muted">
                <ImageOffIcon className="h-6 w-6" />
                <span className="text-xs font-medium">{t("noPhoto")}</span>
              </div>
            </div>
          )}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-foreground backdrop-blur">
              {listing.listing_type === "sale" ? t("forSale") : t("forRent")}
            </span>
            {(listing.is_boosted || listing.is_featured) && (
              <span className="rounded-md bg-gold-light px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-foreground">
                {t("featured")}
              </span>
            )}
            {demo && <DemoBadge label={t("demo")} />}
          </div>

          <p className="absolute bottom-3 left-3 right-3 text-xl font-extrabold tracking-tight text-white drop-shadow">
            {formatPriceShort(listing.price, listing.currency, locale)}
            <span className="text-sm font-medium text-white/80">
              {formatRentPeriod(listing.rent_period, locale)}
            </span>
          </p>
        </div>

        <div className="p-4">
          <h3 className="line-clamp-2 font-semibold leading-snug">{title}</h3>

          <p className="mt-1.5 flex items-start gap-1 text-sm text-muted">
            <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
            <span className="line-clamp-1">
              {joinPlaceParts([listing.district_name, listing.regency_name, listing.province_name])}
            </span>
          </p>

          <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {beds && (
              <div className="flex items-center gap-1.5">
                <BedIcon className="h-4 w-4" />
                <dt className="sr-only">{t("bedrooms")}</dt>
                <dd className="font-semibold text-foreground">{beds}</dd>
              </div>
            )}
            {listing.bathrooms != null && (
              <div className="flex items-center gap-1.5">
                <BathIcon className="h-4 w-4" />
                <dt className="sr-only">{t("bathrooms")}</dt>
                <dd className="font-semibold text-foreground">{listing.bathrooms}</dd>
              </div>
            )}
            {area != null && (
              <div className="flex items-center gap-1.5">
                <AreaIcon className="h-4 w-4" />
                <dt className="sr-only">{listing.building_size ? t("buildingSize") : t("landSize")}</dt>
                <dd className="font-semibold text-foreground">{formatArea(area, listing.measurement_unit, locale)}</dd>
              </div>
            )}
          </dl>
        </div>
      </Link>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className="truncate">{tType(listing.property_type as never) || listing.property_type}</span>
          {listing.is_verified && (
            <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-success">
              <CheckBadgeIcon className="h-3.5 w-3.5" />
              {t("verified")}
            </span>
          )}
        </span>
        {compare && (
          <CompareToggle
            id={listing.id}
            labels={{ add: t("compareAdd"), remove: t("compareRemove"), full: t("compareFull") }}
          />
        )}
      </div>
    </article>
  );
}
