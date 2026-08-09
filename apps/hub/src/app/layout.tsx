import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { brand } from "@/config/brand";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Static metadata becomes generateMetadata so the browser tab honours the
 * identity flag (migration 00048). Hiding the logo while the tab still reads
 * "IQI AG Agent Platform" would give the game away in the most visible place
 * there is.
 */
export async function generateMetadata(): Promise<Metadata> {
  const name = (await isPartnerIdentityPublic())
    ? brand.appName
    : brand.appNameNeutral;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: brand.tagline,
    applicationName: name,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Empty client bundle: all translation happens server-side. This keeps
            the full message dictionary (incl. agent/commission vocabulary) out
            of client-page HTML (§78). Scope a provider per-route if a client
            component ever needs useTranslations. */}
        <NextIntlClientProvider messages={{}}>{children}</NextIntlClientProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
