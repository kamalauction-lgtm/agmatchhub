import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing, type Locale } from "./routing";

/**
 * Every page under `[locale]` calls this before using the locale.
 *
 * The middleware skips paths that contain a dot (static files), so a request
 * for `/sitemap.xml`, `/favicon.ico` or `/wp-login.php` reaches the `[locale]`
 * segment with that string as the "locale". The layout already 404s it, but
 * Next renders `generateMetadata` and the page in parallel with the layout, so
 * they ran first and built an invalid Intl tag ("sitemap.xml-ID") — a 500 in
 * production on 10 Nov 2026. Rejecting it here makes those requests a clean 404.
 */
export function requireLocale(locale: string): Locale {
  if (!hasLocale(routing.locales, locale)) notFound();
  return locale;
}
