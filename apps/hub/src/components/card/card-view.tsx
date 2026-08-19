import Image from "next/image";
import type { AgentCard } from "@/lib/card/data";
import { profilePhotoUrl, cardUrl } from "@/lib/card/data";
import { CardActions } from "./card-actions";

/**
 * The card itself — one presentational server component shared by the public
 * page (/c/[slug]) and the agent's own management view (/card), so the
 * preview an agent sees IS what their contact receives.
 *
 * Mobile-first single column: this link is opened from a WhatsApp chat far
 * more often than from a desktop.
 */

const PLATFORM_ICON: Record<string, string> = {
  facebook: "📘",
  instagram: "📸",
  linkedin: "💼",
  tiktok: "🎵",
  youtube: "▶️",
  whatsapp: "💬",
  telegram: "✈️",
  website: "🌐",
  agency_profile: "🏢",
  other: "🔗",
};

/** `https://wa.me/62812xxxx` → `62812xxxx`; anything unparseable → null. */
function phoneFromLinks(links: AgentCard["links"]): string | null {
  for (const l of links) {
    if (l.platform !== "whatsapp") continue;
    const m = l.url.match(/(?:wa\.me\/|phone=)\+?(\d{7,15})/);
    if (m) return m[1];
  }
  return null;
}

export type CardLabels = {
  verified: string;
  listings: string;
  viewListings: string;
  saveContact: string;
  share: string;
  copied: string;
  platform: Record<string, string>;
};

export function CardView({ card, labels }: { card: AgentCard; labels: CardLabels }) {
  const photo = profilePhotoUrl(card.profile_photo_path) ?? card.avatar_url;
  const place = [card.city, card.state_region].filter(Boolean).join(", ");
  const marketplaceUrl =
    process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? "https://www.propertiguru.id";

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {/* Header band ------------------------------------------------------ */}
      <div className="h-20 bg-gradient-to-r from-crimson to-crimson-strong" />

      <div className="-mt-10 px-5 pb-6 text-center">
        {photo ? (
          <Image
            src={photo}
            alt=""
            width={80}
            height={80}
            unoptimized
            className="mx-auto h-20 w-20 rounded-full border-4 border-surface object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="mx-auto grid h-20 w-20 place-items-center rounded-full border-4 border-surface bg-crimson text-2xl font-bold text-white"
          >
            {(card.display_name ?? "?").charAt(0).toUpperCase()}
          </span>
        )}

        <h1 className="mt-3 text-xl font-bold">{card.display_name}</h1>

        <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          {card.is_verified && (
            <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
              ✓ {labels.verified}
            </span>
          )}
          {card.agency_name && <span>{card.agency_name}</span>}
        </div>
        {place && <p className="mt-1 text-sm text-muted">📍 {place}</p>}

        {card.biography && (
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">{card.biography}</p>
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
            className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm font-semibold transition hover:border-crimson"
          >
            <span aria-hidden>🏘️</span>
            <span className="min-w-0 flex-1 truncate">{labels.viewListings}</span>
            {card.published_listing_count > 0 && (
              <span className="text-xs font-medium text-muted">
                {card.published_listing_count} {labels.listings}
              </span>
            )}
            <span aria-hidden className="text-muted">→</span>
          </a>

          {card.links.map((l) => (
            <a
              key={`${l.platform}-${l.url}`}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm font-semibold transition hover:border-crimson"
            >
              <span aria-hidden>{PLATFORM_ICON[l.platform] ?? "🔗"}</span>
              <span className="min-w-0 flex-1 truncate">
                {l.display_label || labels.platform[l.platform] || l.platform}
              </span>
              <span aria-hidden className="text-muted">→</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
