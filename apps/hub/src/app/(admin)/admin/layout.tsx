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
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/admin"><BrandLockup size={28} /></Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/admin/requests" className="hover:text-crimson">{t("nav.requests")}</Link>
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
