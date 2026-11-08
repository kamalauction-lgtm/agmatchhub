import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { getStudioListing, publicMediaUrl } from "@/lib/studio/listings";
import { ownershipLabel } from "@/lib/ai/listing-writer";
import { money, place } from "@/lib/listings/format";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import { brand } from "@/config/brand";
import { PrintButton } from "@/components/studio/print-button";

/**
 * One-page listing brochure (module design §3.4) — gallery, specs, agent card.
 * The thing agents currently make badly in Canva.
 *
 * Deliberately a print view, not a generated file: the browser's print dialog
 * is the PDF exporter on every platform, the layout is real CSS instead of a
 * PDF library, and there is nothing to install or run on the worker. The
 * toolbar is `print:hidden`; everything else is the brochure.
 *
 * Same fact discipline as the rest of the studio: every line comes from the
 * listing row, in the LISTING's language. The contact block carries the
 * sharing agent's landing link — for a borrowed listing that is the borrower's
 * page, never the original agent's details (§4.4). No phone numbers (§4.3).
 */

type MediaRow = {
  processed_path: string | null;
  thumbnail_path: string | null;
  is_cover: boolean;
  position: number;
};

export default async function BrochurePage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const user = await requireUser();
  const { listingId } = await params;

  const listing = await getStudioListing(user.id, listingId);
  if (!listing) notFound();

  const contentLocale = listing.language === "en" ? "en" : "id";
  const supabase = await createClient();
  const [tB, tUi, partnerIdentityPublic, { data: mediaRows }] = await Promise.all([
    // Brochure copy follows the listing's language; toolbar follows the UI.
    getTranslations({ locale: contentLocale, namespace: "studio.brochure" }),
    getTranslations("studio.brochure"),
    isPartnerIdentityPublic(),
    supabase
      .from("public_listing_media")
      .select("processed_path, thumbnail_path, is_cover, position")
      .eq("listing_id", listing.id)
      .order("is_cover", { ascending: false })
      .order("position")
      .limit(5),
  ]);

  const media = ((mediaRows ?? []) as MediaRow[])
    .map((m) => publicMediaUrl(m.processed_path ?? m.thumbnail_path))
    .filter((u): u is string => !!u);
  const hero = media[0] ?? publicMediaUrl(listing.cover_image_path);
  const thumbs = media.slice(1, 5);

  const specs: [string, string][] = [];
  if (listing.bedrooms) specs.push([tB("specBedrooms"), String(listing.bedrooms)]);
  if (listing.bathrooms) specs.push([tB("specBathrooms"), String(listing.bathrooms)]);
  if (listing.land_size) specs.push([tB("specLand"), `${listing.land_size} m²`]);
  if (listing.building_size) specs.push([tB("specBuilding"), `${listing.building_size} m²`]);
  if (listing.parking_spaces) specs.push([tB("specParking"), String(listing.parking_spaces)]);
  if (listing.floors) specs.push([tB("specFloors"), String(listing.floors)]);
  if (listing.year_built) specs.push([tB("specYear"), String(listing.year_built)]);
  const cert = ownershipLabel(listing.ownership_type);
  if (cert) specs.push([tB("specCert"), cert]);
  if (listing.furnishing) {
    specs.push([tB("specFurnishing"), tB(`furn_${listing.furnishing}` as never)]);
  }

  const appName = partnerIdentityPublic ? brand.appName : brand.appNameNeutral;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 print:max-w-none print:p-0">
      {/* Toolbar — screen only ------------------------------------------- */}
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/studio/${listing.id}`}
          className="text-sm font-medium text-muted hover:text-crimson"
        >
          ← {tUi("back")}
        </Link>
        <PrintButton label={tUi("print")} />
      </div>

      {/* The sheet -------------------------------------------------------- */}
      <article className="rounded-xl border border-line p-8 print:rounded-none print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-3">
          <span className="rounded-lg bg-crimson px-3 py-1 text-sm font-bold uppercase tracking-wide text-white">
            {listing.listing_type === "rent" ? tB("badgeRent") : tB("badgeSale")}
          </span>
          <span className="font-mono text-xs text-muted">{listing.human_readable_id}</span>
        </header>

        <h1 className="mt-4 text-2xl font-bold leading-snug">{listing.title}</h1>
        <p className="mt-1 text-sm text-muted">
          📍{" "}
          {place({
            regency_name: listing.regency_name,
            province_name: listing.province_name,
          })}
          {listing.building_name ? ` · ${listing.building_name}` : ""}
        </p>

        {/* Gallery -------------------------------------------------------- */}
        {hero && (
          <div className="mt-5">
            <Image
              src={hero}
              alt={listing.title}
              width={1200}
              height={675}
              unoptimized
              priority
              className="h-72 w-full rounded-xl object-cover print:h-64"
            />
            {thumbs.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {thumbs.map((src) => (
                  <Image
                    key={src}
                    src={src}
                    alt=""
                    width={300}
                    height={200}
                    unoptimized
                    className="h-20 w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Price ----------------------------------------------------------- */}
        {listing.price !== null && (
          <p className="mt-5 text-3xl font-extrabold text-crimson">
            {money(listing.currency, listing.price, listing.rent_period)}
          </p>
        )}

        {/* Specs ----------------------------------------------------------- */}
        {specs.length > 0 && (
          <section className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {tB("specsHeading")}
            </h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {specs.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2 border-b border-line pb-1">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Facilities ------------------------------------------------------ */}
        {listing.facilities.length > 0 && (
          <section className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {tB("facilitiesHeading")}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {listing.facilities.slice(0, 10).map((f) => (
                <li
                  key={f}
                  className="rounded-full border border-line px-3 py-1 text-xs font-medium"
                >
                  ✓ {f.charAt(0).toUpperCase()}
                  {f.slice(1)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Agent card ------------------------------------------------------ */}
        <section className="mt-6 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 print:bg-transparent">
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-crimson text-lg font-bold text-white"
          >
            {(listing.agent_display_name ?? "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{listing.agent_display_name}</p>
            <p className="text-sm text-muted">
              {listing.share_url && (
                <>
                  {tB("contactLine")}{" "}
                  <span className="font-medium text-foreground">{listing.share_url}</span>
                </>
              )}
            </p>
          </div>
        </section>

        <footer className="mt-6 border-t border-line pt-3 text-center text-[11px] text-muted">
          {appName}
        </footer>
      </article>
    </div>
  );
}
