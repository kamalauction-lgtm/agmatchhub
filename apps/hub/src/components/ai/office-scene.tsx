"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { OfficeData, Worker, WorkerState } from "@/lib/ai/office-state";
import { refreshOffice } from "@/app/(agent)/ai/office/actions";
import { STATE_COLOR, relTime, type OfficeLabels } from "./office/types";
import { OfficeRoom, TILE_H, TILE_W } from "./office/office-room";
import { AgentAvatarCard } from "./office/agent-avatar-card";
import { AgentDetailPanel } from "./office/agent-detail-panel";
import { OfficeViewToggle, type OfficeView } from "./office/office-view-toggle";
import { AgentStatusBadge } from "./office/agent-status-badge";

export type { OfficeLabels } from "./office/types";

/**
 * AI Live Office — orchestration: KPI band, Office/List view, the isometric
 * floor built from OfficeRoom, the detail panel, 30 s visibility-aware
 * refresh, and the labelled DEMO simulation. Every state is decided on the
 * server by buildOffice(); this file draws and never infers.
 */

const ORIGIN = { x: 640, y: 150 };
const GRID: Array<[number, number]> = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [0, 1], [1, 1], [2, 1], [3, 1],
  [0, 2], [1, 2], [2, 2], [3, 2],
];
const iso = (col: number, row: number) => ({
  x: ORIGIN.x + ((col - row) * TILE_W) / 2,
  y: ORIGIN.y + ((col + row) * TILE_H) / 2,
});
const DEMO_STATES: WorkerState[] = ["finished", "active", "attention", "idle", "active", "finished", "idle"];

/** Phones default to the list: the floor is a tablet-and-up experience. */
const PHONE = "(max-width: 767px)";
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsPhone = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false);

