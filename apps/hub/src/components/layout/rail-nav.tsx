"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The link list inside a left rail. Shared by the admin console and the agent
 * app so both highlight the current section the same way.
 *
 * A client component for one reason: the active item. `usePathname` is the
 * only way to know where you are, and a rail with a dozen destinations and no
 * current-location indicator is a maze. Nothing else here is interactive, and
 * the items are computed on the server and passed in already filtered by
 * capability — this component never decides what anybody may see.
 */

export type RailItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  /** Draws attention without implying you are there — used for new modules. */
  accent?: boolean;
};

export type RailGroup = { title: string | null; items: RailItem[] };

export function RailNav({ groups }: { groups: RailGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group, i) => (
        <div key={group.title ?? `g${i}`}>
          {group.title && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {group.title}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              /* Exact match for a section root like "/admin" or "/dashboard",
                 prefix match for the rest — otherwise the root lights up on
                 every page, and "/listings" fails to light up on a listing's
                 own page, which is where you most want to know where you are. */
              const root = item.href.split("/").length <= 2;
              const active = root
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
                      active
                        ? "bg-blue-soft font-semibold text-blue"
                        : item.accent
                          ? "font-medium text-crimson hover:bg-crimson-soft"
                          : "font-medium text-muted-strong hover:bg-surface hover:text-foreground"
                    }`}
                  >
                    <span aria-hidden className="w-4 shrink-0 text-center text-base leading-none">
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                    {!!item.badge && (
                      <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-crimson px-1.5 text-[10px] font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
