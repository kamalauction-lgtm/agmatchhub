import Image from "next/image";
import type { AgentCard, CardListing } from "@/lib/card/data";
import { cardPhotoUrl, cardUrl } from "@/lib/card/data";
import { CardActions } from "./card-actions";
import {
  ArrowRightIcon, CheckBadgeIcon, HomesIcon, PinIcon, PLATFORM_ICONS, LinkIcon,
} from "./card-icons";

/**
 * The card itself — one presentational server component shared by the public
 * page (/c/[slug]) and the agent's own management view (/card), so the
 * preview an agent sees IS what their contact receives.
 *
 * Mobile-first single column: this link is opened from a WhatsApp chat far
 * more often than from a desktop.
 *
 * Everything on it is real. A card that pads itself out with invented
 * credentials is worse than a short one, so each block below renders only when
 * its data exists — an agent who has not written a biography simply does not
 * have that paragraph, and the layout closes up around it.
 */

/** `https://wa.me/62812xxxx` → `62812xxxx`; anything unparseable → null. */
function phoneFromLinks(links: AgentCard["links"]): string | null {
  for (const l of links) {
    if (l.platform !== "whatsapp") continue;
    const m = l.url.match(/(?:wa\.me\/|phone=)\+?(\d{7,15})/);
    if (m) return m[1];
  }
  return null;
}

/** Initials, minus the professional titles Malaysian and Indonesian names carry. */
function initialsOf(name: string | null): string {
  if (!name) return "?";
  const words = name
    .replace(/\b(pmgr|mgr|ts|dr|ir|hj|h\.|sr|jr|prof)\b\.?/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || name[0]).toUpperCase();
}

function shortPrice(value: number | null, currency: string | null): string | null {
  if (!value) return null;
  const c = currency ?? "IDR";
  if (c === "IDR") {
    if (value >= 1_000_000_000) {
      const n = value / 1_000_000_000;
      return `Rp ${(n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)).replace(".", ",")} M`;
    }
    return `Rp ${Math.round(value / 1_000_000)} jt`;
  }
  return `${c} ${value.toLocaleString()}`;
}

export type CardLabels = {
  verified: string;
  listings: string;
  viewListings: string;
  saveContact: string;
  share: string;
  copied: string;
  recentListings: string;
  scanToSave: string;
  activeListings: string;
  platform: Record<string, string>;
};

