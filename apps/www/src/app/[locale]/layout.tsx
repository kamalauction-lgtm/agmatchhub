import type { Metadata } from "next";
import { market } from "@/config/market";
import { Inter } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { brand } from "@/config/brand";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "../globals.css";

/**
 * Inter, per the design system sheet — the same face as the agent platform, so
 * the marketplace and the hub read as one company.
 *
 * This replaced Plus Jakarta Sans, which was chosen as an Indonesian-designed
 * typeface (Tokotype, commissioned for Jakarta's city identity). That was a
 * good reason and it is worth recording that it was given up deliberately: one
 * face across both products beat a nicer story on one of them. If the brand
 * ever wants the Jakarta association back, this is the line to change and the
 * argument to re-read.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "brand" });
  const country = market.countryName[locale] ?? market.countryName[market.defaultLocale];

  return {
    metadataBase: new URL(brand.siteUrl),
    title: {
      default: `${brand.appName} — ${t("tagline", { country })}`,
      template: `%s · ${brand.appName}`,
    },
    description: t("tagline", { country }),
    applicationName: brand.appName,
    alternates: {
      canonical: locale === routing.defaultLocale ? "/" : `/${locale}`,
      // Built from the market's locales rather than a hard-coded pair: the
      // default locale is unprefixed, the rest carry their prefix. Indonesia
      // was listing id and en even on a build that serves neither.
      languages: Object.fromEntries(
        market.locales.map((l) => [l, l === market.defaultLocale ? "/" : `/${l}`])
      ),
    },
    openGraph: {
      type: "website",
      // Language and country, e.g. en_MY, ms_MY, id_ID.
      locale: `${locale}_${market.country}`,
      siteName: brand.appName,
    },
    // The brand is unresolved (risk R1) and the catalogue is not yet real.
    // Indexing now would create URLs and reputation under a name that may have
    // to change, so this stays off until both are settled.
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Messages are passed empty: every string on these pages is rendered
            on the server, so shipping the dictionary would only add weight to
            the payload. Scope a provider per-route if a client component ever
            needs useTranslations. */}
        <NextIntlClientProvider messages={{}}>
          <SiteHeader locale={locale} />
          <main className="flex-1">{children}</main>
          <SiteFooter locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
