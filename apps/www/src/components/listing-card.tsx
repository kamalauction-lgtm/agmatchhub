import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { PublicListing } from "@/lib/listings";
import {
  bedroomLabel,
  formatArea,
  formatPriceShort,
  formatRentPeriod,
  joinPlaceParts,
  mediaUrl,
} from "@/lib/format";
import { routing, publicPath } from "@/i18n/routing";
import { ImageOffIcon } from "./icons";

export async function ListingCard({
  listing,
  locale,
  priority = false,
}: {
  listing: PublicListing;
  locale: string;
  priority?: boolean;
}) {
  const t = await getTranslations("listing");
  const tType = await getTranslations("propertyType");

  // Market segment, not a literal: Malaysia serves these at /property/.
  const path = publicPath(locale, "listing", `/${listing.slug}`);
  const href = locale === routing.defaultLocale ? path : `/${locale}${path}`;
  const image = mediaUrl(listing.cover_thumbnail_path ?? listing.cover_image_path);

  // A studio is stored as 0 bedrooms; printing "0 KT" reads as missing data.
  const beds = bedroomLabel(listing.bedrooms, t("studio"));
  const area = listing.building_size ?? listing.land_size;
  const areaLabel = listing.building_size ? t("buildingSize") : t("landSize");

  return (
    <article className="group overflow-hidden rounded-card border border-line bg-surface-raised transition hover:border-brand/40 hover:shadow-lg">
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface">
          {image ? (
            <Image
              src={image}
              alt={listing.cover_alt_text ?? listing.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={priority}
              className="object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            /* Matches the detail page's empty gallery so a grid of
               photo-less listings reads as a deliberate state, not as a
               page that failed to load. */
            <div className="relative grid h-full place-items-center bg-[radial-gradient(ellipse_at_top,var(--brand-soft),transparent_75%)]">
              <div className="flex flex-col items-center gap-1.5 text-muted">
                <ImageOffIcon className="h-6 w-6" />
                <span className="text-xs font-medium">{t("noPhoto")}</span>
              </div>
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-background/90 px-2 py-1 text-xs font-semibold">
              {listing.listing_type === "sale" ? t("forSale") : t("forRent")}
            </span>
            {listing.is_verified && (
              <span className="rounded-md bg-success px-2 py-1 text-xs font-semibold text-white">
                {t("verified")}
              </span>
            )}
            {/* Promotion is always labelled, never disguised as relevance (§14). */}
            {(listing.is_boosted || listing.is_featured) && (
              <span className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-white">
                {t("featured")}
              </span>
            )}
          </div>
        </div>

        <div className="p-4">
          <p className="text-lg font-bold tracking-tight text-brand">
            {formatPriceShort(listing.price, listing.currency, locale)}
            <span className="text-sm font-medium text-muted">
              {formatRentPeriod(listing.rent_period, locale)}
            </span>
          </p>

          <h3 className="mt-1 line-clamp-2 font-semibold leading-snug">{listing.title}</h3>

          <p className="mt-1 line-clamp-1 text-sm text-muted">
            {joinPlaceParts([
              listing.district_name,
              listing.regency_name,
              listing.province_name,
            ])}
          </p>

          <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {/* The visible label is the abbreviation Indonesian listings use;
                the hidden one spells it out, so a screen reader hears
                "Kamar tidur: 2" rather than "KT, 2 KT". */}
            {beds && (
              <div className="flex items-center gap-1">
                <dt className="sr-only">{t("bedrooms")}</dt>
                <dd>
                  <strong className="font-semibold text-foreground">{beds}</strong>
                  {listing.bedrooms !== 0 && <span aria-hidden> {t("bedroomsShort")}</span>}
                </dd>
              </div>
            )}
            {listing.bathrooms != null && (
              <div className="flex items-center gap-1">
                <dt className="sr-only">{t("bathrooms")}</dt>
                <dd>
                  <strong className="font-semibold text-foreground">{listing.bathrooms}</strong>{" "}
                  <span aria-hidden>{t("bathroomsShort")}</span>
                </dd>
              </div>
            )}
            {area != null && (
              <div className="flex items-center gap-1">
                <dt className="sr-only">{areaLabel}</dt>
                <dd className="font-medium text-foreground">
                  {formatArea(area, listing.measurement_unit, locale)}
                </dd>
              </div>
            )}
          </dl>

          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            {tType(listing.property_type as never) || listing.property_type}
            {listing.agent_agency_name ? ` · ${listing.agent_agency_name}` : ""}
          </p>
        </div>
      </Link>
    </article>
  );
}
