import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { routing, publicPath } from "@/i18n/routing";
import { market } from "@/config/market";
import { SparkIcon } from "./icons";

function href(locale: string, path: string) {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

const LOCALE_LABEL: Record<string, string> = { en: "EN", ms: "BM", id: "ID" };

/**
 * 2.0 header: the brand mark stays red (it is the one place red leads), the
 * navigation gains the two new tools, and the concierge link carries the
 * electric accent so it reads as the AI entry point everywhere on the site.
 */
export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations("nav");
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;
  const isStaging = process.env.NEXT_PUBLIC_ENVIRONMENT === "staging";

  const navLink =
    "rounded-lg px-3 py-2 text-sm font-medium text-muted-strong transition-colors duration-200 hover:bg-surface hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/80 backdrop-blur-md">
      {isStaging && (
        <div className="bg-gold-soft text-center text-[11px] font-semibold uppercase tracking-wide text-gold-ink">
          {t("stagingBanner")}
        </div>
      )}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link href={href(locale, "/")} className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-black text-white">
            P
          </span>
          <span>{brand.shortName}</span>
          <span className="hidden rounded-md border border-electric/30 bg-electric-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-electric sm:inline">
            2.0
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 md:flex" aria-label={t("primary")}>
          <Link href={`${publicPath(locale, "search")}?type=sale`} className={navLink}>{t("buy")}</Link>
          <Link href={`${publicPath(locale, "search")}?type=rent`} className={navLink}>{t("rent")}</Link>
          <Link href={publicPath(locale, "compare")} className={navLink}>{t("compare")}</Link>
          <Link
            href={publicPath(locale, "assistant")}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-electric transition-colors duration-200 hover:bg-electric-soft"
          >
            <SparkIcon className="h-4 w-4" />
            {t("assistant")}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={publicPath(locale, "assistant")}
            aria-label={t("assistant")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-electric/30 bg-electric-soft text-electric md:hidden"
          >
            <SparkIcon className="h-4 w-4" />
          </Link>
          <Link
            href={`/${other === routing.defaultLocale ? "" : other}`}
            hrefLang={other}
            aria-label={t("language")}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line px-2.5 text-xs font-semibold uppercase transition-colors duration-200 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric"
          >
            {LOCALE_LABEL[other] ?? other.toUpperCase()}
          </Link>
          <a
            href={market.hubUrl}
            className="hidden min-h-11 cursor-pointer items-center rounded-lg bg-navy px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-electric-strong sm:inline-flex"
          >
            {t("agentLogin")}
          </a>
        </div>
      </div>
    </header>
  );
}
