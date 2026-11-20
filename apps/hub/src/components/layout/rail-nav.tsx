"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useStored } from "@/lib/use-stored";

/**
 * The link list inside a left rail. Shared by the admin console and the agent
 * app so both highlight the current section the same way.
 *
 * Rebuilt 19 Nov 2026 (owner: "the side bar is too small"). Rows are 44px
 * tall with 15px labels and real icons; groups fold and remember it; a long
 * menu (the admin console has thirty destinations) gets a "find a page" box;
 * and the rail can collapse to icons. The items are still computed on the
 * server and passed in already filtered by capability — this component never
 * decides what anybody may see.
 */

export type RailItem = {
  href: string;
  label: string;
  /** A name from components/ui/icon.tsx. */
  icon: string;
  badge?: number;
  /** Draws attention without implying you are there — used for new modules. */
  accent?: boolean;
  /** Current only on this exact path (a section root such as "/admin"). */
  exact?: boolean;
};

/** `id` is stable across languages: it is what the device remembers as folded. */
export type RailGroup = { id: string; title: string | null; items: RailItem[] };

export type RailLabels = { find: string; noMatch: string };

/**
 * The current item is the LONGEST href that prefixes the path. Plain prefix
 * matching lit up both "Listings" and "Import listings" on /listings/import,
 * and both "Agent verification" and "Open an account" on the onboard page.
 */
export function activeHref(items: { href: string; exact?: boolean }[], pathname: string): string {
  let best = "";
  for (const item of items) {
    const hit = pathname === item.href || (!item.exact && pathname.startsWith(item.href + "/"));
    if (hit && item.href.length > best.length) best = item.href;
  }
  return best;
}

export function RailNav({
  groups,
  label,
  collapsed = false,
  storageKey = "rail",
  labels,
  onNavigate,
}: {
  groups: RailGroup[];
  /** Accessible name of this navigation landmark. */
  label: string;
  /** Icons only (desktop rail folded). */
  collapsed?: boolean;
  /** Namespaces what this rail remembers on the device. */
  storageKey?: string;
  /** Pass to show the "find a page" box — worth it past a dozen items. */
  labels?: RailLabels;
  /** Called after a link is followed (the phone drawer closes itself). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [closedRaw, setClosedRaw] = useStored(`${storageKey}:closed`);
  const [query, setQuery] = useState("");

  const current = useMemo(() => activeHref(groups.flatMap((g) => g.items), pathname), [groups, pathname]);
  const closed = useMemo(() => new Set(closedRaw ? closedRaw.split(",") : []), [closedRaw]);
  // A filter typed before the rail was folded must not keep filtering unseen.
  const q = collapsed ? "" : query.trim().toLowerCase();
  const shown = q
    ? groups
        .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
        .filter((g) => g.items.length)
    : groups;

  function toggle(id: string) {
    const next = new Set(closed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setClosedRaw([...next].join(","));
  }

  return (
    <nav aria-label={label} className={`flex-1 overflow-y-auto py-3 ${collapsed ? "px-2" : "px-3"}`} data-rail-nav="1">
      {labels && !collapsed && (
        <div className="relative mb-3">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-strong" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.find}
            aria-label={labels.find}
            data-rail-find="1"
            className="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none transition-colors duration-150 placeholder:text-muted-strong focus:border-blue focus:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          />
        </div>
      )}

      {shown.length === 0 && labels && <p role="status" className="px-3 py-2 text-sm text-muted-strong">{labels.noMatch}</p>}

      <div className="space-y-2">
        {shown.map((group) => {
          // Searching opens everything; a folded group still shows where you are.
          const folded = !!group.title && closed.has(group.id) && !q && !collapsed;
          const items = folded ? group.items.filter((it) => it.href === current) : group.items;
          return (
            <div key={group.id}>
              {group.title && !collapsed && (
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  aria-expanded={!folded}
                  data-rail-group={group.id}
                  className="flex min-h-10 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-strong transition-colors duration-150 hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                >
                  <span className="truncate">{group.title}</span>
                  <Icon name="chevron-down" size={16} className={`transition-transform duration-200 motion-reduce:transition-none ${folded ? "-rotate-90" : ""}`} />
                </button>
              )}
              {group.title && collapsed && <div aria-hidden className="mx-2 mb-2 border-t border-line" />}
              {items.length > 0 && (
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = item.href === current;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          title={item.label}
                          aria-label={collapsed ? item.label : undefined}
                          className={`relative flex min-h-11 items-center rounded-xl text-[15px] leading-5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
                            collapsed ? "justify-center px-0" : "gap-3 px-3"
                          } ${
                            active
                              ? "bg-blue-soft font-semibold text-blue"
                              : item.accent
                                ? "font-medium text-crimson-strong hover:bg-crimson-soft"
                                : "font-medium text-muted-strong hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          {active && !collapsed && <span aria-hidden className="absolute bottom-2 left-0 top-2 w-1 rounded-full bg-blue" />}
                          <Icon name={item.icon} size={20} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                          {!!item.badge &&
                            (collapsed ? (
                              <span aria-hidden className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-crimson-fill ring-2 ring-card" />
                            ) : (
                              <span className="ml-auto flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-crimson-fill px-1.5 text-xs font-bold text-white">
                                {item.badge > 99 ? "99+" : item.badge}
                              </span>
                            ))}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/** The phone tab bar: the daily destinations, with the current one marked. */
export function BottomTabs({
  items, label, className = "",
}: {
  items: { href: string; icon: string; label: string }[];
  label: string;
  className?: string;
}) {
  const pathname = usePathname();
  const current = activeHref(items, pathname);
  return (
    <nav aria-label={label} className={`fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur ${className}`}>
      {items.map((item) => {
        const active = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue ${
              active ? "font-bold text-blue" : "font-medium text-muted-strong"
            }`}
          >
            {active && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-blue" />}
            <Icon name={item.icon} size={22} />
            <span className="max-w-full truncate px-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
