"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { useStored } from "@/lib/use-stored";
import { RailNav, type RailGroup, type RailLabels } from "./rail-nav";

export type SidebarLabels = {
  collapse: string;
  expand: string;
  menu: string;
  close: string;
  find: string;
  noMatch: string;
};

/**
 * The desktop rail: 18rem wide (was 15rem), foldable to a 4.5rem icon strip
 * for people who want the room back. The fold is remembered on the device.
 * No width animation: a remembered fold would otherwise slide shut on every
 * page load, because the server always renders the rail open.
 *
 * `header` / `footer` are rendered by the server shell and passed in; each has
 * a compact twin for the folded state so nothing gets squeezed.
 */
export function Sidebar({
  groups, storageKey, labels, searchable = false,
  header, headerCompact, top, footer, footerCompact,
}: {
  groups: RailGroup[];
  storageKey: string;
  labels: SidebarLabels;
  searchable?: boolean;
  header: ReactNode;
  headerCompact: ReactNode;
  /** Under the header, expanded only (the agent's profile card). */
  top?: ReactNode;
  footer: ReactNode;
  footerCompact: ReactNode;
}) {
  const [stored, setStored] = useStored(`${storageKey}:collapsed`, "0");
  const collapsed = stored === "1";
  const railLabels: RailLabels | undefined = searchable ? { find: labels.find, noMatch: labels.noMatch } : undefined;

  return (
    <aside
      data-sidebar={collapsed ? "collapsed" : "expanded"}
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-card lg:flex ${collapsed ? "w-[4.5rem]" : "w-72"}`}
    >
      <div className={`flex min-h-[4.25rem] items-center border-b border-line ${collapsed ? "justify-center px-2" : "justify-between gap-2 pl-5 pr-2"}`}>
        {collapsed ? headerCompact : header}
        {!collapsed && <FoldButton expanded label={labels.collapse} onClick={() => setStored("1")} />}
      </div>
      {collapsed && (
        <div className="flex justify-center border-b border-line py-2">
          <FoldButton expanded={false} label={labels.expand} onClick={() => setStored("0")} />
        </div>
      )}
      {!collapsed && top}
      <RailNav groups={groups} label={labels.menu} collapsed={collapsed} storageKey={storageKey} labels={railLabels} />
      <div className={`border-t border-line ${collapsed ? "p-2" : "p-3"}`}>{collapsed ? footerCompact : footer}</div>
    </aside>
  );
}

function FoldButton({ expanded, label, onClick }: { expanded: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      data-sidebar-toggle="1"
      className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-strong transition-colors duration-150 hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
    >
      <Icon name="panel-left" size={20} />
    </button>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Below `lg`: a Menu button that opens the same navigation as a drawer.
 * Before this, a phone had five bottom tabs (agents) or a sideways strip
 * (admins) and the rest of the app was reachable only by typing addresses.
 *
 * "Open" is remembered as the path it was opened on, so any navigation —
 * a menu link, the brand link, the browser's Back — closes it without an
 * effect having to notice.
 */
export function MobileNav({
  groups, storageKey, labels, searchable = false, header, footer,
}: {
  groups: RailGroup[];
  storageKey: string;
  labels: SidebarLabels;
  searchable?: boolean;
  header: ReactNode;
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const opener = openRef.current;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenOn(null);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      // Keep Tab inside the drawer: the page behind is not reachable while it is open.
      const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !panelRef.current.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !panelRef.current.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    }
    // The rail takes over at lg; a drawer left open there would lock the page scroll.
    const wide = window.matchMedia("(min-width: 1024px)");
    function onWide() {
      if (wide.matches) setOpenOn(null);
    }
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={openRef}
        type="button"
        onClick={() => setOpenOn(pathname)}
        aria-label={labels.menu}
        aria-expanded={open}
        data-mobile-nav-open="1"
        className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-foreground transition-colors duration-150 hover:border-crimson focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue lg:hidden"
      >
        <Icon name="menu" size={22} />
      </button>
      {/* Portalled: the sticky header uses backdrop-blur, which would otherwise
          become the containing block of this fixed overlay. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={labels.menu} data-mobile-nav="1">
            <button type="button" aria-label={labels.close} tabIndex={-1} onClick={() => setOpenOn(null)} className="absolute inset-0 cursor-default bg-black/50" />
            <div ref={panelRef} className="relative flex h-dvh w-[19rem] max-w-[86vw] flex-col bg-card shadow-xl">
              <div className="flex min-h-[4.25rem] items-center justify-between gap-2 border-b border-line pl-5 pr-2">
                {header}
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpenOn(null)}
                  aria-label={labels.close}
                  className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-strong transition-colors duration-150 hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                >
                  <Icon name="x" size={22} />
                </button>
              </div>
              <RailNav
                groups={groups}
                label={labels.menu}
                storageKey={storageKey}
                labels={searchable ? { find: labels.find, noMatch: labels.noMatch } : undefined}
                onNavigate={() => setOpenOn(null)}
              />
              <div className="border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