export function CardView({
  card,
  labels,
  listings = [],
  qrDataUrl,
  marketplaceUrlOverride,
}: {
  card: AgentCard;
  labels: CardLabels;
  listings?: CardListing[];
  qrDataUrl?: string | null;
  marketplaceUrlOverride?: string;
}) {
  const photo = cardPhotoUrl(card);
  const place = [card.city, card.state_region].filter(Boolean).join(", ");
  const marketplaceUrl =
    marketplaceUrlOverride ??
    process.env.NEXT_PUBLIC_MARKETPLACE_URL ??
    "https://www.propertiguru.id";

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      {/* Header band. The dot grid gives the block some depth without an image
          request that could fail on a phone in a lift. */}
      <div className="relative h-24 bg-gradient-to-br from-crimson to-crimson-strong">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:14px_14px]"
        />
      </div>

      <div className="-mt-12 px-5 pb-6 text-center">
        {photo ? (
          /* `object-top`, not the default centre. Profile photos are portrait
             far more often than square — Kamal's is 1024×1536 — and centring a
             2:3 photo inside a circle crops to the chest, cutting the face off
             at the top of the frame. Faces sit high in a portrait, so anchoring
             there keeps them in view. A square or landscape source has no
             vertical overflow, so this changes nothing for them. */
          <Image
            src={photo}
            alt={card.display_name ?? ""}
            width={96}
            height={96}
            unoptimized
            className="mx-auto h-24 w-24 rounded-full border-4 border-surface bg-surface object-cover object-top shadow-sm"
          />
        ) : (
          <span
            aria-hidden
            className="mx-auto grid h-24 w-24 place-items-center rounded-full border-4 border-surface bg-crimson text-3xl font-bold text-white shadow-sm"
          >
            {initialsOf(card.display_name)}
          </span>
        )}

        <h1 className="mt-3 text-xl font-bold leading-tight">{card.display_name}</h1>

        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted">
          {card.is_verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
              <CheckBadgeIcon className="h-3.5 w-3.5" />
              {labels.verified}
            </span>
          )}
          {card.agency_name && <span>{card.agency_name}</span>}
        </div>

        {place && (
          <p className="mt-1.5 flex items-center justify-center gap-1 text-sm text-muted">
            <PinIcon className="h-4 w-4" />
            {place}
          </p>
        )}

        {card.biography && (
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">{card.biography}</p>
        )}

        {/* One honest number. It is the only figure on the card, and it comes
            straight from the published count. */}
        {card.published_listing_count > 0 && (
          <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl border border-line bg-background px-4 py-2">
            <span className="text-lg font-extrabold leading-none text-crimson">
              {card.published_listing_count}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              {labels.activeListings}
            </span>
          </div>
        )}

        {/* Actions -------------------------------------------------------- */}
        <div className="mt-5">
          <CardActions
            vcard={{
              name: card.display_name ?? card.public_slug,
              org: card.agency_name,
              cardUrl: cardUrl(card.public_slug),
              phone: phoneFromLinks(card.links),
            }}
            labels={{
              saveContact: labels.saveContact,
              share: labels.share,
              copied: labels.copied,
            }}
          />
        </div>

        {/* Links ---------------------------------------------------------- */}
        <div className="mt-5 space-y-2 text-left">
          <a
            href={`${marketplaceUrl}/agent/${card.public_slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
          >
            <HomesIcon className="h-5 w-5 shrink-0 text-crimson" />
            <span className="min-w-0 flex-1 truncate">{labels.viewListings}</span>
            {card.published_listing_count > 0 && (
              <span className="shrink-0 text-xs font-medium text-muted">
                {card.published_listing_count} {labels.listings}
              </span>
            )}
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted" />
          </a>

          {card.links.map((l) => {
            const Icon = PLATFORM_ICONS[l.platform] ?? LinkIcon;
            return (
              <a
                key={`${l.platform}-${l.url}`}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm font-semibold transition-colors duration-200 hover:border-crimson hover:text-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
              >
                <Icon className="h-5 w-5 shrink-0 text-crimson" />
                <span className="min-w-0 flex-1 truncate">
                  {l.display_label || labels.platform[l.platform] || l.platform}
                </span>
                <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted" />
              </a>
            );
          })}
        </div>

        {/* Recent listings — evidence rather than a claim ------------------ */}
        {listings.length > 0 && (
          <section className="mt-6 text-left">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {labels.recentListings}
            </h2>
            <div className="mt-2 space-y-2">
              {listings.map((l) => {
                const price = shortPrice(l.price, l.currency);
                const where = [l.regency_name, l.province_name].filter(Boolean).join(", ");
                return (
                  <a
                    key={l.id}
                    href={`${marketplaceUrl}/properti/${l.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-3 transition-colors duration-200 hover:border-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">{l.title}</p>
                      {where && <p className="mt-0.5 truncate text-xs text-muted">{where}</p>}
                    </div>
                    {price && (
                      <span className="shrink-0 text-sm font-bold text-crimson">{price}</span>
                    )}
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* QR — the point of a name card is to be handed over in person. */}
        {qrDataUrl && (
          <div className="mt-6 flex flex-col items-center border-t border-line pt-5">
            {/* eslint-disable-next-line @next/next/no-img-element --
                a generated data: URI, so there is no host for next/image to
                optimise and nothing to lazy-load. */}
            <img
              src={qrDataUrl}
              alt=""
              aria-hidden
              width={112}
              height={112}
              className="h-28 w-28 rounded-lg bg-white p-1"
            />
            <p className="mt-2 text-xs text-muted">{labels.scanToSave}</p>
          </div>
        )}
      </div>
    </div>
  );
}
