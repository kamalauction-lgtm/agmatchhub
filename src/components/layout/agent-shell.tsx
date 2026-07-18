import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { count: unread } = user
    ? await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null)
    : { count: 0 };

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
            <Link href="/submissions" className="hover:text-crimson">{t("submissions")}</Link>
            <Link href="/profile" className="hover:text-crimson">{t("profile")}</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/notifications" aria-label={t("notifications")}
            className="relative rounded-lg border border-line px-3 py-2 text-sm hover:border-crimson">
            🔔
            {(unread ?? 0) > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </Link>
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
