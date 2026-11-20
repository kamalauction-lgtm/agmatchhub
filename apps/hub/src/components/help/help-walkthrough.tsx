"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { WalkStep } from "@/lib/help/types";

export type WalkLabels = {
  stepOf: string; // "Step {n} of {total}"
  doneOf: string; // "{n} of {total} done"
  steps: string;
  back: string;
  next: string;
  finish: string;
  markDone: string;
  done: string;
  finishedTitle: string;
  finishedBody: string;
  restart: string;
  allGuides: string;
  enlarge: string;
  noPicture: string;
  goodToKnow: string;
  shotAlt: string; // "Screenshot for step {n}"
  keys: string;
};

const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export function storageKey(audience: string, slug: string) {
  return `help-progress:${audience}:${slug}`;
}

const CHANGED = "help-progress-changed";

function readRaw(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "[]";
  } catch {
    return "[]";
  }
}

function parseDone(raw: string): number[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function writeDone(key: string, done: number[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(done));
  } catch {
    /* private mode: progress simply is not remembered */
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGED, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGED, cb);
  };
}

/** Steps ticked on this device, kept in localStorage (empty on the server). */
function useDone(key: string): number[] {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => "[]");
  return useMemo(() => parseDone(raw), [raw]);
}

/**
 * One guide as a walkthrough: a picture of the real screen with the thing to
 * press highlighted, the instruction under it, Back / Next, and a step list
 * the reader can jump around in. Progress is remembered on this device only.
 */
