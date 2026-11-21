import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdmin, myCapabilities } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { type RailGroup } from "@/components/layout/rail-nav";
import { MobileNav, Sidebar, type SidebarLabels } from "@/components/layout/sidebar";
import { Icon } from "@/components/ui/icon";
import { signOut } from "@/app/(auth)/actions";

/**
 * Admin shell.
 *
 * A left rail, not a top bar. The console has seventeen destinations gated on
 * nine capabilities; as a wrapping top nav it ran to three lines on a laptop
 * and gave no indication of where you were. A rail scales past six
 * destinations, which is why every benchmarked admin console uses one.
 *
 * Sections are grouped by what the work IS — the queues you clear, the people
 * you manage, the platform you configure — rather than listed flat. Seventeen
 * equal-weight links is a list you read every time instead of learning.
 *
 * Capability filtering happens here, on the server. A link you are not allowed
 * to follow is worse than no link: before capabilities existed, a compliance
 * admin was invited to open Banners and then bounced.
 */

/** Each section, the capability that makes it usable, and its group. */
const NAV: { key: string; href: string; capability: string | null; icon: string; group: string }[] = [
  { key: "overview", href: "/admin", capability: null, icon: "grid", group: "main" },
  { key: "help", href: "/admin/help", capability: null, icon: "help", group: "main" },

  { key: "agents", href: "/admin/agents", capability: "agent.verify", icon: "shield-check", group: "agents" },
  { key: "pipeline", href: "/admin/agents/pipeline", capability: "agent.invite", icon: "workflow", group: "agents" },
  { key: "onboard", href: "/admin/agents/onboard", capability: "agent.invite", icon: "user-plus", group: "agents" },
  { key: "invitations", href: "/admin/agents/invitations", capability: "agent.invite", icon: "mail", group: "agents" },
  { key: "organisations", href: "/admin/organisations", capability: "commercial.manage", icon: "building", group: "agents" },

  { key: "listings", href: "/admin/listings", capability: "listing.moderate", icon: "home", group: "listings" },
  { key: "imports", href: "/admin/imports", capability: "listing.import_assisted", icon: "upload", group: "listings" },
  { key: "media", href: "/admin/media", capability: "media.review", icon: "image", group: "listings" },
  { key: "sources", href: "/admin/sources", capability: null, icon: "shuffle", group: "listings" },
  { key: "international", href: "/admin/international", capability: "platform.configure", icon: "plane", group: "listings" },

  { key: "requests", href: "/admin/requests", capability: "request.manage", icon: "list", group: "demand" },
  { key: "leads", href: "/admin/leads", capability: "request.manage", icon: "clock", group: "demand" },
  { key: "reports", href: "/admin/reports", capability: "report.manage", icon: "flag", group: "demand" },

  { key: "growth", href: "/admin/growth", capability: "growth.manage", icon: "trending-up", group: "commerce" },
  { key: "banners", href: "/admin/banners", capability: "commercial.manage", icon: "layout", group: "commerce" },
  { key: "commercial", href: "/admin/commercial", capability: "commercial.manage", icon: "wallet", group: "commerce" },
  { key: "hero", href: "/admin/hero", capability: "commercial.manage", icon: "hexagon", group: "commerce" },
  { key: "payments", href: "/admin/payments", capability: "commercial.manage", icon: "credit-card", group: "commerce" },

  { key: "ai", href: "/admin/ai", capability: "ai.manage", icon: "bot", group: "ai" },

  { key: "handover", href: "/admin/handover", capability: "listing.moderate", icon: "repeat", group: "comms" },
  { key: "announcements", href: "/admin/announcements", capability: "platform.configure", icon: "megaphone", group: "comms" },
  { key: "whatsapp", href: "/admin/whatsapp", capability: "platform.configure", icon: "message-circle", group: "comms" },

  { key: "training", href: "/admin/training", capability: "content.manage", icon: "graduation-cap", group: "markets" },
  { key: "countries", href: "/admin/countries", capability: "platform.configure", icon: "globe", group: "markets" },
  { key: "identity", href: "/admin/identity", capability: "platform.configure", icon: "fingerprint", group: "markets" },
  { key: "legal", href: "/admin/legal", capability: "legal.publish", icon: "scale", group: "markets" },

  { key: "users", href: "/admin/users", capability: "roles.manage", icon: "users", group: "security" },
  { key: "flags", href: "/admin/flags", capability: "platform.configure", icon: "settings", group: "security" },
  { key: "audit", href: "/admin/audit", capability: "audit.view", icon: "history", group: "security" },
];

