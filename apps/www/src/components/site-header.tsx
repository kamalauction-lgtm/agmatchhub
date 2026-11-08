import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { routing, publicPath } from "@/i18n/routing";
import { market } from "@/config/market";

function href(locale: string, path: string) {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

/**
 * What each language is CALLED, which is not its ISO code.
 *
 * Malay is "BM" (Bahasa Malaysia) to a Malaysian — "MS" is a code nobody
 * outside software uses, and it reads as an abbreviation of nothing. The
 * agent platform's switcher already says EN / BM / ID; the marketplace was
 * printing the raw locale and so disagreed with it.
 */
const LOCALE_LABEL: Record<string, string> = {
  en: "EN",
  ms: "BM",
  id: "ID",
};

export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations("nav");
  /* The market's OTHER locale, not a hard-coded id/en pair — the Malaysian
     build routes en and ms and cannot serve Indonesian at all. */
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link
          href={href(locale, "/")}
          className="flex items-center gap-2 font-extrabold tracking-tight text-lg"
        >
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white text-sm font-black"
          >
            P
          </span>
          <span>{brand.shortName}</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 text-sm md:flex">
          <Link
            href={`${publicPath(locale, "search")}?type=sale`}
            className="rounded-lg px-3 py-2 hover:bg-surface"
          >
            {t("buy")}
          </Link>
          <Link
            href={`${publicPath(locale, "search")}?type=rent`}
            className="rounded-lg px-3 py-2 hover:bg-surface"
          >
            {t("rent")}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href={`/${other === routing.defaultLocale ? "" : other}`}
            hrefLang={other}
            aria-label={t("language")}
            /* min-h/min-w-11 = 44px, the smallest reliable touch target. This
               was 38×30 and was the only control on the page under it — a
               two-letter label does not have to mean a two-letter hit area. */
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line px-2.5 text-xs font-semibold uppercase transition-colors duration-200 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {LOCALE_LABEL[other] ?? other.toUpperCase()}
          </Link>
          <a
            href={market.hubUrl}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("agentLogin")}
          </a>
        </div>
      </div>
    </header>
  );
}
