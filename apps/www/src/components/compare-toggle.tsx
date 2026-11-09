"use client";

import { useEffect, useState } from "react";

/**
 * "Add to compare" — the selection lives in localStorage so it survives
 * navigating between search, assistant and detail pages without a server
 * round trip or a session. Capped at four: the compare table is four columns
 * wide on desktop and two on a phone.
 */
export const COMPARE_KEY = "pg.compare.v1";
export const COMPARE_MAX = 4;
export const COMPARE_EVENT = "pg:compare";

export function readCompare(): string[] {
  try {
    const raw = localStorage.getItem(COMPARE_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    // Only UUIDs survive: the tray puts these straight into a URL.
    return Array.isArray(ids)
      ? ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, COMPARE_MAX)
      : [];
  } catch {
    return [];
  }
}

export function writeCompare(ids: string[]) {
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(ids.slice(0, COMPARE_MAX)));
  } catch {
    /* private mode: the tray simply stays empty */
  }
  window.dispatchEvent(new CustomEvent(COMPARE_EVENT));
}

export function CompareToggle({
  id,
  labels,
  size = "sm",
}: {
  id: string;
  labels: { add: string; remove: string; full: string };
  size?: "sm" | "md";
}) {
  const [selected, setSelected] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => {
      const ids = readCompare();
      setSelected(ids.includes(id));
      setCount(ids.length);
    };
    sync();
    window.addEventListener(COMPARE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(COMPARE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [id]);

  const full = !selected && count >= COMPARE_MAX;

  return (
    <button
      type="button"
      disabled={full}
      aria-pressed={selected}
      title={full ? labels.full : selected ? labels.remove : labels.add}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const ids = readCompare();
        writeCompare(selected ? ids.filter((x) => x !== id) : [...ids, id]);
      }}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric ${
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2.5 text-sm"
      } ${
        selected
          ? "border-electric bg-electric text-white hover:bg-electric-strong"
          : "border-line bg-surface-raised text-foreground hover:border-electric hover:text-electric"
      }`}
    >
      <span aria-hidden className="text-base leading-none">{selected ? "✓" : "⇄"}</span>
      {selected ? labels.remove : labels.add}
    </button>
  );
}
