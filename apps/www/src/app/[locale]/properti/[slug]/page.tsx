import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { getListingBySlug, getListingMedia, searchListings } from "@/lib/listings";
import {
  bedroomLabel,
  formatArea,
  formatPriceExact,
  formatRelativeDate,
  formatRentPeriod,
  joinPlaceParts,
  mediaUrl,
  pricePerArea,
} from "@/lib/format";
import { getBuyerConsent } from "@/lib/inquiry";
import { InquiryForm } from "@/components/inquiry-form";
import { AgentCard } from "@/components/agent-card";
import { ListingGallery, type GalleryImage } from "@/components/listing-gallery";
import { KeyFacts, type Fact } from "@/components/key-facts";
import { CheckBadgeIcon, PinIcon } from "@/components/icons";
import { KprCalculator } from "@/components/kpr-calculator";
import { ListingCard } from "@/components/listing-card";
import { SectionHeading } from "@/components/section-heading";
import { routing } from "@/i18n/routing";

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

  const [media, similar, t, tType, tOwn, tFurn, tCond, tHome] = await Promise.all([
    getListingMedia(listing.id),
    /* Same type, same intent (sale or rent). Deliberately NOT filtered to the
       same city: six of thirty listings have no location at all, so a location
       filter would return nothing on a fifth of the catalogue and the rail
       would silently vanish exactly where a dead end hurts most. */
    searchListings({
      propertyType: listing.property_type,
      type: listing.listing_type as "sale" | "rent",
      sort: "newest",
      page: 1,
    }),
    getTranslations("listing"),
    getTranslations("propertyType"),
    getTranslations("ownership"),
    getTranslations("furnishing"),
    getTranslations("condition"),
    getTranslations("home"),
  ]);

  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const searchHref = `${prefix}/cari`;
  const related = similar.listings.filter((l) => l.id !== listing.id).slice(0, 4);

  const english = locale === "en";
  const title = english && listing.title_en ? listing.title_en : listing.title;
  const description =
    english && listing.description_en ? listing.description_en : listing.description;

  const sourceImages = media.length
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

  const gallery: GalleryImage[] = sourceImages
    .map((m) => {
      const src = mediaUrl(m.processed_path);
      return src
        ? {
            id: m.id,
            src,
            thumb: mediaUrl(m.thumbnail_path ?? m.processed_path) ?? src,
            alt: m.alt_text ?? title,
          }
        : null;
    })
    .filter((x): x is GalleryImage => x !== null);

  const typeLabel = tType(listing.property_type as never) || listing.property_type;
  const beds = bedroomLabel(listing.bedrooms, t("studio"));
  const primaryArea = listing.building_size ?? listing.land_size;

  /* The scan line. Order matters — rooms first, because that is what a buyer
     filters on, then size, then the type they already half-know from search. */
  const factCandidates: Array<Fact | null> = [
    beds ? { key: "bed", icon: "bed", label: t("bedrooms"), value: beds } : null,
    listing.bathrooms != null
      ? { key: "bath", icon: "bath", label: t("bathrooms"), value: String(listing.bathrooms) }
      : null,
    primaryArea != null
      ? {
          key: "area",
          icon: "area",
          label: listing.building_size ? t("buildingSize") : t("landSize"),
          value: formatArea(primaryArea, listing.measurement_unit, locale),
        }
      : null,
    { key: "type", icon: "type", label: t("propertyType"), value: typeLabel },
  ];
  const facts = factCandidates.filter((f): f is Fact => f !== null);

  const perArea = pricePerArea(listing.price, listing.building_size, listing.currency);

  const area = [
    listing.building_size != null && [t("buildingSize"), formatArea(listing.building_size, listing.measurement_unit, locale)],
    listing.land_size ? [t("landSize"), formatArea(listing.land_size, listing.measurement_unit, locale)] : null,
  ].filter(Boolean) as Array<[string, string]>;

  const specs: Array<[string, string]> = [
    [t("propertyType"), typeLabel],
    ...area,
    beds ? [t("bedrooms"), beds] : null,
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

  const place = joinPlaceParts([
    listing.general_address,
    listing.district_name,
    listing.regency_name,
    listing.province_name,
  ]);

  const priceText = formatPriceExact(listing.price, listing.currency, locale);

  return (
    /* pb-24 on mobile clears the fixed contact bar; without it the last line
       of the page sits underneath it. */
    <article className="mx-auto max-w-6xl px-4 pb-24 pt-4 lg:pb-10">
      {/* Breadcrumbs. Only places the listing actually states are rendered —
          a trail with "undefined" in it is worse than no trail. */}
      <nav aria-label={t("breadcrumb")} className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Link href={prefix || "/"} className="hover:text-brand">{tHome("breadcrumbHome")}</Link>
        {[listing.province_name, listing.regency_name]
          .filter((x): x is string => !!x)
          .map((place) => (
            <span key={place} className="flex items-center gap-1.5">
              <span aria-hidden>/</span>
              <Link
                href={`${searchHref}?q=${encodeURIComponent(place)}`}
                className="hover:text-brand"
              >
                {place}
              </Link>
            </span>
          ))}
        <span aria-hidden>/</span>
        <span className="truncate font-medium text-foreground">{typeLabel}</span>
      </nav>

      <ListingGallery
        images={gallery}
        labels={{
          noPhoto: t("noPhoto"),
          noPhotoHelp: t("noPhotoHelp"),
          photoCount: t("photoCountShort"),
          openPhoto: t("openPhoto"),
          askForPhotos: t("askForPhotos"),
        }}
      />

      <div className="mt-7 grid gap-10 lg:grid-cols-[1fr_21rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-md bg-brand-soft px-2.5 py-1 text-brand">
              {listing.listing_type === "sale" ? t("forSale") : t("forRent")}
            </span>
            {listing.is_verified && (
              <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2.5 py-1 text-success">
                <CheckBadgeIcon className="h-3.5 w-3.5" />
                {t("verified")}
              </span>
            )}
            {listing.is_featured && (
              <span className="rounded-md bg-accent/15 px-2.5 py-1 text-accent">
                {t("featured")}
              </span>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight sm:text-[2rem]">
            {title}
          </h1>

          {place && (
            <p className="mt-2 flex items-start gap-1.5 text-muted">
              <PinIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{place}</span>
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-extrabold tracking-tight text-brand sm:text-4xl">
              {priceText}
              <span className="text-base font-medium text-muted">
                {formatRentPeriod(listing.rent_period, locale)}
              </span>
            </p>
            {/* Derived, so it is always labelled as a rate rather than shown
                as another price. */}
            {perArea && <span className="text-sm font-semibold text-muted">{perArea}</span>}
            {listing.price_negotiable && (
              <span className="text-xs font-semibold text-muted">· {t("negotiable")}</span>
            )}
          </div>

          <KeyFacts facts={facts} />

          <section className="mt-9 rounded-card border border-line bg-surface-raised p-5 shadow-card">
            <h2 className="text-lg font-bold">{t("specifications")}</h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {specs.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-b border-line py-2.5"
                >
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="text-right font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {description && (
            <section className="mt-5 rounded-card border border-line bg-surface-raised p-5 shadow-card">
              <h2 className="text-lg font-bold">{t("description")}</h2>
              {/* max-w-prose keeps the measure near 70 characters; full-width
                  paragraphs on a desktop monitor are genuinely harder to read. */}
              <p className="mt-3 max-w-prose whitespace-pre-line leading-relaxed text-foreground/90">
                {description}
              </p>
            </section>
          )}

          {listing.facilities.length > 0 && (
            <section className="mt-5 rounded-card border border-line bg-surface-raised p-5 shadow-card">
              <h2 className="text-lg font-bold">{t("facilities")}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {listing.facilities.map((f) => (
                  <li
                    key={f}
                    className="rounded-lg bg-surface px-3 py-1.5 text-sm"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Financing, seeded with this property's asking price. Sale only —
              a mortgage calculator under a monthly rental is nonsense. */}
          {listing.listing_type === "sale" && (
            <section className="mt-5">
              <KprCalculator
                initialPrice={Number(listing.price)}
                searchHref={searchHref}
                labels={{
                  title: tHome("kpr.title"),
                  intro: tHome("kpr.intro"),
                  price: tHome("kpr.price"),
                  downPayment: tHome("kpr.downPayment"),
                  rate: tHome("kpr.rate"),
                  years: tHome("kpr.years"),
                  monthly: tHome("kpr.monthly"),
                  loanAmount: tHome("kpr.loanAmount"),
                  disclaimer: tHome("kpr.disclaimer"),
                  cta: tHome("kpr.cta"),
                }}
              />
            </section>
          )}

          <p className="mt-8 text-xs text-muted">
            {t("listingId")}: {listing.human_readable_id} · {t("listedOn")}{" "}
            {formatRelativeDate(listing.published_at, locale)}
          </p>
        </div>

        <aside
          id="enquiry"
          className="rounded-card border border-line bg-surface-raised p-5 shadow-card lg:sticky lg:top-24 lg:self-start"
        >
          <AgentCard
            name={listing.agent_display_name}
            agencyName={listing.agent_agency_name}
            avatarPath={listing.agent_avatar_url}
            isVerified={!!listing.agent_is_verified}
            labels={{ listedBy: t("listedBy"), verified: t("verified") }}
          >
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
          </AgentCard>
        </aside>
      </div>

      {/* Similar listings — a property page is otherwise a dead end for anyone
          who has decided this is not the one. */}
      {related.length > 0 && (
        <section className="mt-12 border-t border-line pt-10">
          <SectionHeading
            title={t("similarTitle")}
            subtitle={t("similarSubtitle", { type: typeLabel })}
            action={{ href: `${searchHref}?propertyType=${listing.property_type}`, label: tHome("seeAll") }}
          />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((l) => (
              <ListingCard key={l.id} listing={l} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* Mobile contact bar. On a phone the enquiry form is a long scroll below
          the description, and a buyer who has decided at the photos should not
          have to hunt for it. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-surface-raised px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold leading-tight text-brand">{priceText}</p>
          {perArea && <p className="truncate text-xs text-muted">{perArea}</p>}
        </div>
        <a
          href="#enquiry"
          className="shrink-0 cursor-pointer rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t("contactCta")}
        </a>
      </div>
    </article>
  );
}
