import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { brand } from "@/config/brand";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const partnerIdentityPublic = await isPartnerIdentityPublic();
  const tc = await getTranslations("common");
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" aria-label={partnerIdentityPublic ? brand.appName : brand.appNameNeutral}>
          <BrandLockup size={28} partnerIdentityPublic={partnerIdentityPublic} />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle label={tc("toggleTheme")} />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-md rounded-2xl border border-line bg-background p-8 shadow-sm">
          {children}
        </div>
      </main>
      <footer className="px-6 py-4 text-center text-xs text-muted">
        {partnerIdentityPublic ? brand.appName : brand.appNameNeutral} — {brand.tagline}
      </footer>
    </div>
  );
}
