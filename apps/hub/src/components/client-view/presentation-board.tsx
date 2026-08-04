"use client";

import { useEffect, useState } from "react";

/**
 * Client-side controls layered over the server-rendered property cards:
 *  - a tick box per property to choose which ones to compare / download
 *  - a Hide/Show toggle per property (persisted per device in localStorage)
 *  - a sticky action bar that compares/downloads only the ticked properties
 *
 * The cards themselves stay server-rendered (i18n, images, feedback forms with
 * server actions) and are passed in as `cards`, parallel to `items`.
 */
export function PresentationBoard({
  token,
  allowComparison,
  items,
  cards,
  labels,
}: {
  token: string;
  allowComparison: boolean;
  items: { ppid: string; title: string }[];
  cards: React.ReactNode[];
  labels: {
    select: string;
    hide: string;
    show: string;
    hidden: string;
    compare: string;
    download: string;
    hint: string;
  };
}) {
  const allIds = items.map((i) => i.ppid);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allIds));
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Restore hidden set per presentation (per device). Deferred off the effect
  // body so the state update isn't synchronous within the effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      try {
        const raw = localStorage.getItem(`mh_hidden_${token}`);
        if (raw && !cancelled) setHidden(new Set(JSON.parse(raw) as string[]));
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const persistHidden = (next: Set<string>) => {
    setHidden(next);
    try {
      localStorage.setItem(`mh_hidden_${token}`, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const toggleSelect = (ppid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ppid)) next.delete(ppid);
      else next.add(ppid);
      return next;
    });
  };
  const hide = (ppid: string) => {
    const next = new Set(hidden);
    next.add(ppid);
    persistHidden(next);
  };
  const show = (ppid: string) => {
    const next = new Set(hidden);
    next.delete(ppid);
    persistHidden(next);
  };

  // Effective selection = ticked AND not hidden.
  const chosen = allIds.filter((id) => selected.has(id) && !hidden.has(id));
  const idsParam = chosen.join(",");

  return (
    <div>
      {allowComparison && (
        <p className="mb-4 text-center text-xs text-muted">{labels.hint}</p>
      )}

      <div className="space-y-10">
        {items.map((item, i) => {
          const isHidden = hidden.has(item.ppid);
          if (isHidden) {
            return (
              <div key={item.ppid}
                className="flex items-center justify-between rounded-xl border border-dashed border-line bg-surface px-4 py-3">
                <span className="truncate text-sm text-muted">
                  {i + 1}. {item.title} · <span className="italic">{labels.hidden}</span>
                </span>
                <button type="button" onClick={() => show(item.ppid)}
                  className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-crimson hover:text-crimson">
                  {labels.show}
                </button>
              </div>
            );
          }
          return (
            <div key={item.ppid}>
              <div className="mb-2 flex items-center justify-between gap-2">
                {allowComparison ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={selected.has(item.ppid)}
                      onChange={() => toggleSelect(item.ppid)}
                      className="h-4 w-4 accent-crimson" />
                    {labels.select}
                  </label>
                ) : <span />}
                <button type="button" onClick={() => hide(item.ppid)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-crimson hover:text-crimson">
                  {labels.hide}
                </button>
              </div>
              {cards[i]}
            </div>
          );
        })}
      </div>

      {allowComparison && chosen.length >= 1 && (
        <div className="sticky bottom-0 z-10 mt-8 flex flex-wrap justify-center gap-3 rounded-t-2xl border border-line bg-background/95 p-4 shadow-lg backdrop-blur">
          {chosen.length >= 2 && (
            <a href={`/p/${token}/compare?ids=${idsParam}`}
              className="rounded-lg border border-crimson px-5 py-2.5 text-sm font-semibold text-crimson hover:bg-crimson-soft">
              {labels.compare} ({chosen.length})
            </a>
          )}
          <a href={`/p/${token}/compare/export?ids=${idsParam}`}
            className="rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong">
            ⬇ {labels.download} ({chosen.length})
          </a>
        </div>
      )}
    </div>
  );
}
