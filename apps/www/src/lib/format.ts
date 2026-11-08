/**
 * Price, area and date formatting for whichever market this build serves.
 *
 * Property prices are long numbers, and every market abbreviates them its own
 * way: an Indonesian listing says "Rp2,15 miliar", a Malaysian one "RM1.25
 * mil" in English and "RM1.25 juta" in Malay. Those are not translations of
 * each other — the short-scale WORDS differ, the decimal separator differs and
 * the grouping differs. All three come from the market and the locale rather
 * than from a literal.
 *
 * The exact figure is always kept for the detail page; only cards abbreviate.
 */
import { market } from "@/config/market";

/**
 * The UI locale ("en", "ms", "id") is not an Intl locale. Combining it with the
 * market's country gives the right one in every case this platform has:
 * en-MY and ms-MY on the Malaysian build, id-ID and en-ID on the Indonesian
 * one. That matters — plain "en" groups as 1,250,000 with a dot decimal, which
 * is correct for Malaysia and wrong for Indonesia.
 */
export function numberLocaleFor(locale: string): string {
  return `${locale}-${market.country}`;
}

function money(currency: string, locale: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

/**
 * Currency, with the symbol closed up against the figure — "Rp2.150.000.000",
 * "RM1,250,000" — which is how property portals in both markets print it.
 *
 * Done by dropping the whitespace-only `literal` part rather than by a regex
 * on the output. The previous version matched `[\s<U+00A0>]` with the
 * non-breaking space written as an invisible literal character in the source,
 * which is unreadable and broke the moment anyone retyped the line. The parts
 * API says which piece is the gap, so nothing has to be guessed.
 */
function closeUp(value: number, currency: string, locale: string): string {
  return money(currency, locale)
    .formatToParts(value)
    .filter((part) => !(part.type === "literal" && part.value.trim() === ""))
    .map((part) => part.value)
    .join("");
}

export function formatPriceExact(
  value: number | null,
  currency = market.currency,
  locale = market.defaultLocale
): string {
  if (value == null) return "—";
  return closeUp(value, currency, numberLocaleFor(locale));
}

/**
 * Join place names without repeating one. Agents type a general address that
 * often already contains the district or city, so naive joining produces
 * "Blok M, Jakarta Selatan, Jakarta Selatan, DKI Jakarta". Comparison is
 * case-insensitive and ignores a segment already contained in an earlier one.
 */
export function joinPlaceParts(parts: Array<string | null | undefined>): string {
  const kept: string[] = [];
  for (const raw of parts) {
    const part = raw?.trim();
    if (!part) continue;
    const lower = part.toLowerCase();
    const duplicate = kept.some((k) => {
      const kl = k.toLowerCase();
      return kl === lower || kl.includes(lower);
    });
    if (!duplicate) kept.push(part);
  }
  return kept.join(", ");
}

/**
 * Short-scale words, per LOCALE. Not translations of each other:
 *   · Indonesian "miliar" and Malay "bilion" are the same value, different
 *     words, and Malay does not use "miliar" at all.
 *   · English-Malaysian property copy abbreviates instead of spelling the
 *     scale out — "RM1.25 mil", "RM950k" — which is what the portals print.
 */
const SCALE: Record<string, Array<[number, string]>> = {
  id: [
    [1_000_000_000_000, "triliun"],
    [1_000_000_000, "miliar"],
    [1_000_000, "juta"],
    [1_000, "ribu"],
  ],
  ms: [
    [1_000_000_000_000, "trilion"],
    [1_000_000_000, "bilion"],
    [1_000_000, "juta"],
    [1_000, "ribu"],
  ],
  en: [
    [1_000_000_000, "bil"],
    [1_000_000, "mil"],
    [1_000, "k"],
  ],
};

/**
 * English abbreviations close up against the figure — "RM950k", "RM1.25mil" —
 * the way Malaysian portals print them. Spelled-out scales always take a
 * space: "Rp2,15 miliar", not "Rp2,15miliar".
 */
const CLOSED_UP_SCALES = new Set(["k", "mil", "bil"]);

/** The symbol Intl gives for a currency, so no component hard-codes Rp or RM. */
function symbolOf(currency: string, locale: string): string {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency })
      .formatToParts(1)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

