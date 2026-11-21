/**
 * Country helpers for the International section.
 *
 * Names always come from `Intl.DisplayNames` in the reader's language — there
 * is no country list in this repository to go stale.
 */

/**
 * The home market: listed first and selected by default (owner, 21 Nov 2026).
 * The one place this decision is written down.
 */
export const HOME_COUNTRY = "ID";

/** Languages the public marketplace ships; anything else falls back to the first. */
export const MARKETPLACE_LOCALES = ["id", "en"] as const;

const CODE = /^[A-Z]{2}$/;

export function isCountryCode(v: unknown): v is string {
  return typeof v === "string" && CODE.test(v);
}

/** "Malaysia" for "MY" in the given language; the code itself when unknown. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region", fallback: "code" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export type CountryCount = { code: string; name: string; count: number };

/**
 * Countries present in a set of rows: the home country first (even with no
 * listings, so the default tab always exists), then by listing count, then by
 * name.
 */
export function countryCounts(rows: { country_code: string }[], locale: string): CountryCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.country_code, (counts.get(r.country_code) ?? 0) + 1);
  if (!counts.has(HOME_COUNTRY)) counts.set(HOME_COUNTRY, 0);
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count, name: countryName(code, locale) }))
    .sort((a, b) =>
      a.code === HOME_COUNTRY ? -1
      : b.code === HOME_COUNTRY ? 1
      : b.count - a.count || a.name.localeCompare(b.name, locale));
}

/** `+62 812-345` → `62812345`, for a `https://wa.me/<digits>` link. */
export function waDigits(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Normalise a typed WhatsApp number to E.164: spaces, dashes, dots and
 * brackets are dropped, a leading `00` becomes `+`, and a missing `+` is
 * added. Returns null when the result is not a valid international number —
 * a local number starting with 0 is refused rather than guessed at.
 */
export function normalisePhone(raw: string): string | null {
  let v = raw.trim().replace(/[\s\-().]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (!v.startsWith("+")) v = `+${v}`;
  return /^\+[1-9][0-9]{7,14}$/.test(v) ? v : null;
}
