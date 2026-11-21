import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  bathroomsLabel,
  bedroomsLabel,
  countryName,
  getFxRates,
  getInternationalBySlug,
  getInternationalMedia,
  priceFigures,
  sizeLabel,
} from "@/lib/international";
import { displayTitle, isDemoListing } from "@/lib/listings";
import { getBuyerConsent } from "@/lib/inquiry";
import { formatPriceShort, joinPlaceParts, mediaUrl } from "@/lib/format";
import { publicPath, routing } from "@/i18n/routing";
import { market } from "@/config/market";
import { requireLocale } from "@/i18n/require-locale";
import { DemoBadge } from "@/components/demo-badge";
import { CheckBadgeIcon, PinIcon } from "@/components/icons";
import type { GalleryImage } from "@/components/listing-gallery";
import { CountryBadge } from "@/components/international-country";
import { InternationalGallery } from "@/components/international-gallery";
import { InternationalFacts, type InternationalFact } from "@/components/international-facts";
import { InternationalPriceBlock } from "@/components/international-price";
import { InternationalContactCard } from "@/components/international-contact-card";
import { InternationalEnquiryForm } from "@/components/international-enquiry-form";

// The page carries per-buyer enquiry feedback in its query string, so it is
// rendered per request.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  requireLocale(locale);
  const listing = await getInternationalBySlug(slug);
  if (!listing) return { title: "404" };

  const country = countryName(listing.country_code, locale);
  const place = joinPlaceParts([listing.city, country]);
  const title = `${displayTitle(listing.title)} — ${place}`;
  const description = (listing.summary ?? listing.description)?.slice(0, 160) ?? undefined;
  const image = mediaUrl(listing.cover_path);
  const canonical = publicPath(locale, "international", `/${listing.slug}`);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        market.locales.map((l) => [l, publicPath(l, "international", `/${listing.slug}`)])
      ),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      images: image ? [image] : undefined,
      type: "website",
    },
  };
}