/** The nine workspaces (approved plan); "main" is the Command Centre, shown without a heading. */
const GROUP_ORDER = ["main", "agents", "listings", "demand", "commerce", "ai", "comms", "markets", "security"] as const;

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  const caps = await myCapabilities();
  const partnerIdentityPublic = await isPartnerIdentityPublic();
  const t = await getTranslations("admin");
  const tc = await getTranslations("common");
  const ts = await getTranslations("adminSearch");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle()
    : { data: null };

  const visible = NAV.filter((item) => !item.capability || caps.has(item.capability));

  const groups: RailGroup[] = GROUP_ORDER.map((g) => ({
    id: g,
    // The first group is the console itself and needs no heading.
    title: g === "main" ? null : t(`navGroup.${g}` as never),
    items: visible
      .filter((item) => item.group === g)
      .map((item) => ({
        key: item.key,
        href: item.href,
        // Overview is the console root: without `exact` it would stay lit on
        // every /admin page that has no menu item of its own (search).
        exact: item.href === "/admin",
        icon: item.icon,
        label: t(`nav.${item.key}` as never),
      })),
  })).filter((g) => g.items.length > 0);

  const labels: SidebarLabels = {
    collapse: tc("collapseMenu"),
    expand: tc("expandMenu"),
    menu: tc("menu"),
    close: tc("closeMenu"),
    find: tc("findPage"),
    noMatch: tc("noPageMatch"),
  };

  const initial = (profile?.display_name ?? "?").charAt(0).toUpperCase();
  const brandLink = (
    <Link href="/admin" className="inline-block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
      <BrandLockup size={28} partnerIdentityPublic={partnerIdentityPublic} />
    </Link>
  );
  const brandCompact = (
    <Link href="/admin" aria-label={t("badge")} className="grid h-11 w-11 place-items-center rounded-xl bg-crimson-fill text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
      <Icon name="shield-check" size={20} />
    </Link>
  );

  /* Who you are signed in as, at the bottom of the rail where every console
     puts it. */
  const footer = (
    <>
      <div className="flex items-center gap-3 rounded-xl bg-surface p-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-crimson-fill text-sm font-bold text-white">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-5">{profile?.display_name ?? "—"}</span>
          <span className="block truncate text-xs text-muted-strong">{t("badge")}</span>
        </span>
      </div>
      <form action={signOut} className="mt-1">
        <button
          type="submit"
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-muted-strong transition-colors duration-150 hover:bg-surface hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        >
          <Icon name="log-out" size={20} />
          {tc("signOut")}
        </button>
      </form>
    </>
  );
  const footerCompact = (
    <>
      <span aria-hidden title={profile?.display_name ?? undefined} className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-crimson-fill text-sm font-bold text-white">
        {initial}
      </span>
      <form action={signOut} className="mt-1">
        <button
          type="submit"
          aria-label={tc("signOut")}
          title={tc("signOut")}
          className="grid min-h-11 w-full cursor-pointer place-items-center rounded-xl text-muted-strong transition-colors duration-150 hover:bg-surface hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        >
          <Icon name="log-out" size={20} />
        </button>
      </form>
    </>
  );

  return (
    <div className="flex min-h-screen bg-page">
      {/* Rail: 18rem, foldable to icons, with a "find a page" box — thirty
          destinations is past what anyone scans (19 Nov 2026). */}
      <Sidebar
        groups={groups}
        storageKey="admin-rail"
        labels={labels}
        searchable
        header={brandLink}
        headerCompact={brandCompact}
        footer={footer}
        footerCompact={footerCompact}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar ------------------------------------------------------- */}
        <header className="sticky top-0 z-10 flex min-h-[4.25rem] items-center justify-between gap-3 border-b border-line bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
          {/* Below lg the rail is hidden: a Menu button opens the same
              navigation as a drawer (it replaced a sideways-scrolling strip
              of thirty links). */}
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <MobileNav groups={groups} storageKey="admin-rail" labels={labels} searchable header={brandLink} footer={footer} />
            <Link href="/admin" className="hidden sm:block">
              <BrandLockup size={22} partnerIdentityPublic={partnerIdentityPublic} />
            </Link>
          </div>

          {/* Search is a box, not a nav item: the operator arrives already
              holding the thing they are looking for — a phone number, a
              listing reference — and a link would make them click first and
              type second. Plain GET so it works before hydration. */}
          <form action="/admin/search" className="relative hidden max-w-xl flex-1 sm:block">
            <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              placeholder={ts("placeholder")}
              aria-label={ts("title")}
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3.5 text-[15px] outline-none transition-colors duration-150 placeholder:text-muted-strong focus:border-blue focus:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
            />
          </form>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-muted-strong transition-colors duration-150 hover:border-crimson hover:text-crimson focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
            >
              {t("nav.agentView")}
            </Link>
          </div>
        </header>

        {/* On phones the search sits under the header and scrolls away: three
            sticky rows used to cover a fifth of the screen. */}
        <form action="/admin/search" className="relative border-b border-line bg-card px-4 py-2 sm:hidden">
          <Icon name="search" size={18} className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="q"
            placeholder={ts("placeholder")}
            aria-label={ts("title")}
            className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3.5 text-[15px] outline-none transition-colors duration-150 placeholder:text-muted-strong focus:border-blue focus:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          />
        </form>

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
