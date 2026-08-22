import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { routing } from "@/i18n/routing";

function href(locale: string, path: string) {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations("nav");
  const other = locale === "id" ? "en" : "id";

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
            href={href(locale, "/cari?type=sale")}
            className="rounded-lg px-3 py-2 hover:bg-surface"
          >
            {t("buy")}
          </Link>
          <Link
            href={href(locale, "/cari?type=rent")}
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
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold uppercase hover:bg-surface"
          >
            {other}
          </Link>
          <a
            href={brand.hubUrl}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            {t("agentLogin")}
          </a>
        </div>
      </div>
    </header>
  );
}
