import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Locale resolution (spec §34), in order:
 *
 *   1. explicit request locale — getTranslations({locale}) arrives here, and
 *      the Content Studio depends on it (listing copy follows the LISTING's
 *      language, not the UI);
 *   2. the `locale` cookie — the user's explicit choice from the switcher;
 *   3. the signed-in user's saved `profiles.preferred_language`;
 *   4. the default for the user's country — Indonesian agents (country_code
 *      ID) get Bahasa Indonesia, Malaysian agents English (BM is one click);
 *   5. English.
 *
 * Steps 3–4 were missing: an Indonesian agent with no cookie saw English on
 * first sign-in (pilot rehearsal, 9 Nov 2026). Cookie-based, no URL prefix —
 * the hub is a private tool, not an SEO surface. Never IP-based.
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
const isLocale = (v: unknown): v is Locale => (locales as readonly string[]).includes(String(v));

type ProfileLocale = { preferred: Locale | null; countryCode: string | null };
async function profileLocale(): Promise<ProfileLocale> {
  const fallback: ProfileLocale = { preferred: null, countryCode: null };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fallback;
    const { data } = await supabase.from("profiles")
      .select("preferred_language, country_code").eq("id", user.id).maybeSingle();
    return {
      preferred: isLocale(data?.preferred_language) ? data.preferred_language : null,
      countryCode: data?.country_code ?? null,
    };
  } catch {
    // Missing preferences must not prevent page access.
    return fallback;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  let locale: Locale;
  if (isLocale(requested)) {
    // Content Studio may explicitly request the listing's content language.
    locale = requested;
  } else {
    const store = await cookies();
    const cookieLocale = store.get("locale")?.value;
    const profile = await profileLocale();
    const allowed = allowedLocalesForCountry(profile.countryCode);
    if (isLocale(cookieLocale) && allowed.includes(cookieLocale)) {
      locale = cookieLocale;
    } else if (profile.preferred && allowed.includes(profile.preferred)) {
      locale = profile.preferred;
    } else {
      locale = COUNTRY_DEFAULT[profile.countryCode ?? ""] ?? defaultLocale;
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