export function OfficeScene({
  initial,
  labels,
  locale,
  demoAllowed,
}: {
  initial: OfficeData;
  labels: OfficeLabels;
  locale: string;
  demoAllowed: boolean;
}) {
  const [data, setData] = useState<OfficeData>(initial);
  const isPhone = useIsPhone();
  const [viewChoice, setView] = useState<OfficeView | null>(null);
  const view: OfficeView = viewChoice ?? (isPhone ? "list" : "office");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openDept, setOpenDept] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoTick, setDemoTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await refreshOffice();
      if (next) setData(next);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    timer.current = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  useEffect(() => {
    if (!demo) return;
    const id = window.setInterval(() => setDemoTick((t) => t + 1), 4500);
    return () => window.clearInterval(id);
  }, [demo]);

  useEffect(() => {
    if (!openKey && !openDept) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenKey(null); setOpenDept(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey, openDept]);

  // Demo overrides apply to OPEN roles only: a planned role never looks busy.
  const workers = useMemo(() => {
    const all = data.departments.flatMap((d) => d.workers);
    if (!demo) return all;
    return all.map((w, i) => {
      if (w.access !== "open") return w;
      const state = DEMO_STATES[(i * 5 + demoTick) % DEMO_STATES.length];
      return { ...w, state, todayCount: state === "idle" ? 0 : ((i + demoTick) % 4) + 1, queueCount: state === "attention" ? ((i + demoTick) % 2) + 1 : 0 };
    });
  }, [data, demo, demoTick]);
  const byKey = useMemo(() => new Map(workers.map((w) => [w.key, w])), [workers]);
  const activeWorker = openKey ? byKey.get(openKey) ?? null : null;
  const activeDept = openDept ? data.departments.find((d) => d.key === openDept) ?? null : null;

  const kpi = useMemo(() => ({
    specialists: data.totals.workers,
    activeNow: workers.filter((w) => w.state === "finished").length,
    waiting: workers.filter((w) => w.state === "attention").length,
    completedToday: demo ? workers.reduce((n, w) => n + w.todayCount, 0) : data.totals.completedToday,
    departments: data.totals.departments,
  }), [workers, data, demo]);

  const titleOf = (w: Worker) => `${w.persona} · ${w.role} · ${labels.state[w.state]}`;
  const openWorker = (key: string) => { setOpenDept(null); setOpenKey(key); };

  return (
    <div className="space-y-4">
      {/* KPI band ------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi label={labels.kpi.specialists} value={kpi.specialists} />
        <Kpi label={labels.kpi.activeNow} value={kpi.activeNow} color={STATE_COLOR.finished} demo={demo} demoLabel={labels.demoBadge} />
        <Kpi label={labels.kpi.waiting} value={kpi.waiting} color={STATE_COLOR.attention} demo={demo} demoLabel={labels.demoBadge} />
        <Kpi label={labels.kpi.completedToday} value={kpi.completedToday} color={STATE_COLOR.active} demo={demo} demoLabel={labels.demoBadge} />
        <Kpi label={labels.kpi.departments} value={kpi.departments} />
      </div>

      {/* Toolbar -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <OfficeViewToggle value={view} onChange={setView} labels={labels.view} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{labels.updated} {relTime(data.generatedAt, locale, "")}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-blue hover:text-blue disabled:opacity-50"
          >
            {refreshing ? labels.refreshing : labels.refresh}
          </button>
          {demoAllowed && (
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${demo ? "border-gold-light bg-gold-light text-foreground" : "border-gold-light/60 bg-accent-soft text-accent"}`}>
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="h-3.5 w-3.5" />
              {labels.demoToggle}
            </label>
          )}
        </div>
      </div>

      {demo && (
        <p role="status" className="rounded-xl border-2 border-dashed border-gold-light bg-accent-soft px-4 py-3 text-sm font-semibold text-accent">
          {labels.demoBanner}
        </p>
      )}
      {!data.verified && (
        <p className="rounded-xl border border-crimson/30 bg-crimson-soft px-4 py-3 text-sm">{labels.offline}</p>
      )}

      {view === "office" ? (
        <div className={`office-floor command-band relative overflow-hidden rounded-2xl ${demo ? "office-demo" : ""}`}>
          <div aria-hidden className="office-grid pointer-events-none absolute inset-0" />
          <div aria-hidden className="office-skyline pointer-events-none absolute inset-x-0 top-0 h-24" />
          <div aria-hidden className="office-scan pointer-events-none absolute inset-0" />
          <svg viewBox="240 40 940 580" className="relative block h-auto w-full min-w-[720px]" role="img" aria-label={labels.legend}>
            <defs>
              <linearGradient id="roomFloor" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#1f3f73" />
                <stop offset="1" stopColor="#10224a" />
              </linearGradient>
              <radialGradient id="monitorGlow">
                <stop offset="0" stopColor="#9fb8ff" stopOpacity="0.5" />
                <stop offset="1" stopColor="#9fb8ff" stopOpacity="0" />
              </radialGradient>
              {workers.map((w) => (
                <clipPath key={w.key} id={`clip-${w.key}`}>
                  <circle cx="0" cy="0" r="16" />
                </clipPath>
              ))}
            </defs>
            {/* Rooms are drawn back-to-front so nearer rooms overlap farther ones. */}
            {data.departments
              .map((d, i) => ({ d, pos: iso(...(GRID[i] ?? [i % 4, Math.floor(i / 4)])) }))
              .sort((a, b) => a.pos.y - b.pos.y)
              .map(({ d, pos }) => (
                <OfficeRoom
                  key={d.key}
                  pos={pos}
                  label={labels.departments[d.key] ?? d.key}
                  workers={d.workers.map((w) => byKey.get(w.key) ?? w)}
                  selected={openDept === d.key}
                  demo={demo}
                  demoLabel={labels.demoBadge}
                  onOpenWorker={openWorker}
                  onOpenRoom={() => { setOpenKey(null); setOpenDept(d.key); }}
                  titleOf={titleOf}
                />
              ))}
          </svg>
        </div>
      ) : (
        <div className="space-y-4">
          {data.departments.map((d) => (
            <section key={d.key} className="rounded-2xl border border-line bg-page p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.departments[d.key] ?? d.key}</h2>
                <div className="flex gap-1.5">
                  {d.workers.map((w0) => {
                    const w = byKey.get(w0.key) ?? w0;
                    return <AgentStatusBadge key={w.key} state={w.state} labels={labels} size="xs" />;
                  })}
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {d.workers.map((w0) => {
                  const w = byKey.get(w0.key) ?? w0;
                  return <AgentAvatarCard key={w.key} w={w} labels={labels} locale={locale} demo={demo && w.access === "open"} onOpen={() => openWorker(w.key)} />;
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label={labels.legend}>
        {(Object.keys(labels.state) as WorkerState[]).map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STATE_COLOR[s] }} />
            {labels.state[s]}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{labels.truth}</p>

      {(activeWorker || activeDept) && (
        <AgentDetailPanel
          worker={activeWorker}
          department={activeDept}
          members={activeDept ? activeDept.workers.map((w) => byKey.get(w.key) ?? w) : []}
          labels={labels}
          locale={locale}
          demo={demo && (activeWorker?.access === "open" || !!activeDept)}
          onClose={() => { setOpenKey(null); setOpenDept(null); }}
          onOpenWorker={openWorker}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, color, demo, demoLabel }: { label: string; value: number; color?: string; demo?: boolean; demoLabel?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-2 text-2xl font-bold tabular-nums" style={color ? { color } : undefined}>
        {value}
        {demo && color && <span className="rounded bg-gold-light px-1 text-[10px] font-bold text-foreground">{demoLabel}</span>}
      </p>
    </div>
  );
}
