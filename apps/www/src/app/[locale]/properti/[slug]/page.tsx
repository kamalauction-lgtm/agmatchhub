import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getListingBySlug, getListingMedia } from "@/lib/listings";
import {
  formatArea,
  formatPriceExact,
  formatRelativeDate,
  formatRentPeriod,
  joinPlaceParts,
  mediaUrl,
} from "@/lib/format";
import { brand } from "@/config/brand";
import { getBuyerConsent } from "@/lib/inquiry";
import { InquiryForm } from "@/components/inquiry-form";

// The page carries per-buyer inquiry feedback in its query string, so it is
// rendered per request; the data reads underneath stay cacheable.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: "404" };

  const title = locale === "en" && listing.title_en ? listing.title_en : listing.title;
  const description =
    (locale === "en" && listing.description_en ? listing.description_en : listing.description)
      ?.slice(0, 160) ?? undefined;
  const image = mediaUrl(listing.cover_image_path);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [image] : undefined,
      type: "website",
    },
  };
}

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  const sp = await searchParams;
  const inquiryStatus = typeof sp.inquiry === "string" ? sp.inquiry : undefined;
  const leadRef =
    typeof sp.ref === "string" && /^[A-Z-]+-[0-9-]+$/.test(sp.ref) ? sp.ref : undefined;
  const errorField = typeof sp.field === "string" ? sp.field.slice(0, 30) : undefined;
  const consent = await getBuyerConsent(locale);

  const [media, t, tType, tOwn, tFurn, tCond] = await Promise.all([
    getListingMedia(listing.id),
    getTranslations("listing"),
    getTranslations("propertyType"),
    getTranslations("ownership"),
    getTranslations("furnishing"),
    getTranslations("condition"),
  ]);

  const english = locale === "en";
  const title = english && listing.title_en ? listing.title_en : listing.title;
  const description =
    english && listing.description_en ? listing.description_en : listing.description;

  const gallery = media.length
    ? media
    : listing.cover_image_path
      ? [
          {
            id: "cover",
            processed_path: listing.cover_image_path,
            thumbnail_path: listing.cover_thumbnail_path,
            alt_text: listing.cover_alt_text,
          } as (typeof media)[number],
        ]
      : [];

  const area = [
    listing.building_size != null && [t("buildingSize"), formatArea(listing.building_size, listing.measurement_unit)],
    listing.land_size ? [t("landSize"), formatArea(listing.land_size, listing.measurement_unit)] : null,
  ].filter(Boolean) as Array<[string, string]>;

  const specs: Array<[string, string]> = [
    [t("propertyType"), tType(listing.property_type as never) || listing.property_type],
    ...area,
    listing.bedrooms != null ? [t("bedrooms"), String(listing.bedrooms)] : null,
    listing.bathrooms != null ? [t("bathrooms"), String(listing.bathrooms)] : null,
    listing.parking_spaces != null ? [t("parking"), String(listing.parking_spaces)] : null,
    listing.floors != null ? [t("floors"), String(listing.floors)] : null,
    listing.ownership_type ? [t("certificate"), tOwn(listing.ownership_type as never)] : null,
    listing.furnishing ? [t("furnishing"), tFurn(listing.furnishing as never)] : null,
    listing.property_condition
      ? [t("condition"), tCond(listing.property_condition as never)]
      : null,
    listing.year_built != null ? [t("yearBuilt"), String(listing.year_built)] : null,
  ].filter(Boolean) as Array<[string, string]>;

  return (
    <article className="mx-auto max-w-6xl px-4 py-6">
      {gallery.length > 0 && (
        <div className="overflow-hidden rounded-card border border-line">
          <div className="relative aspect-[16/10] bg-surface sm:aspect-[16/8]">
            <Image
              src={mediaUrl(gallery[0].processed_path)!}
              alt={gallery[0].alt_text ?? title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover"
            />
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto bg-surface p-2">
              {gallery.slice(0, 12).map((m) => (
                <div
                  key={m.id}
                  className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-background"
                >
                  <Image
                    src={mediaUrl(m.thumbnail_path ?? m.processed_path)!}
                    alt={m.alt_text ?? title}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-md bg-surface px-2 py-1">
              {listing.listing_type === "sale" ? t("forSale") : t("forRent")}
            </span>
            {listing.is_verified && (
              <span className="rounded-md bg-success px-2 py-1 text-white">{t("verified")}</span>
            )}
            {listing.is_featured && (
              <span className="rounded-md bg-accent px-2 py-1 text-white">{t("featured")}</span>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            {title}
          </h1>

          <p className="mt-2 text-muted">
            {joinPlaceParts([
              listing.general_address,
              listing.district_name,
              listing.regency_name,
              listing.province_name,
            ])}
          </p>

          <p className="mt-4 text-3xl font-extrabold tracking-tight text-brand">
            {formatPriceExact(listing.price, listing.currency)}
            <span className="text-base font-medium text-muted">
              {formatRentPeriod(listing.rent_period)}
            </span>
            {listing.price_negotiable && (
              <span className="ml-2 align-middle text-xs font-semibold text-muted">
                · {t("negotiable")}
              </span>
            )}
          </p>

          <section className="mt-8">
            <h2 className="text-lg font-bold">{t("specifications")}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {specs.map(([label, value]) => (
                <div key={label} className="border-b border-line pb-2">
                  <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {description && (
            <section className="mt-8">
              <h2 className="text-lg font-bold">{t("description")}</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/90">
                {description}
              </p>
            </section>
          )}

          {listing.facilities.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-bold">{t("facilities")}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {listing.facilities.map((f) => (
                  <li
                    key={f}
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-10 text-xs text-muted">
            {t("listingId")}: {listing.human_readable_id} · {t("listedOn")}{" "}
            {formatRelativeDate(listing.published_at, locale)}
          </p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-line bg-surface-raised p-5">
            <p className="text-xs uppercase tracking-wide text-muted">{t("listedBy")}</p>
            <p className="mt-2 font-bold">{listing.agent_display_name ?? "—"}</p>
            {listing.agent_agency_name && (
              <p className="text-sm text-muted">{listing.agent_agency_name}</p>
            )}
            {listing.agent_is_verified && (
              <p className="mt-2 inline-flex rounded-md bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                {t("verified")}
              </p>
            )}

            {/* The agent's phone number is deliberately not public: contact
                flows through a lead so consent, assignment and the response
                SLA are all recorded before anyone talks. */}
            <div className="mt-5">
              {consent ? (
                <InquiryForm
                  slug={slug}
                  locale={locale}
                  consent={consent}
                  status={inquiryStatus}
                  leadRef={leadRef}
                  errorField={errorField}
                />
              ) : (
                <p className="rounded-lg border border-line bg-surface p-3 text-sm text-muted">
                  {t("contactAgent")}
                </p>
              )}
            </div>
          </div>

          <p className="mt-4 px-1 text-xs leading-relaxed text-muted">{brand.appName}</p>
        </aside>
      </div>
    </article>
  );
}