export default async function InternationalListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  requireLocale(locale);
  setRequestLocale(locale);

  const listing = await getInternationalBySlug(slug);
  if (!listing) notFound();

  const sp = await searchParams;
  // An outcome code, never text: the form maps it to a translated sentence.
  const enquiryStatus =
    typeof sp.enquiry === "string" && /^[a-z_]{1,30}$/.test(sp.enquiry) ? sp.enquiry : undefined;

  const [media, rates, consent, t] = await Promise.all([
    getInternationalMedia(listing.id),
    getFxRates(),
    getBuyerConsent(locale),
    getTranslations("international"),
  ]);

  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const listHref = publicPath(locale, "international");
  const title = displayTitle(listing.title);
  const country = countryName(listing.country_code, locale);
  const place = joinPlaceParts([listing.area, listing.city, listing.region, country]);
  const block = priceFigures(listing.currency, listing.price_min, listing.price_max, rates);

  const gallery: GalleryImage[] = media
    .map((m) => {
      const src = mediaUrl(`${m.storage_bucket}/${m.storage_path}`);
      return src ? { id: m.id, src, thumb: src, alt: m.alt ?? title } : null;
    })
    .filter((x): x is GalleryImage => x !== null);

  const beds = bedroomsLabel(listing, t("studio"));
  const baths = bathroomsLabel(listing);
  const size = sizeLabel(listing, locale);

  /* Only what the listing states. Order: what it is, how big, on what terms,
     when, and by whom. */
  const factCandidates: Array<InternationalFact | null> = [
    listing.property_type_label
      ? { key: "type", icon: "type", label: t("factType"), value: listing.property_type_label }
      : null,
    beds ? { key: "bed", icon: "bed", label: t("factBedrooms"), value: beds } : null,
    baths ? { key: "bath", icon: "bath", label: t("factBathrooms"), value: baths } : null,
    size ? { key: "size", icon: "area", label: t("factSize"), value: size } : null,
    listing.tenure_label
      ? { key: "tenure", icon: "tenure", label: t("factTenure"), value: listing.tenure_label }
      : null,
    listing.completion_label
      ? { key: "completion", icon: "completion", label: t("factCompletion"), value: listing.completion_label }
      : null,
    listing.developer_name
      ? { key: "developer", icon: "developer", label: t("factDeveloper"), value: listing.developer_name }
      : null,
  ];
  const facts = factCandidates.filter((f): f is InternationalFact => f !== null);

  const lead = block.figures[0];
  const leadShort = lead ? formatPriceShort(lead.min, lead.currency, locale) : null;
  const panel = "rounded-card border border-line bg-surface-raised p-5 shadow-card";

  return (
    /* pb-24 on mobile clears the fixed enquiry bar. */
    <article className="mx-auto max-w-6xl px-4 pb-24 pt-4 lg:pb-10">
      <nav aria-label={t("breadcrumb")} className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <Link href={prefix || "/"} className="hover:text-brand">
          {t("breadcrumbHome")}
        </Link>
        <span aria-hidden>/</span>
        <Link href={listHref} className="hover:text-brand">
          {t("title")}
        </Link>
        <span aria-hidden>/</span>
        <Link href={`${listHref}?country=${listing.country_code}`} className="hover:text-brand">
          {country}
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate font-medium text-foreground">{title}</span>
      </nav>

      <InternationalGallery
        images={gallery}
        place={listing.city ?? country}
        labels={{
          noPhotoTitle: t("noPhotoTitle"),
          noPhotoBody: t("noPhotoBody"),
          noPhotoCta: t("noPhotoCta"),
          // Raw: the gallery substitutes {n} itself.
          photoCount: t.raw("photoCountShort") as string,
          openPhoto: t("openPhoto"),
        }}
      />

      <div className="mt-7 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <CountryBadge
              code={listing.country_code}
              name={country}
              className="rounded-md border border-line bg-surface py-1 pl-1 pr-2.5"
            />
            <span className="rounded-md bg-electric-soft px-2.5 py-1 text-electric">
              {listing.listing_type === "rent" ? t("forRent") : t("forSale")}
            </span>
            {listing.is_featured && (
              <span className="rounded-md bg-gold-soft px-2.5 py-1 text-gold-ink">{t("featured")}</span>
            )}
            {isDemoListing(listing) && <DemoBadge label={t("demo")} />}
          </div>

          <h1 className="mt-3 break-words text-2xl font-extrabold leading-tight tracking-tight sm:text-[2rem]">
            {title}
          </h1>

          {place && (
            <p className="mt-2 flex items-start gap-1.5 text-muted">
              <PinIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{place}</span>
            </p>
          )}

          {listing.summary && (
            <p className="mt-3 max-w-prose leading-relaxed text-foreground/90">{listing.summary}</p>
          )}

          <InternationalPriceBlock block={block} ownCurrency={listing.currency} locale={locale} />

          <InternationalContactCard
            name={listing.contact_name}
            role={listing.contact_role}
            countryCode={listing.country_code}
            countryName={country}
            labels={{
              title: t("picTitle"),
              deskName: t("picDeskName"),
              deskBody: t("picDeskBody"),
              cta: t("picCta"),
              help: t("picHelp"),
            }}
          />

          <InternationalFacts title={t("factsTitle")} facts={facts} />

          {listing.description && (
            <section className={`mt-8 ${panel}`}>
              <h2 className="text-lg font-bold">{t("descriptionTitle")}</h2>
              <p className="mt-3 max-w-prose whitespace-pre-line break-words leading-relaxed text-foreground/90">
                {listing.description}
              </p>
            </section>
          )}

          {listing.highlights.length > 0 && (
            <section className={`mt-5 ${panel}`}>
              <h2 className="text-lg font-bold">{t("highlightsTitle")}</h2>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {listing.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm leading-relaxed">
                    <CheckBadgeIcon className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
                    <span className="min-w-0 break-words">{h}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-8">
            <Link
              href={listHref}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-electric hover:text-electric-strong"
            >
              ← {t("backToList")}
            </Link>
          </p>
        </div>

        <aside
          id="enquiry"
          className="scroll-mt-24 rounded-card border border-line bg-surface-raised p-5 shadow-card lg:sticky lg:top-24 lg:self-start"
        >
          <h2 className="text-lg font-bold">{t("formTitle")}</h2>
          <p className="mb-4 mt-1 text-sm text-muted">{t("formIntro", { country })}</p>
          <InternationalEnquiryForm slug={listing.slug} locale={locale} consent={consent} status={enquiryStatus} />
        </aside>
      </div>

      {/* Mobile enquiry bar: the form is a long scroll below the description. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-surface-raised px-4 py-3 shadow-raised lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold leading-tight text-electric">
            {leadShort ? (lead.max === null ? leadShort : t("from", { price: leadShort })) : t("priceOnRequest")}
          </p>
          {lead?.estimate && <p className="truncate text-xs text-muted">{t("estimate")}</p>}
        </div>
        <a
          href="#enquiry"
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg bg-electric px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong"
        >
          {t("contactCta")}
        </a>
      </div>
    </article>
  );
}
