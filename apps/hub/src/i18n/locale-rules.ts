/**
 * Pure locale rules for the hub (spec §34) — no Next, no Supabase, so the
 * market behaviour can be unit tested. `request.ts` gathers the inputs and
 * calls `resolveLocale`.
 *
 * Indonesia: Bahasa Indonesia default, English alternative.
 * Malaysia:  English default, Bahasa Melayu alternative.
 * Unknown market: every UI language, English default.
 */
export const locales = ["en", "ms", "id"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Default UI language per market, mirroring `countries` (id-first for ID). */
const COUNTRY_DEFAULT: Record<string, Locale> = { ID: "id", MY: "en" };

/** The agent's selectable UI languages are country-scoped. */
const COUNTRY_LANGUAGES: Record<string, readonly Locale[]> = {
  ID: ["id", "en"],
  MY: ["en", "ms"],
};

export function allowedLocalesForCountry(countryCode: string | null | undefined): readonly Locale[] {
  return COUNTRY_LANGUAGES[countryCode ?? ""] ?? locales;
}

export const isLocale = (v: unknown): v is Locale => (locales as readonly string[]).includes(String(v));

/**
 * Resolution order:
 *   1. an explicitly requested locale (Content Studio asks for the listing's language);
 *   2. the `locale` cookie, if it is a language this agent's market offers;
 *   3. the saved `profiles.preferred_language`, same condition;
 *   4. the market default;
 *   5. English.
 */
export function resolveLocale(input: {
  requested?: string | null;
  cookie?: string | null;
  preferred?: string | null;
  countryCode?: string | null;
}): Locale {
  if (isLocale(input.requested)) return input.requested;
  const allowed = allowedLocalesForCountry(input.countryCode);
  if (isLocale(input.cookie) && allowed.includes(input.cookie)) return input.cookie;
  if (isLocale(input.preferred) && allowed.includes(input.preferred)) return input.preferred;
  return COUNTRY_DEFAULT[input.countryCode ?? ""] ?? defaultLocale;
}
