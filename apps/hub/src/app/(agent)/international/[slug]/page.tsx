import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PriceBlock } from "@/components/international/price-block";
import { CountryTag, ListingVisual } from "@/components/international/listing-visual";
import { ShareActions } from "@/components/international/share-actions";
import { countryName, waDigits } from "@/lib/international/countries";
import { intlPhotoUrl, intlPublicUrl, loadIntlListing, loadIntlMedia, loadRates } from "@/lib/international/data";
import { placeText, rangeText } from "@/lib/international/facts";
import { priceFigures } from "@/lib/international/price";

/**
 * One international listing, as the agent sees it before sending it on.
 *
 * Everything here comes from the public views, so nothing on this page is
 * confidential: the agent may read any of it out to a buyer. The person in
 * charge is the country's contact; WhatsApp is the only channel (rule 11).
 */

export const dynamic = "force-dynamic";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";

export default async function InternationalListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const listing = await loadIntlListing(slug);
  if (!listing) notFound();

  const t = await getTranslations("international");
  const locale = await getLocale();
  const [media, rates] = await Promise.all([loadIntlMedia(listing.id), loadRates()]);

  const country = countryName(listing.country_code, locale);
  const place = placeText(listing);
  const placeAndCountry = [place, country].filter(Boolean).join(", ");
  const price = priceFigures(listing, rates);
  const publicUrl = intlPublicUrl(listing.slug, locale);

  const photos = media
    .map((m) => ({ id: m.id, src: intlPhotoUrl(`${m.storage_bucket}/${m.storage_path}`), alt: m.alt ?? listing.title }))
    .filter((p): p is { id: string; src: string; alt: string } => p.src !== null);
  const [hero, ...thumbs] = photos;

  const beds = rangeText(listing.bedrooms_min, listing.bedrooms_max, locale);
  const baths = rangeText(listing.bathrooms_min, listing.bathrooms_max, locale);
  const size = rangeText(listing.size_min, listing.size_max, locale);
  const facts: { key: string; icon: string; label: string; value: string }[] = [
    listing.property_type_label && { key: "type", icon: "building", label: t("factType"), value: listing.property_type_label },
    { key: "category", icon: "grid", label: t("factCategory"), value: t(`category.${listing.category}` as never) },
    { key: "deal", icon: "receipt", label: t("factDeal"), value: t(listing.listing_type === "rent" ? "dealRent" : "dealSale") },
    beds && { key: "beds", icon: "bed", label: t("factBedrooms"), value: beds },
    baths && { key: "baths", icon: "home", label: t("factBathrooms"), value: baths },
    size && { key: "size", icon: "maximize", label: t("factSize"), value: t(listing.size_unit === "sqft" ? "sizeSqft" : "sizeSqm", { range: size }) },
    listing.developer_name && { key: "developer", icon: "users", label: t("factDeveloper"), value: listing.developer_name },
    listing.tenure_label && { key: "tenure", icon: "scale", label: t("factTenure"), value: listing.tenure_label },
    listing.completion_label && { key: "completion", icon: "calendar", label: t("factCompletion"), value: listing.completion_label },
  ].filter((f): f is { key: string; icon: string; label: string; value: string } => Boolean(f));

  const wa = waDigits(listing.contact_whatsapp);
  const waText = [t("waMessage", { title: listing.title, place: placeAndCountry }), publicUrl].filter(Boolean).join("\n");

  return (
    <AgentShell wide>
      <Link
        href={`/international?country=${listing.country_code}`}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted-strong transition-colors duration-150 hover:text-crimson-strong ${FOCUS}`}
      >
        <Icon name="arrow-right" size={16} className="rotate-180" />
        {t("back", { country })}
      </Link>

      <header className="mt-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-strong">
          <CountryTag code={listing.country_code} name={country} />
          {listing.is_featured && (
            <Badge tone="warning">
              <Icon name="star" size={12} />
              {t("featured")}
            </Badge>
          )}
          {listing.property_type_label && <Badge tone="neutral">{listing.property_type_label}</Badge>}
        </div>
        <h1 className="mt-3 text-2xl font-semibold leading-tight text-foreground sm:text-3xl">{listing.title}</h1>
        {place && (
          <p className="mt-2 flex items-start gap-1.5 text-base text-muted-strong">
            <Icon name="map-pin" size={18} className="mt-0.5" />
            {place}
          </p>
        )}
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Main column ------------------------------------------------------ */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section aria-label={t("gallery")}>
            <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl border border-line bg-surface">
              <ListingVisual
                src={hero?.src ?? null}
                alt={hero?.alt ?? listing.title}
                countryCode={listing.country_code}
                place={listing.city ?? listing.region ?? country}
                caption={t("photosSoon")}
                eager
              />
            </div>
            {thumbs.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {thumbs.map((p, i) => (
                  <li key={p.id}>
                    <a
                      href={p.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("openPhoto", { n: i + 2 })}
                      className={`block aspect-[4/3] overflow-hidden rounded-xl border border-line bg-surface transition-colors duration-150 hover:border-crimson ${FOCUS}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.src} alt={p.alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Card>
            <h2 className="text-lg font-semibold text-foreground">{t("keyFacts")}</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              {facts.map((f) => (
                <div key={f.key} className="flex items-start gap-3">
                  <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-muted-strong">
                    <Icon name={f.icon} size={20} />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-muted">{f.label}</dt>
                    <dd className="mt-0.5 break-words text-[15px] font-semibold text-foreground">{f.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>

          {(listing.summary || listing.description) && (
            <Card>
              <h2 className="text-lg font-semibold text-foreground">{t("about")}</h2>
              {listing.summary && <p className="mt-3 text-base font-medium leading-7 text-foreground">{listing.summary}</p>}
              {listing.description && (
                <p className="mt-3 max-w-prose whitespace-pre-line break-words text-[15px] leading-7 text-muted-strong">
                  {listing.description}
                </p>
              )}
            </Card>
          )}

          {listing.highlights.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-foreground">{t("highlights")}</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {listing.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-[15px] leading-6 text-foreground">
                    <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-success-ink">
                      <Icon name="check" size={12} />
                    </span>
                    <span className="min-w-0 break-words">{h}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Side column: price, person in charge, share ---------------------- */}
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-strong">{t("price")}</h2>
            <div className="mt-3">
              <PriceBlock price={price} size="detail" />
            </div>
          </Card>

          <Card data-intl-pic>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-strong">{t("picTitle")}</h2>
            {listing.contact_name ? (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-crimson-soft text-lg font-bold text-crimson-strong">
                    {listing.contact_name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">{listing.contact_name}</p>
                    <p className="truncate text-sm text-muted-strong">
                      {listing.contact_role ?? t("picRoleFallback", { country })}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-strong">{t("picHint", { country })}</p>
                {wa ? (
                  <a
                    href={`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-success-fill px-5 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 ${FOCUS}`}
                  >
                    <Icon name="message-circle" size={18} />
                    {t("picWhatsapp", { name: listing.contact_name })}
                  </a>
                ) : (
                  <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning-ink">{t("picNoNumber")}</p>
                )}
              </>
            ) : (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium leading-6 text-warning-ink">
                <Icon name="alert-triangle" size={18} className="mt-0.5" />
                {t("picNoneLong", { country })}
              </p>
            )}
          </Card>

          {publicUrl && (
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-strong">{t("shareTitle")}</h2>
              <p className="mb-4 mt-2 text-sm leading-6 text-muted-strong">{t("shareHint")}</p>
              <ShareActions
                url={publicUrl}
                title={listing.title}
                message={t("shareMessage", { title: listing.title, place: placeAndCountry })}
                labels={{
                  linkLabel: t("shareLinkLabel"),
                  copy: t("copyLink"),
                  copied: t("copied"),
                  share: t("share"),
                  whatsapp: t("shareWhatsapp"),
                  open: t("openPublic"),
                }}
              />
            </Card>
          )}
        </aside>
      </div>
    </AgentShell>
  );
}
