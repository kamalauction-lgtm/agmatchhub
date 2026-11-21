import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { profilePhotoUrl } from "@/lib/card/data";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/config/brand";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BottomTabs, type RailGroup } from "@/components/layout/rail-nav";
import { MobileNav, Sidebar, type SidebarLabels } from "@/components/layout/sidebar";
import { Icon } from "@/components/ui/icon";
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
 * five-tab bottom bar for the daily destinations, plus a Menu drawer with
 * everything else (19 Nov 2026: before it, thirteen pages were unreachable
 * on a phone without typing the address). The rail starts at lg: at tablet
 * widths 18rem of menu left too little room for the page.
 *
 * 19 Nov 2026 (owner: "side bar too small, too much empty space"): the rail
 * is wider with larger rows and can fold to icons; pages use more of the
 * screen — 64rem by default, 87.5rem when `wide`.
 */

type NavItem = { href: string; icon: string; label: string };

export async function AgentShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  /** `true` widens to 1400px; "full" lets a page such as the Live Office use the whole viewport. */
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
      id: "main",
      title: null,
      items: [{ href: "/dashboard", icon: "home", label: t("dashboard") }],
    },
    {
      id: "work",
      title: t("sectionWork"),
      items: [
        { href: "/leads", icon: "inbox", label: t("leads") },
        { href: "/tasks", icon: "check-square", label: t("tasks") },
        { href: "/listings", icon: "building", label: t("listings") },
        { href: "/listings/import", icon: "package", label: t("importListings") },
        { href: "/international", icon: "globe", label: t("international") },
        { href: "/growth", icon: "trending-up", label: t("growth") },
        { href: "/studio", icon: "sparkles", label: t("studio") },
        { href: "/ai", icon: "bot", label: t("aiWorkforce") },
        { href: "/training", icon: "graduation-cap", label: t("training") },
      ],
    },
    {
      id: "collab",
      title: t("sectionCollaboration"),
      items: [
        { href: "/collab/pool", icon: "repeat", label: t("pool") },
        { href: "/requests", icon: "clipboard", label: t("requests") },
        { href: "/submissions", icon: "send", label: t("submissions") },
        { href: "/wanted", icon: "megaphone", label: t("wanted"), accent: true },
      ],
    },
    {
      id: "account",
      title: t("sectionAccount"),
      items: [
        { href: "/notifications", icon: "bell", label: t("notifications"), badge: unread ?? 0 },
        { href: "/profile", icon: "user", label: t("profile") },
        { href: "/plan", icon: "receipt", label: t("plan") },
        { href: "/card", icon: "id-card", label: t("card") },
        { href: "/help", icon: "help", label: t("help") },
      ],
    },
  ];

  const bottomTabs: NavItem[] = [
    { href: "/dashboard", icon: "home", label: t("dashboard") },
    { href: "/leads", icon: "inbox", label: t("leads") },
    { href: "/listings", icon: "building", label: t("listings") },
    { href: "/requests", icon: "handshake", label: t("matchhub") },
    { href: "/profile", icon: "user", label: t("profile") },
  ];

  const labels: SidebarLabels = {
    collapse: tc("collapseMenu"),
    expand: tc("expandMenu"),
    menu: tc("menu"),
    close: tc("closeMenu"),
    theme: tc("toggleTheme"),
    find: tc("findPage"),
    noMatch: tc("noPageMatch"),
  };

  const appName = partnerIdentityPublic ? brand.appName : brand.appNameNeutral;
  const mark = (
    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-crimson-fill text-base font-black text-white">
      {brand.appShortName.charAt(0)}
    </span>
  );
  const brandLink = (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
      {mark}
      <span className="truncate text-base font-bold tracking-tight">{brand.appShortName}</span>
    </Link>
  );

  /* Who you are, and your Verified Agent badge (voluntary, 00129): a quiet
     invitation when it is missing, never a warning. One row instead of the
     old centred card, which spent 150px before the first menu item.
     `avatar_url` is a storage PATH in the public profile bucket, not a URL. */
  const profileCard = (
    <div className="border-b border-line p-3" data-rail-profile="1">
      <div className="flex items-center gap-3 rounded-xl bg-surface p-3">
        <ProfileAvatar src={profilePhotoUrl(profile?.avatar_url ?? null)} name={profile?.display_name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-5">{profile?.display_name ?? "—"}</p>
          <p className="truncate text-xs text-muted-strong">{t("agentRole")}</p>
          {profile?.agent_status === "verified" ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success-ink">
              <Icon name="check" size={12} />
              {t("verifiedBadge")}
            </span>
          ) : (
            <Link
              href="/verification"
              className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-card px-3 text-xs font-semibold text-muted-strong transition-colors duration-150 hover:border-crimson hover:text-crimson-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
            >
              {t("unverifiedBadge")}
              <Icon name="arrow-right" size={12} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  const signOutFull = (
    <form action={signOut}>
      <button
        type="submit"
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-muted-strong transition-colors duration-150 hover:bg-surface hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        <Icon name="log-out" size={20} />
        {tc("signOut")}
      </button>
    </form>
  );
  const signOutCompact = (
    <form action={signOut}>
      <button
        type="submit"
        aria-label={tc("signOut")}
        title={tc("signOut")}
        className="grid min-h-11 w-full cursor-pointer place-items-center rounded-xl text-muted-strong transition-colors duration-150 hover:bg-surface hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        <Icon name="log-out" size={20} />
      </button>
    </form>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop rail ---------------------------------------------------- */}
      <Sidebar
        groups={sections}
        storageKey="agent-rail"
        labels={labels}
        header={brandLink}
        headerCompact={<Link href="/dashboard" aria-label={appName}>{mark}</Link>}
        top={profileCard}
        footer={signOutFull}
        footerCompact={signOutCompact}
      />

      {/* Content column --------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-[4.25rem] items-center justify-between gap-3 border-b border-line bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
          {/* Menu + brand show on phones, where the rail is hidden */}
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <MobileNav groups={sections} storageKey="agent-rail" labels={labels} header={brandLink} footer={signOutFull} />
            <Link href="/dashboard" className="truncate text-base font-bold">{brand.appShortName}</Link>
          </div>
          <span className="hidden lg:block" />

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/notifications"
              aria-label={t("notifications")}
              className="relative grid h-11 w-11 place-items-center rounded-lg border border-line text-muted-strong transition-colors duration-150 hover:border-crimson hover:text-crimson focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
            >
              <Icon name="bell" size={20} />
              {(unread ?? 0) > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson-fill px-1 text-[11px] font-bold text-white">
                  {(unread ?? 0) > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <span className="hidden sm:block"><ThemeToggle label={tc("toggleTheme")} /></span>
            <LanguageSwitcher />
            <form action={signOut} className="hidden lg:block">
              <button
                type="submit"
                className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-medium transition-colors duration-150 hover:border-crimson hover:text-crimson focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
              >
                {tc("signOut")}
              </button>
            </form>
          </div>
        </header>

        <main
          className={`mx-auto w-full flex-1 px-4 py-6 pb-24 sm:px-8 sm:py-8 lg:pb-10 ${
            wide === "full" ? "max-w-[1700px]" : wide ? "max-w-[1400px]" : "max-w-5xl"
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
      <BottomTabs items={bottomTabs} label={tc("quickNav")} className="lg:hidden" />
    </div>
  );
}
