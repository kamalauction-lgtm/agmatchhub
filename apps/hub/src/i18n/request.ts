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
import { allowedLocalesForCountry, isLocale, locales, defaultLocale, resolveLocale, type Locale } from "./locale-rules";
export { allowedLocalesForCountry, locales, defaultLocale, type Locale };

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
  // Profile lookups only when nothing explicit decides the language first.
  const store = isLocale(requested) ? null : await cookies();
  const profile = isLocale(requested) ? { preferred: null, countryCode: null } : await profileLocale();
  const locale = resolveLocale({
    requested,
    cookie: store?.get("locale")?.value,
    preferred: profile.preferred,
    countryCode: profile.countryCode,
  });

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
