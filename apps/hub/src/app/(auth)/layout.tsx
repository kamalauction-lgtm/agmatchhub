import Link from "next/link";
import { brand } from "@/config/brand";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" aria-label={brand.appName}>
          <BrandLockup size={28} />
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-md rounded-2xl border border-line bg-background p-8 shadow-sm">
          {children}
        </div>
      </main>
      <footer className="px-6 py-4 text-center text-xs text-muted">
        {brand.appName} — {brand.tagline}
      </footer>
    </div>
  );
}
