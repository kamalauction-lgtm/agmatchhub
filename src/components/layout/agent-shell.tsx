import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { signOut } from "@/app/(auth)/actions";

/** Shared chrome for agent-facing pages. */
export async function AgentShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const tc = await getTranslations("common");
  const t = await getTranslations("nav");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" aria-label="Dashboard">
            <BrandLockup size={28} />
          </Link>
          <nav className="hidden items-center gap-4 text-sm font-medium sm:flex">
            <Link href="/dashboard" className="hover:text-crimson">{t("dashboard")}</Link>
            <Link href="/requests" className="hover:text-crimson">{t("requests")}</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <form action={signOut}>
            <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-crimson hover:text-crimson">
              {tc("signOut")}
            </button>
          </form>
        </div>
      </header>
      <main className={`mx-auto w-full ${wide ? "max-w-6xl" : "max-w-3xl"} flex-1 px-6 py-10`}>
        {children}
      </main>
    </div>
  );
}
