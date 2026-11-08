import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

/**
 * Locale resolution (spec §34): saved user preference (cookie, later synced
 * with profile) → English fallback. Cookie-based, no URL prefix — the app is
 * a private tool, not an SEO site. Never IP-based.
 */
export const locales = ["en", "ms", "id"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export default getRequestConfig(async ({ requestLocale }) => {
  // An explicitly requested locale wins — getTranslations({locale}) arrives
  // here, and ignoring it silently serves the cookie language instead. The
  // Content Studio depends on this: listing copy follows the LISTING's
  // language column, not the UI locale.
  const requested = await requestLocale;
  let locale: Locale;
  if (requested && (locales as readonly string[]).includes(requested)) {
    locale = requested as Locale;
  } else {
    const store = await cookies();
    const cookieLocale = store.get("locale")?.value;
    locale = (locales as readonly string[]).includes(cookieLocale ?? "")
      ? (cookieLocale as Locale)
      : defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
