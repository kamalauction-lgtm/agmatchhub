"use client";

import { useEffect, useState } from "react";
import { COMPARE_EVENT, COMPARE_MAX, readCompare, writeCompare } from "./compare-toggle";

/**
 * Floating bar that appears once a visitor has picked at least one property
 * to compare. Hidden entirely when nothing is selected so the page stays
 * quiet by default.
 */
export function CompareTray({
  compareHref,
  labels,
  aboveMobileBar = false,
}: {
  compareHref: string;
  labels: { title: string; cta: string; clear: string; of: string };
  /** The listing page has its own fixed contact bar on phones; sit above it. */
  aboveMobileBar?: boolean;
}) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setIds(readCompare());
    sync();
    window.addEventListener(COMPARE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(COMPARE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (ids.length === 0) return null;

  return (
    <div className={`fixed inset-x-0 z-30 px-4 pb-4 lg:bottom-6 ${aboveMobileBar ? "bottom-[4.5rem]" : "bottom-0"}`}>
      <div className="command-band glow-electric mx-auto flex max-w-3xl items-center gap-3 rounded-2xl px-4 py-3 shadow-raised">
        <div className="flex -space-x-1.5">
          {ids.map((id, i) => (
            <span
              key={id}
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-full border border-white/40 bg-electric text-xs font-bold text-white"
            >
              {i + 1}
            </span>
          ))}
        </div>
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">{labels.title}</span>{" "}
          <span className="text-command-muted">
            {ids.length} {labels.of} {COMPARE_MAX}
          </span>
        </p>
        <button
          type="button"
          onClick={() => writeCompare([])}
          className="hidden cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-command-muted hover:text-white sm:inline-flex"
        >
          {labels.clear}
        </button>
        <a
          href={`${compareHref}?ids=${encodeURIComponent(ids.join(","))}`}
          className={`inline-flex shrink-0 cursor-pointer items-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
            ids.length >= 2
              ? "bg-electric text-white hover:bg-electric-strong"
              : "bg-white/15 text-white/80 hover:bg-white/25"
          }`}
        >
          {labels.cta}
        </a>
      </div>
    </div>
  );
}