/** Compact form for cards and search results. */
export function formatPriceShort(
  value: number | null,
  currency = market.currency,
  locale = market.defaultLocale
): string {
  if (value == null) return "—";

  const units = SCALE[locale] ?? SCALE.en;
  const numberLocale = numberLocaleFor(locale);

  for (const [size, label] of units) {
    if (value >= size) {
      const n = value / size;
      const text = (n >= 100 ? Math.round(n) : Number(n.toFixed(2))).toLocaleString(numberLocale);
      const gap = CLOSED_UP_SCALES.has(label) ? "" : " ";
      return `${symbolOf(currency, numberLocale)}${text}${gap}${label}`;
    }
  }
  return formatPriceExact(value, currency, locale);
}

/** Rent periods are words, so they follow the LOCALE, not the market. */
const RENT_PERIOD: Record<string, { monthly: string; yearly: string }> = {
  id: { monthly: "/bulan", yearly: "/tahun" },
  ms: { monthly: "/sebulan", yearly: "/setahun" },
  en: { monthly: "/month", yearly: "/year" },
};

export function formatRentPeriod(
  period: string | null,
  locale = market.defaultLocale
): string {
  const words = RENT_PERIOD[locale] ?? RENT_PERIOD.en;
  if (period === "monthly") return words.monthly;
  if (period === "yearly") return words.yearly;
  return "";
}

/**
 * Area. The unit comes from the LISTING, never from the market — a Malaysian
 * build must still render an imported square-metre figure as m² rather than
 * silently relabelling it sqft, which would misstate the size by a factor of
 * about eleven.
 */
export function formatArea(
  value: number | null,
  // `string`, not the union: this comes straight off a listing row, where the
  // column is text. The runtime check below is what decides the symbol.
  unit: string = market.measurementUnit,
  locale = market.defaultLocale
): string {
  if (value == null) return "—";
  const n = value % 1 === 0 ? value : Number(value.toFixed(1));
  return `${n.toLocaleString(numberLocaleFor(locale))} ${unit === "sqft" ? "sqft" : "m²"}`;
}

export function formatCount(
  value: number | null,
  locale = market.defaultLocale
): string {
  return value == null ? "—" : value.toLocaleString(numberLocaleFor(locale));
}

/** "3 days ago" / "3 hari lalu" — relative time for listing freshness. */
export function formatRelativeDate(
  iso: string | null,
  locale = market.defaultLocale
): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (days < 1) return rtf.format(0, "day");
  if (days < 30) return rtf.format(-days, "day");
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

/**
 * Public storage URL for a listing image. Media lives in a public bucket;
 * anything private is served through signed URLs by the hub, never here.
 */
export function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  // A leading slash means an asset served by this site (`/banners/x.svg`), not
  // a storage object. Without this the path is rewritten into a storage URL
  // that 404s, and because the caller draws a gradient over the image the
  // failure is invisible — the artwork simply never appears.
  if (path.startsWith("/")) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${path.replace(/^\/+/, "")}`;
}

/**
 * A profile photo's public URL.
 *
 * `profiles.avatar_url` stores the object path WITHOUT its bucket
 * ("<uid>/photo-123.png"), because the uploader already knows which bucket it
 * wrote to. `mediaUrl` cannot know that, so passing an avatar through it
 * produces a URL that 400s — which is why the agent card showed no photo even
 * for agents who have one.
 */
const AVATAR_BUCKET = "agent-profile-public";

export function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("/")) return path;
  const clean = path.replace(/^\/+/, "");
  // Tolerate a path that already names the bucket, so this stays correct if
  // the column is ever normalised.
  return mediaUrl(clean.startsWith(`${AVATAR_BUCKET}/`) ? clean : `${AVATAR_BUCKET}/${clean}`);
}

/** Up to two initials, for when there is no photo to show. */
export function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const words = name
    .replace(/\b(pmgr|mgr|ts|dr|ir|hj|h\.|sr|jr)\b\.?/gi, " ")   // titles, not names
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]).join("");
  return (letters || name[0]).toUpperCase();
}

/**
 * Price per square metre — 99.co's "psf" line, in the unit Indonesia uses.
 *
 * Derived, so it is always rendered with its own label. Returns null when
 * there is no size to divide by rather than showing a number that means
 * nothing.
 */
export function pricePerArea(
  price: number | null,
  size: number | null,
  currency = "IDR",
): string | null {
  if (!price || !size || size <= 0) return null;
  return `${formatPriceShort(Math.round(price / size), currency)}/m²`;
}

/**
 * Bedroom count as a person would say it.
 *
 * A studio is stored as 0 bedrooms, and printing "0" reads as missing data
 * rather than as the fact it is. Anything else prints as the number.
 */
export function bedroomLabel(count: number | null, studioWord: string): string | null {
  if (count == null) return null;
  return count === 0 ? studioWord : String(count);
}