export function HelpWalkthrough({
  steps, audience, slug, initialStep, labels, base,
}: {
  steps: WalkStep[];
  /** The guides index, for "All guides" at the end. */
  base: string;
  audience: string;
  slug: string;
  initialStep: number;
  labels: WalkLabels;
}) {
  const total = steps.length;
  const key = storageKey(audience, slug);
  const [i, setI] = useState(() => Math.min(Math.max(initialStep, 0), Math.max(total - 1, 0)));
  const done = useDone(key);
  const [finished, setFinished] = useState(false);

  // Keep ?step= in the address bar so a link from a screen lands on the right step.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(i + 1));
    window.history.replaceState(null, "", url);
  }, [i]);

  const toggleDone = useCallback((n: number, value?: boolean) => {
    const prev = parseDone(readRaw(key));
    const has = prev.includes(n);
    const want = value ?? !has;
    if (want === has) return;
    writeDone(key, want ? [...prev, n].sort((a, b) => a - b) : prev.filter((x) => x !== n));
  }, [key]);

  const go = useCallback((n: number) => {
    setFinished(false);
    setI(Math.min(Math.max(n, 0), total - 1));
  }, [total]);

  const next = useCallback(() => {
    toggleDone(i, true);
    if (i === total - 1) setFinished(true);
    else go(i + 1);
  }, [i, total, go, toggleDone]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go, next]);

  const step = steps[i];
  const pct = total ? Math.round(((finished ? total : i + 1) / total) * 100) : 0;

  // Group the list by section for the sidebar.
  const groups = useMemo(() => {
    const g: { title: string; items: { n: number; text: string }[] }[] = [];
    steps.forEach((s, n) => {
      if (!g.length || g[g.length - 1].title !== s.section || (n > 0 && steps[n - 1].sectionIndex !== s.sectionIndex)) {
        g.push({ title: s.section, items: [] });
      }
      g[g.length - 1].items.push({ n, text: s.text });
    });
    return g;
  }, [steps]);

  if (!total) return null;

  const stepList = (
    <ol className="space-y-4" aria-label={labels.steps}>
      {groups.map((g, gi) => (
        <li key={gi}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.title}</p>
          <ol className="space-y-1">
            {g.items.map(({ n, text }) => {
              const current = n === i && !finished;
              const isDone = done.includes(n);
              return (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => go(n)}
                    aria-current={current ? "step" : undefined}
                    className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson ${current ? "bg-crimson-soft text-foreground" : "hover:bg-surface"}`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isDone ? "bg-success-fill text-white" : current ? "bg-crimson text-white" : "border border-line-strong text-muted-strong"}`}
                    >
                      {isDone ? <CheckIcon /> : n + 1}
                    </span>
                    <span className={`line-clamp-2 ${current ? "font-medium" : "text-muted-strong"}`}>{text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );

  return (
    <div data-help-walk={slug} data-step={i + 1} className="mt-6">
      {/* Progress */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-semibold" aria-live="polite">
          {finished ? labels.finishedTitle : fill(labels.stepOf, { n: i + 1, total })}
        </p>
        <p className="text-muted-strong">{fill(labels.doneOf, { n: done.length, total })}</p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={fill(labels.stepOf, { n: i + 1, total })}
      >
        <div className="h-full rounded-full bg-crimson transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Step list: sidebar on wide screens, folded on phones */}
        <aside className="order-2 lg:order-1">
          <details className="rounded-xl border border-line bg-card p-3 lg:hidden">
            <summary className="tap cursor-pointer text-sm font-semibold">{labels.steps}</summary>
            <div className="mt-3">{stepList}</div>
          </details>
          <div className="sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-line bg-card p-3 lg:block">
            {stepList}
          </div>
        </aside>

        <section className="order-1 min-w-0 lg:order-2">
          {finished ? (
            <div className="rounded-2xl border border-line bg-card p-8 text-center" data-help-finished="1">
              <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
                <CheckIcon size={28} />
              </span>
              <h2 className="mt-4 text-xl font-semibold">{labels.finishedTitle}</h2>
              <p className="mt-2 text-sm text-muted-strong">{labels.finishedBody}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={() => go(0)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-semibold transition-colors hover:border-crimson focus-visible:outline-2 focus-visible:outline-crimson">
                  {labels.restart}
                </button>
                <Link href={base} className="inline-flex min-h-11 items-center rounded-lg bg-crimson px-4 text-sm font-semibold text-white transition-colors hover:bg-crimson-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson">
                  {labels.allGuides}
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Picture with the highlight */}
              {step.src ? (
                <figure className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                  <div className="relative">
                    <Image
                      key={step.src}
                      src={step.src}
                      alt={fill(labels.shotAlt, { n: i + 1 })}
                      width={1280}
                      height={800}
                      priority={i === 0}
                      className="block h-auto w-full"
                    />
                    {step.box && (
                      <div
                        aria-hidden
                        data-help-highlight="1"
                        className="pointer-events-none absolute rounded-lg border-[3px] border-crimson shadow-[0_0_0_9999px_rgb(15_23_42/0.45)] transition-all duration-300 motion-reduce:transition-none"
                        style={{ left: `${step.box.x}%`, top: `${step.box.y}%`, width: `${step.box.w}%`, height: `${step.box.h}%` }}
                      >
                        <span className="absolute -inset-1.5 rounded-xl border-2 border-crimson/60 motion-safe:animate-pulse" />
                        <span className="absolute -left-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-crimson text-xs font-bold text-white shadow">
                          {i + 1}
                        </span>
                      </div>
                    )}
                  </div>
                  <figcaption className="flex justify-end border-t border-line bg-card px-3 py-1.5">
                    <a href={step.src} target="_blank" rel="noopener" className="text-xs text-muted-strong underline-offset-2 hover:text-crimson hover:underline">
                      {labels.enlarge}
                    </a>
                  </figcaption>
                </figure>
              ) : (
                <div className="flex aspect-[16/10] items-center justify-center rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted-strong">
                  {labels.noPicture}
                </div>
              )}

              {/* Instruction */}
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-crimson">{step.section}</p>
                <p className="mt-2 text-lg leading-7" data-help-text="1">{step.text}</p>
                {step.notes.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-strong">{labels.goodToKnow}</p>
                    {step.notes.map((n, k) => (
                      <p key={k} className="flex gap-2 rounded-lg bg-surface px-4 py-3 text-sm leading-6 text-muted-strong">
                        <InfoIcon />
                        <span>{n}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => go(i - 1)}
                  disabled={i === 0}
                  className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-semibold transition-colors hover:border-crimson disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-crimson"
                >
                  ← {labels.back}
                </button>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-[var(--success)]"
                    checked={done.includes(i)}
                    onChange={(e) => toggleDone(i, e.target.checked)}
                  />
                  {done.includes(i) ? labels.done : labels.markDone}
                </label>
                <button
                  type="button"
                  onClick={next}
                  data-help-next="1"
                  className="ml-auto min-h-11 cursor-pointer rounded-lg bg-crimson px-5 text-sm font-semibold text-white transition-colors hover:bg-crimson-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson"
                >
                  {i === total - 1 ? labels.finish : `${labels.next} →`}
                </button>
              </div>
              <p className="mt-3 hidden text-xs text-muted sm:block">{labels.keys}</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** "3 of 8 done" on a guide card, read from this device. */
export function HelpCardProgress({ audience, slug, total, label }: { audience: string; slug: string; total: number; label: string }) {
  const n = useDone(storageKey(audience, slug)).filter((x) => x < total).length;

  if (!n) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${n >= total ? "bg-success-soft text-success" : "bg-crimson-soft text-crimson"}`}>
      {n >= total && <CheckIcon size={12} />}
      {fill(label, { n, total })}
    </span>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
