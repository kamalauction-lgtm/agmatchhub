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

const isLocale = (v: unknown): v is Locale => (locales as readonly string[]).includes(String(v));

async function profileLocale(): Promise<Locale | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("preferred_language, country_code")
      .eq("id", user.id)
      .maybeSingle();
    if (isLocale(data?.preferred_language)) return data.preferred_language;
    const byCountry = data?.country_code ? COUNTRY_DEFAULT[data.country_code] : undefined;
    return byCountry ?? null;
  } catch {
    // Locale is never worth failing a request over.
    return null;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  let locale: Locale;
  if (isLocale(requested)) {
    locale = requested;
  } else {
    const store = await cookies();
    const cookieLocale = store.get("locale")?.value;
    locale = isLocale(cookieLocale) ? cookieLocale : ((await profileLocale()) ?? defaultLocale);
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
