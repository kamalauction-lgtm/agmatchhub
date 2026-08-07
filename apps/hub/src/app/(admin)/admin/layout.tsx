import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/authz";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { signOut } from "@/app/(auth)/actions";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  const t = await getTranslations("admin");
  const tc = await getTranslations("common");

  return (
    <div className="flex min-h-screen flex-col">
      {/* Wraps rather than overflowing: eight sections no longer fit on one
          line on a narrow window, and an off-screen nav item is an unreachable
          one. */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/admin"><BrandLockup size={28} /></Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium">
            <Link href="/admin" className="hover:text-crimson">{t("nav.overview")}</Link>
            <Link href="/admin/requests" className="hover:text-crimson">{t("nav.requests")}</Link>
            <Link href="/admin/listings" className="hover:text-crimson">{t("nav.listings")}</Link>
            <Link href="/admin/agents" className="hover:text-crimson">{t("nav.agents")}</Link>
            <Link href="/admin/countries" className="hover:text-crimson">{t("nav.countries")}</Link>
            <Link href="/admin/legal" className="hover:text-crimson">{t("nav.legal")}</Link>
            <Link href="/admin/reports" className="hover:text-crimson">{t("nav.reports")}</Link>
            <Link href="/admin/audit" className="hover:text-crimson">{t("nav.audit")}</Link>
            <Link href="/dashboard" className="text-muted hover:text-foreground">{t("nav.agentView")}</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-crimson-soft px-3 py-1 text-xs font-semibold text-crimson">
            {t("badge")}
          </span>
          <LanguageSwitcher />
          <form action={signOut}>
            <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-crimson hover:text-crimson">
              {tc("signOut")}
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
