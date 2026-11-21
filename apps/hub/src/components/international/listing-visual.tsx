import { Icon } from "@/components/ui/icon";

/**
 * A listing's picture, or — when the catalogue has none yet — a panel that
 * looks deliberate rather than broken: a tinted field with a building mark,
 * the city and the country code. The tint is chosen from the country code so
 * neighbouring cards from different countries are told apart at a glance.
 *
 * Plain <img>: the files live in our own public storage bucket and the Hub
 * runs on Workers without the image optimiser.
 */

const TINTS = [
  "bg-blue-soft text-blue",
  "bg-indigo-soft text-indigo",
  "bg-success-soft text-success-ink",
  "bg-warning-soft text-warning-ink",
  "bg-accent-soft text-accent",
  "bg-crimson-soft text-crimson-strong",
] as const;

function tint(code: string) {
  const n = (code.charCodeAt(0) || 0) * 7 + (code.charCodeAt(1) || 0) * 13;
  return TINTS[n % TINTS.length];
}

export function ListingVisual({
  src,
  alt,
  countryCode,
  place,
  caption,
  className = "",
  eager = false,
}: {
  src: string | null;
  alt: string;
  countryCode: string;
  /** City (or region) shown on the placeholder. */
  place: string;
  /** "Photos coming soon" — said in words, not left to the reader to guess. */
  caption: string;
  className?: string;
  eager?: boolean;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      data-intl-placeholder
      className={`relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden px-4 text-center ${tint(countryCode)} ${className}`}
    >
      <span aria-hidden className="pointer-events-none absolute -right-3 -top-5 select-none text-[7rem] font-black leading-none opacity-10">
        {countryCode}
      </span>
      <Icon name="building" size={44} />
      <span className="max-w-full truncate text-base font-semibold">{place}</span>
      <span className="text-xs font-medium opacity-80">{caption}</span>
    </div>
  );
}

/** Two-letter code in a small tile, then the country's name. Never a flag emoji. */
export function CountryTag({ code, name, className = "" }: { code: string; name: string; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className="grid h-6 min-w-8 shrink-0 place-items-center rounded-md border border-line-strong bg-surface px-1 font-mono text-[11px] font-bold tracking-wide text-muted-strong"
      >
        {code}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
