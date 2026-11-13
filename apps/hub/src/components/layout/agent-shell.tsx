import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { profilePhotoUrl } from "@/lib/card/data";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/config/brand";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { RailNav, type RailGroup } from "@/components/layout/rail-nav";
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
  /** `true` widens to 6xl; "full" lets a page such as the Live Office use the whole viewport. */
  wide?: boolean | "full";
}) {
  const partnerIdentityPublic = await isPartnerIdentityPublic();
  const tc = await getTranslations("common");
  const t = await getTranslations("nav");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ count: unread }, { data: profile }] = await Promise.all([
    user
      ? supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null)
      : Promise.resolve({ count: 0 }),
    /* The rail carries a profile card, as the design sheet has it. An agent
       platform is somewhere people live all day; being told who you are
       signed in as, and whether you are cleared to work, is worth one query. */
    user
      ? supabase
          .from("profiles")
          .select("display_name, avatar_url, agent_status")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // P1-d-1 (00121): a suspended or banned agent sees why, not the workspace.
  // The database refuses their listing writes regardless.
  const blocked = profile?.agent_status === "suspended" || profile?.agent_status === "banned";
  const { data: suspension } = blocked && user
    ? await supabase.from("agent_suspensions").select("reason, suspended_at").eq("agent_id", user.id).is("restored_at", null).maybeSingle()
    : { data: null };
  const ts = blocked ? await getTranslations("suspension") : null;

  const sections: RailGroup[] = [
    {
      title: null,
      items: [{ href: "/dashboard", icon: "🏠", label: t("dashboard") }],
    },
    {
      title: t("sectionWork"),
      items: [
        { href: "/leads", icon: "📥", label: t("leads") },
        { href: "/tasks", icon: "☑️", label: t("tasks") },
        { href: "/listings", icon: "🏘️", label: t("listings") },
        // Not 📥 — that is Leads, one row up, and two identical icons in one
        // section is how a nav item becomes invisible.
        { href: "/listings/import", icon: "📦", label: t("importListings") },
        { href: "/growth", icon: "📈", label: t("growth") },
        { href: "/studio", icon: "✨", label: t("studio") },
        { href: "/ai", icon: "✦", label: t("aiWorkforce") },
        { href: "/training", icon: "🎓", label: t("training") },
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
        { href: "/plan", icon: "🧾", label: t("plan") },
        { href: "/card", icon: "💳", label: t("card") },
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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-card sm:flex">
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

        {/* Who you are, and your Verified Agent badge (voluntary, 00129). */}
        <div className="border-b border-line px-4 py-4 text-center">
          {/* `avatar_url` is a storage PATH in the public profile bucket, not a
              URL; resolve it, and fall back to the initial if the file is gone. */}
          <ProfileAvatar
            src={profilePhotoUrl(profile?.avatar_url ?? null)}
            name={profile?.display_name}
            size={64}
            className="mx-auto"
          />
          <p className="mt-2 truncate text-sm font-bold">{profile?.display_name ?? "—"}</p>
          <p className="text-xs text-muted">{t("agentRole")}</p>
          {/* The Verified badge is voluntary since 00129: a quiet invitation
              when it is missing, never a warning. */}
          {profile?.agent_status === "verified" ? (
            <span className="mt-2 inline-block rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-semibold text-success">
              ✓ {t("verifiedBadge")}
            </span>
          ) : (
            <Link
              href="/verification"
              className="mt-2 inline-block rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold text-muted transition-colors hover:border-crimson hover:text-crimson"
            >
              {t("unverifiedBadge")}
            </Link>
          )}
        </div>

        <RailNav groups={sections} />

        <div className="border-t border-line p-3">
          <form action={signOut}>
            <button
              type="submit"
              className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface hover:text-danger"
            >
              {tc("signOut")}
            </button>
          </form>
        </div>
      </aside>

      {/* Content column --------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
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
            wide === "full" ? "max-w-[1700px]" : wide ? "max-w-6xl" : "max-w-3xl"
          }`}
        >
          {blocked && ts ? (
            <div className="mx-auto max-w-xl rounded-xl border border-danger/40 bg-danger/5 p-6" role="alert" data-suspended-notice="1">
              <h1 className="text-xl font-semibold text-danger">{ts("title")}</h1>
              <p className="mt-2 text-sm">{ts("body")}</p>
              {suspension?.reason && (
                <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm"><span className="block text-xs text-muted">{ts("reason")}</span>{suspension.reason}</p>
              )}
              <p className="mt-3 text-xs text-muted">{ts("listings")}</p>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Phone bottom bar (§37 mobile-first) ------------------------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
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
