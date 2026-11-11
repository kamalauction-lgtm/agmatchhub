import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdmin, myCapabilities } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { RailNav, type RailGroup } from "@/components/layout/rail-nav";
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
  { key: "overview", href: "/admin", capability: null, icon: "◈", group: "main" },

  { key: "agents", href: "/admin/agents", capability: "agent.verify", icon: "✓", group: "agents" },
  { key: "invitations", href: "/admin/agents/invitations", capability: "agent.invite", icon: "✉", group: "agents" },
  { key: "organisations", href: "/admin/organisations", capability: "commercial.manage", icon: "▣", group: "agents" },

  { key: "listings", href: "/admin/listings", capability: "listing.moderate", icon: "⌂", group: "listings" },
  { key: "imports", href: "/admin/imports", capability: "listing.import_assisted", icon: "⇪", group: "listings" },
  { key: "media", href: "/admin/media", capability: "media.review", icon: "▦", group: "listings" },

  { key: "requests", href: "/admin/requests", capability: "request.manage", icon: "☰", group: "demand" },
  { key: "leads", href: "/admin/leads", capability: "request.manage", icon: "◷", group: "demand" },
  { key: "reports", href: "/admin/reports", capability: "report.manage", icon: "⚑", group: "demand" },

  { key: "growth", href: "/admin/growth", capability: "growth.manage", icon: "↗", group: "commerce" },
  { key: "banners", href: "/admin/banners", capability: "commercial.manage", icon: "▤", group: "commerce" },
  { key: "commercial", href: "/admin/commercial", capability: "commercial.manage", icon: "₪", group: "commerce" },
  { key: "hero", href: "/admin/hero", capability: "commercial.manage", icon: "⬢", group: "commerce" },
  { key: "payments", href: "/admin/payments", capability: "commercial.manage", icon: "◎", group: "commerce" },

  { key: "ai", href: "/admin/ai", capability: "ai.manage", icon: "✦", group: "ai" },

  { key: "handover", href: "/admin/handover", capability: "listing.moderate", icon: "⇄", group: "comms" },
  { key: "announcements", href: "/admin/announcements", capability: "platform.configure", icon: "◎", group: "comms" },
  { key: "whatsapp", href: "/admin/whatsapp", capability: "platform.configure", icon: "◍", group: "comms" },

  { key: "training", href: "/admin/training", capability: "content.manage", icon: "◇", group: "markets" },
  { key: "countries", href: "/admin/countries", capability: "platform.configure", icon: "⊕", group: "markets" },
  { key: "identity", href: "/admin/identity", capability: "platform.configure", icon: "◐", group: "markets" },
  { key: "legal", href: "/admin/legal", capability: "legal.publish", icon: "§", group: "markets" },

  { key: "users", href: "/admin/users", capability: "roles.manage", icon: "◑", group: "security" },
  { key: "flags", href: "/admin/flags", capability: "platform.configure", icon: "⚙", group: "security" },
  { key: "audit", href: "/admin/audit", capability: "audit.view", icon: "◷", group: "security" },
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
    // The first group is the console itself and needs no heading.
    title: g === "main" ? null : t(`navGroup.${g}` as never),
    items: visible
      .filter((item) => item.group === g)
      .map((item) => ({
        key: item.key,
        href: item.href,
        icon: item.icon,
        label: t(`nav.${item.key}` as never),
      })),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen bg-page">
      {/* Rail ------------------------------------------------------------ */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-card lg:flex">
        <div className="border-b border-line px-5 py-4">
          <Link href="/admin" className="inline-block">
            <BrandLockup size={26} partnerIdentityPublic={partnerIdentityPublic} />
          </Link>
        </div>

        <RailNav groups={groups} />

        {/* Who you are signed in as, at the bottom of the rail where every
            console puts it. */}
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-crimson text-xs font-bold text-white"
            >
              {(profile?.display_name ?? "?").charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {profile?.display_name ?? "—"}
              </span>
              <span className="block truncate text-xs text-muted">{t("badge")}</span>
            </span>
          </div>
          <form action={signOut} className="mt-1">
            <button
              type="submit"
              className="w-full cursor-pointer rounded-lg px-2 py-2 text-left text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface hover:text-danger"
            >
              {tc("signOut")}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar ------------------------------------------------------- */}
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card/95 px-5 py-3 backdrop-blur">
          {/* Below lg the rail is hidden, so the lockup and a compact nav live
              here instead. Wrapping is acceptable on a phone; losing the
              navigation entirely is not. */}
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <Link href="/admin">
              <BrandLockup size={22} partnerIdentityPublic={partnerIdentityPublic} />
            </Link>
          </div>

          {/* Search is a box, not a nav item: the operator arrives already
              holding the thing they are looking for — a phone number, a
              listing reference — and a link would make them click first and
              type second. Plain GET so it works before hydration. */}
          <form action="/admin/search" className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-md">
            <input
              type="search"
              name="q"
              placeholder={ts("placeholder")}
              aria-label={ts("title")}
              className="h-9 w-full rounded-lg border border-line bg-surface px-3.5 text-sm outline-none transition-colors duration-150 focus:border-blue focus:bg-background"
            />
          </form>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/dashboard"
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:border-crimson hover:text-crimson"
            >
              {t("nav.agentView")}
            </Link>
          </div>
        </header>

        {/* Small screens get the sections as a scrolling strip. */}
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-card px-4 py-2 lg:hidden">
          {visible.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-strong hover:bg-surface"
            >
              {t(`nav.${item.key}` as never)}
            </Link>
          ))}
          <form action={signOut} className="shrink-0">
            <button type="submit" className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted">
              {tc("signOut")}
            </button>
          </form>
        </nav>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6 sm:px-7 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
