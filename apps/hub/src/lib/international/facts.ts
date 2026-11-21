import type { IntlListing } from "./types";
import { numberLocale } from "./price";

/** `1–3`, `2`, or null when the source gave neither end. */
export function rangeText(min: number | null, max: number | null, locale: string, fractionDigits = 0): string | null {
  const fmt = (n: number) => new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: fractionDigits }).format(n);
  if (min === null && max === null) return null;
  if (min === null || max === null || min === max) return fmt((min ?? max) as number);
  const [a, b] = min <= max ? [min, max] : [max, min];
  return `${fmt(a)}–${fmt(b)}`;
}

/** `Canggu, Badung, Bali` from whichever of area, city and region exist, without repeats. */
export function placeText(l: Pick<IntlListing, "area" | "city" | "region">): string {
  const parts: string[] = [];
  for (const p of [l.area, l.city, l.region]) {
    const v = p?.trim();
    if (v && !parts.some((x) => x.toLowerCase() === v.toLowerCase())) parts.push(v);
  }
  return parts.join(", ");
}

/** Case- and accent-insensitive "does this listing mention the words typed". */
export function matchesQuery(l: IntlListing, q: string): boolean {
  const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hay = fold([l.title, l.city, l.region, l.area, l.developer_name, l.property_type_label].filter(Boolean).join(" "));
  return fold(q).split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

/**
 * A link to the project's position on a public map, or null without one.
 * A plain link, not an embedded map: no key, no third-party script on our page.
 */
export function mapLink(latitude: number | null, longitude: number | null): string | null {
  if (latitude === null || longitude === null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const lat = latitude.toFixed(6);
  const lng = longitude.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}
