import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/config/brand";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { signOut } from "@/app/(auth)/actions";

/**
 * Shell for the agent operating system.
 *
 * Rebuilt 4 Aug 2026. The old chrome was MatchHub-shaped: a flat top nav whose
 * items were "My requests" and "My submissions", which framed the whole
 * platform as a co-broke tool. MatchHub is one module (Kamal), so navigation
 * is now grouped by what the agent is doing — daily work, collaboration,
 * account — with room for the modules still to come.
 *
 * Desktop uses a left rail, the shape every benchmarked agent platform
 * converges on because it scales past six destinations. Phones keep a
 * five-tab bottom bar, and the tabs changed too: Leads and Listings replace
 * the MatchHub-specific ones.
 */

type NavItem = {
  href: string;
  icon: string;
  label: string;
  badge?: number;
  accent?: boolean;
};

export async function AgentShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const partnerIdentityPublic = await isPartnerIdentityPublic();
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

  const sections: { title?: string; items: NavItem[] }[] = [
    {
      items: [{ href: "/dashboard", icon: "🏠", label: t("dashboard") }],
    },
    {
      title: t("sectionWork"),
      items: [
        { href: "/leads", icon: "📥", label: t("leads") },
        { href: "/listings", icon: "🏘️", label: t("listings") },
      ],
    },
    {
      title: t("sectionCollaboration"),
      items: [
        { href: "/collab/pool", icon: "🔁", label: t("pool") },
        { href: "/requests", icon: "📋", label: t("requests") },
        { href: "/submissions", icon: "🏢", label: t("submissions") },
        { href: "/wanted", icon: "📣", label: t("wanted"), accent: true },
      ],
    },
    {
      title: t("sectionAccount"),
      items: [
        { href: "/notifications", icon: "🔔", label: t("notifications"), badge: unread ?? 0 },
        { href: "/profile", icon: "👤", label: t("profile") },
      ],
    },
  ];

  const bottomTabs: NavItem[] = [
    { href: "/dashboard", icon: "🏠", label: t("dashboard") },
    { href: "/leads", icon: "📥", label: t("leads") },
    { href: "/listings", icon: "🏘️", label: t("listings") },
    { href: "/requests", icon: "🤝", label: t("matchhub") },
    { href: "/profile", icon: "👤", label: t("profile") },
  ];

  return (
    <div className="min-h-screen sm:flex">
      {/* Desktop rail ---------------------------------------------------- */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface sm:flex">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 border-b border-line px-5 py-4"
          aria-label={partnerIdentityPublic ? brand.appName : brand.appNameNeutral}
        >
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-crimson text-sm font-black text-white"
          >
            {brand.appShortName.charAt(0)}
          </span>
          <span className="truncate text-sm font-bold tracking-tight">
            {brand.appShortName}
          </span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section, i) => (
            <div key={section.title ?? `s${i}`} className={i > 0 ? "mt-5" : ""}>
              {section.title && (
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition hover:bg-background ${
                        item.accent ? "text-crimson" : ""
                      }`}
                    >
                      <span aria-hidden className="text-base leading-none">
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                      {!!item.badge && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-bold text-white">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm font-medium hover:border-crimson hover:text-crimson"
            >
              {tc("signOut")}
            </button>
          </form>
        </div>
      </aside>

      {/* Content column --------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
          {/* Brand shows on phones, where the rail is hidden */}
          <Link href="/dashboard" className="flex items-center gap-2 sm:hidden">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-lg bg-crimson text-sm font-black text-white"
            >
              {brand.appShortName.charAt(0)}
            </span>
            <span className="text-sm font-bold">{brand.appShortName}</span>
          </Link>
          <span className="hidden sm:block" />

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/notifications"
              aria-label={t("notifications")}
              className="relative rounded-lg border border-line px-3 py-2 text-sm hover:border-crimson"
            >
              🔔
              {(unread ?? 0) > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </Link>
            <LanguageSwitcher />
            <form action={signOut} className="hidden sm:block">
              <button
                type="submit"
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:border-crimson hover:text-crimson"
              >
                {tc("signOut")}
              </button>
            </form>
          </div>
        </header>

        <main
          className={`mx-auto w-full flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-10 ${
            wide ? "max-w-6xl" : "max-w-3xl"
          }`}
        >
          {children}
        </main>
      </div>

      {/* Phone bottom bar (§37 mobile-first) ------------------------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {bottomTabs.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted active:text-crimson"
          >
            <span className="text-xl leading-none">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
