import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { brand } from "@/config/brand";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "../globals.css";

// Plus Jakarta Sans is an Indonesian-designed typeface (Tokotype, commissioned
// for Jakarta's city identity) with full Latin-Extended coverage. Fitting, and
// it reads well at small sizes on the cheap Android screens most of this
// audience browses on.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
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

  return {
    metadataBase: new URL(brand.siteUrl),
    title: { default: `${brand.appName} — ${t("tagline")}`, template: `%s · ${brand.appName}` },
    description: t("tagline"),
    applicationName: brand.appName,
    alternates: {
      canonical: locale === routing.defaultLocale ? "/" : `/${locale}`,
      languages: { id: "/", en: "/en" },
    },
    openGraph: {
      type: "website",
      locale: locale === "id" ? "id_ID" : "en_US",
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
    <html lang={locale} className={`${jakarta.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* Messages are passed empty: every string on these pages is rendered
            on the server, so shipping the dictionary would only add weight to
            the payload. Scope a provider per-route if a client component ever
            needs useTranslations. */}
        <NextIntlClientProvider messages={{}}>
          <SiteHeader locale={locale} />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
