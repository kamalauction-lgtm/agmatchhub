"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * AI Workforce gallery (futuristic pilot, step 2). Client-side search and
 * category filter over a list the server has already built, plus a worker
 * detail dialog. Every status, label and link arrives pre-computed from the
 * server page, so this component decides nothing about what a role can do.
 */

export type WorkerItem = {
  key: string;
  category: string;
  name: string;
  persona: string | null;
  tagline: string;
  description: string;
  skills: string[];
  portrait: string | null;
  premium: boolean;
  statusTone: BadgeTone;
  statusLabel: string;
  /** Where the card and dialog link to; null when the role is not open yet. */
  actionHref: string | null;
  actionExternal: boolean;
  actionLabel: string;
  /** Shown instead of an action when the role is not open. */
  unavailableHint: string;
  alsoHeroHref: string | null;
  alsoHeroLabel: string | null;
};

export type WorkforceLabels = {
  search: string;
  allCategories: string;
  noResults: string;
  close: string;
  detailStatus: string;
  detailSkills: string;
  premium: string;
  alsoHero: string;
};

export function WorkforceGallery({
  items,
  categories,
  labels,
}: {
  items: WorkerItem[];
  categories: { key: string; label: string }[];
  labels: WorkforceLabels;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (category && i.category !== category) return false;
      if (!q) return true;
      return [i.name, i.persona ?? "", i.tagline, i.description, ...i.skills].join(" ").toLowerCase().includes(q);
    });
  }, [items, query, category]);

  const active = openKey ? items.find((i) => i.key === openKey) ?? null : null;

  // Escape closes the dialog; focus returns to the page, not the top of the document.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenKey(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div className="space-y-6">
      {/* Search + category navigation ----------------------------------- */}
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.search}
          aria-label={labels.search}
          className="min-h-11 w-full rounded-xl border border-line-strong bg-card px-4 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue sm:max-w-md"
        />
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group">
          <CategoryChip label={labels.allCategories} pressed={category === null} onClick={() => setCategory(null)} />
          {categories.map((c) => (
            <CategoryChip key={c.key} label={c.label} pressed={category === c.key} onClick={() => setCategory(c.key)} />
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={labels.noResults} />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => setOpenKey(i.key)}
                className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-card text-left shadow-card transition-colors duration-150 hover:border-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
              >
                <div className="relative aspect-[448/232] w-full overflow-hidden bg-blue-soft">
                  {i.portrait ? (
                    <Image
                      src={i.portrait}
                      alt={i.persona ? `${i.persona}` : i.name}
                      fill
                      unoptimized
                      sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw"
                      className={`object-cover object-top transition-transform duration-300 group-hover:scale-[1.03] ${i.statusTone === "neutral" ? "saturate-[.6]" : ""}`}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-4xl text-blue/40">✦</div>
                  )}
                  <div className="absolute right-3 top-3">
                    <Badge tone={i.statusTone} className="shadow-card">{i.statusLabel}</Badge>
                  </div>
                  {i.premium && (
                    <div className="absolute left-3 top-3">
                      <Badge tone="warning" className="shadow-card">{labels.premium}</Badge>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-base font-semibold">{i.name}</h3>
                    {i.persona && <span className="shrink-0 text-sm font-bold text-blue">✦ {i.persona}</span>}
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-muted">{i.tagline || i.description}</p>
                  <p className="mt-auto pt-4 text-xs font-semibold text-blue">
                    {i.actionHref ? `${i.actionLabel} ${i.actionExternal ? "↗" : "→"}` : i.unavailableHint}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Worker detail dialog ------------------------------------------- */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/60 p-0 sm:items-center sm:p-6" onClick={() => setOpenKey(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={active.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-card shadow-raised sm:max-w-2xl sm:rounded-3xl"
          >
            <div className="relative aspect-[448/232] w-full overflow-hidden bg-blue-soft">
              {active.portrait && (
                <Image src={active.portrait} alt={active.persona ?? active.name} fill unoptimized sizes="(min-width: 640px) 42rem, 100vw" className="object-cover object-top" />
              )}
              <div className="absolute left-4 top-4 flex gap-2">
                <Badge tone={active.statusTone} className="shadow-card">{active.statusLabel}</Badge>
                {active.premium && <Badge tone="warning" className="shadow-card">{labels.premium}</Badge>}
              </div>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold">{active.name}</h2>
                  {active.persona && <p className="mt-0.5 text-sm font-bold text-blue">✦ {active.persona}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setOpenKey(null)}
                  className="min-h-11 shrink-0 rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-surface"
                >
                  {labels.close}
                </button>
              </div>
              <p className="text-sm leading-6 text-muted-strong">{active.description}</p>
              {active.skills.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{labels.detailSkills}</h3>
                  <ul className="flex flex-wrap gap-2">
                    {active.skills.map((s) => (
                      <li key={s} className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted-strong">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                {active.actionHref ? (
                  active.actionExternal ? (
                    <a href={active.actionHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-blue px-5 text-sm font-semibold text-white">
                      {active.actionLabel} ↗
                    </a>
                  ) : (
                    <Link href={active.actionHref} className="inline-flex min-h-11 items-center rounded-xl bg-blue px-5 text-sm font-semibold text-white">
                      {active.actionLabel} →
                    </Link>
                  )
                ) : (
                  <p className="text-sm text-muted">{active.unavailableHint}</p>
                )}
                {active.alsoHeroHref && active.alsoHeroLabel && (
                  <a href={active.alsoHeroHref} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-indigo hover:underline">
                    {active.alsoHeroLabel} ↗
                  </a>
                )}
              </div>
              <p className="text-xs text-muted">{labels.detailStatus}: {active.statusLabel}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryChip({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${
        pressed ? "border-blue bg-blue text-white" : "border-line-strong bg-card text-muted-strong hover:border-blue"
      }`}
    >
      {label}
    </button>
  );
}
