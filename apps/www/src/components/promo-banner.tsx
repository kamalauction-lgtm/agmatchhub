import { mediaUrl } from "@/lib/format";
import { PinIcon } from "./icons";
import type { SiteBanner } from "@/lib/listings";

/**
 * An advertising placement — a developer campaign for a new project.
 *
 * Two things this component will not do:
 *
 *   1. Render without an advertising label. The label is not a prop and cannot
 *      be switched off. A buyer must be able to tell in one glance that this is
 *      a paid placement and not a listing our moderation stands behind — the
 *      same rule the promoted rail follows, and the point on which both
 *      benchmark portals are weakest.
 *   2. Follow an outbound link without `rel="sponsored noopener"`. `sponsored`
 *      is what Google asks for on paid links; omitting it on a page full of
 *      them is a real ranking risk for the whole domain.
 *
 * Artwork is a background image with the copy rendered as live text over it,
 * rather than baked into the image: it stays legible on a phone, it is
 * selectable and translatable, and it does not disappear for anyone browsing
 * with images off.
 */
export function PromoBanner({
  banner,
  adLabel,
  size = "wide",
}: {
  banner: SiteBanner;
  /** "Iklan" / "Advertisement". Always rendered. */
  adLabel: string;
  size?: "wide" | "tall";
}) {
  const img = mediaUrl(banner.image_path);
  const isExternal = !!banner.link_url && /^https?:\/\//i.test(banner.link_url);

  const body = (
    <>
      {/* Artwork sits behind the copy; decorative, so it carries no alt text. */}
      {img && (
        <span
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${img})` }}
        />
      )}
      <span
        aria-hidden
        className={`absolute inset-0 ${
          img
            ? "bg-gradient-to-r from-black/75 via-black/45 to-transparent"
            : "bg-gradient-to-r from-brand to-brand-strong"
        }`}
      />

      <span className="relative flex flex-col items-start gap-1">
        <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
          {adLabel}
        </span>

        <span className="mt-1 text-xl font-extrabold leading-tight text-white sm:text-2xl">
          {banner.title}
        </span>

        {banner.subtitle && (
          <span className="max-w-xl text-sm text-white/85">{banner.subtitle}</span>
        )}

        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
          {/* An SVG pin, not the 📍 emoji it replaced: an emoji renders in a
              different typeface on every platform, ignores the surrounding
              colour, and is the clearest tell that a page was assembled
              rather than designed. */}
          {banner.location_label && (
            <span className="inline-flex items-center gap-1">
              <PinIcon className="h-4 w-4" />
              {banner.location_label}
            </span>
          )}
          {banner.price_label && (
            <span className="font-semibold text-white">{banner.price_label}</span>
          )}
        </span>

        {banner.cta_label && (
          <span className="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-foreground">
            {banner.cta_label}
          </span>
        )}

        {banner.advertiser_label && (
          <span className="mt-2 text-[11px] text-white/70">{banner.advertiser_label}</span>
        )}
      </span>
    </>
  );

  const className = `relative flex overflow-hidden rounded-card ${
    size === "tall" ? "min-h-56 p-6" : "min-h-40 p-5 sm:p-7"
  }`;

  if (!banner.link_url) {
    return <div className={className}>{body}</div>;
  }

  return (
    <a
      href={banner.link_url}
      // `sponsored` on every paid link, and noopener on anything leaving the
      // site. Internal campaign links get neither, correctly.
      rel={isExternal ? "sponsored noopener noreferrer" : "sponsored"}
      target={isExternal ? "_blank" : undefined}
      className={`${className} transition hover:opacity-95`}
    >
      {body}
    </a>
  );
}
