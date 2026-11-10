"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { OfficeData, Worker, WorkerState } from "@/lib/ai/office-state";
import { refreshOffice } from "@/app/(agent)/ai/office/actions";
import { STATE_COLOR, relTime, type OfficeLabels } from "./office/types";
import { CELL, CommandHub, OfficeRoom } from "./office/office-room";
import { OfficeCanvas } from "./office/office-canvas";
import { AgentAvatarCard } from "./office/agent-avatar-card";
import { AgentDetailPanel } from "./office/agent-detail-panel";
import { OfficeViewToggle, type OfficeView } from "./office/office-view-toggle";
import { AgentStatusBadge } from "./office/agent-status-badge";
import { ActivityFeed, DepartmentStatus, TaskQueue } from "./office/office-panels";
import { iso } from "./office/scene-art";

export type { OfficeLabels } from "./office/types";

/**
 * AI Live Office — orchestration. KPI band, Office/List views, the isometric
 * floor (twelve glass rooms around Astra's command hub) inside a zoom-and-pan
 * canvas, a docked inspector, three operational panels, 30 s visibility-aware
 * refresh and the labelled DEMO simulation. Every state is decided on the
 * server by buildOffice(); this file draws and never infers.
 */

/** Outer ring of a 4×4 cell grid; the inner 2×2 is the command plaza. */
const RING: Array<[number, number]> = [
  [0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1],
];
const MANAGER_KEY = "ai_manager";
const DEMO_STATES: WorkerState[] = ["finished", "active", "attention", "idle", "active", "finished", "idle"];

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
  const manager = byKey.get(MANAGER_KEY) ?? null;
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
  const stateLabel = (w: Worker) => labels.state[w.state];
  const openWorker = (key: string) => { setOpenDept(null); setOpenKey(key); };
  const closePanel = () => { setOpenKey(null); setOpenDept(null); };
  const panelOpen = !!(activeWorker || activeDept);

  // Floor geometry: 4 × 4 cells; rooms drawn back-to-front by depth.
  const rooms = data.departments.map((d, i) => {
    const [c, r] = RING[i] ?? [i % 4, 3];
    return { d, u0: c * CELL, v0: r * CELL, depth: c + r, index: i };
  }).sort((a, b) => a.depth - b.depth);
  const base = useMemo(() => {
    const tl = iso(0, 4 * CELL);     // left-most point
    const tr = iso(4 * CELL, 0);     // right-most point
    const top = iso(0, 0, 150);      // highest (plates / beam)
    const bottom = iso(4 * CELL, 4 * CELL);
    return { x: tl.x - 20, y: top.y - 10, w: tr.x - tl.x + 40, h: bottom.y - top.y + 60 };
  }, []);

  const defs = (
    <>
      <linearGradient id="floorCarpet" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1a3566" />
        <stop offset="1" stopColor="#0f2148" />
      </linearGradient>
      <linearGradient id="plazaFloor" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#13284f" />
        <stop offset="1" stopColor="#0b1b33" />
      </linearGradient>
      <radialGradient id="hubFloor">
        <stop offset="0" stopColor="#2563eb" stopOpacity="0.55" />
        <stop offset="1" stopColor="#0b1b33" stopOpacity="0.9" />
      </radialGradient>
      <linearGradient id="holoBeam" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#60a5fa" stopOpacity="0.35" />
        <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="holoSheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.25" />
        <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="1" stopColor="#60a5fa" stopOpacity="0.25" />
      </linearGradient>
      {workers.map((w) => (
        <clipPath key={w.key} id={`pclip-${w.key}`}>
          <rect x="-21" y="-52" width="42" height="50" rx="6" />
        </clipPath>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      {/* KPI band ------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi label={labels.kpi.specialists} value={kpi.specialists} icon="👥" />
        <Kpi label={labels.kpi.activeNow} value={kpi.activeNow} color={STATE_COLOR.finished} demo={demo} demoLabel={labels.demoBadge} icon="〰" />
        <Kpi label={labels.kpi.waiting} value={kpi.waiting} color={STATE_COLOR.attention} demo={demo} demoLabel={labels.demoBadge} icon="⧗" />
        <Kpi label={labels.kpi.completedToday} value={kpi.completedToday} color={STATE_COLOR.active} demo={demo} demoLabel={labels.demoBadge} icon="✓" />
        <Kpi label={labels.kpi.departments} value={kpi.departments} icon="⬡" />
      </div>

      {/* Toolbar -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <OfficeViewToggle value={view} onChange={setView} labels={labels.view} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{labels.updated} {relTime(data.generatedAt, locale, "")}</span>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-blue hover:text-blue disabled:opacity-50">
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
        <p role="status" className="rounded-xl border-2 border-dashed border-gold-light bg-accent-soft px-4 py-3 text-sm font-semibold text-accent">{labels.demoBanner}</p>
      )}
      {!data.verified && <p className="rounded-xl border border-crimson/30 bg-crimson-soft px-4 py-3 text-sm">{labels.offline}</p>}

      {/* Floor + docked inspector ------------------------------------------- */}
      <div className={`grid gap-4 ${panelOpen ? "xl:grid-cols-[1fr_22rem]" : ""}`}>
        {view === "office" ? (
          <div className={`office-floor command-band relative overflow-hidden rounded-2xl ${demo ? "office-demo" : ""}`}>
            <div aria-hidden className="office-grid pointer-events-none absolute inset-0" />
            <div aria-hidden className="office-skyline pointer-events-none absolute inset-x-0 top-0 h-28" />
            <div aria-hidden className="office-scan pointer-events-none absolute inset-0" />
            <OfficeCanvas base={base} initialZoom={0.9} defs={defs} labels={labels.canvas} ariaLabel={labels.legend} className="relative z-[1]">
              <CommandHub
                u0={CELL} v0={CELL} size={2 * CELL} manager={manager} hqLabel={labels.hq}
                demo={demo && manager?.access === "open"} demoLabel={labels.demoBadge}
                onOpen={openWorker} titleOf={titleOf} stateLabel={stateLabel}
              />
              {rooms.map(({ d, u0, v0, index }) => (
                <OfficeRoom
                  key={d.key} u0={u0} v0={v0} index={index}
                  label={labels.departments[d.key] ?? d.key}
                  workers={d.workers.filter((w) => w.key !== MANAGER_KEY).map((w) => byKey.get(w.key) ?? w)}
                  selected={openDept === d.key}
                  demo={demo} demoLabel={labels.demoBadge}
                  onOpenWorker={openWorker}
                  onOpenRoom={() => { setOpenKey(null); setOpenDept(d.key); }}
                  titleOf={titleOf} stateLabel={stateLabel}
                />
              ))}
            </OfficeCanvas>
          </div>
        ) : (
          <div className="space-y-4">
            {data.departments.map((d) => (
              <section key={d.key} className="rounded-2xl border border-line bg-page p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.departments[d.key] ?? d.key}</h2>
                  <div className="flex gap-1.5">
                    {d.workers.map((w0) => <AgentStatusBadge key={w0.key} state={(byKey.get(w0.key) ?? w0).state} labels={labels} size="xs" />)}
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

        {panelOpen && (
          <>
            <div className="hidden xl:block">
              <AgentDetailPanel docked worker={activeWorker} department={activeDept} members={activeDept ? activeDept.workers.map((w) => byKey.get(w.key) ?? w) : []} labels={labels} locale={locale} demo={demo && (activeWorker?.access === "open" || !!activeDept)} onClose={closePanel} onOpenWorker={openWorker} />
            </div>
            <div className="xl:hidden">
              <AgentDetailPanel worker={activeWorker} department={activeDept} members={activeDept ? activeDept.workers.map((w) => byKey.get(w.key) ?? w) : []} labels={labels} locale={locale} demo={demo && (activeWorker?.access === "open" || !!activeDept)} onClose={closePanel} onOpenWorker={openWorker} />
            </div>
          </>
        )}
      </div>

      {/* Operational panels ------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ActivityFeed workers={workers} labels={labels} locale={locale} demo={demo} generatedAt={data.generatedAt} />
        <TaskQueue workers={workers} labels={labels} locale={locale} demo={demo} />
        <DepartmentStatus workers={workers} labels={labels} departments={data.totals.departments} />
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label={labels.legend}>
        {(Object.keys(labels.state) as WorkerState[]).map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STATE_COLOR[s] }} />
            {labels.state[s]}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{labels.truth}</p>
    </div>
  );
}

function Kpi({ label, value, color, demo, demoLabel, icon }: { label: string; value: number; color?: string; demo?: boolean; demoLabel?: string; icon: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-card">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base" style={{ background: color ? `${color}22` : "var(--surface)", color: color ?? "var(--muted-strong)" }}>{icon}</span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2 text-2xl font-bold leading-none tabular-nums" style={color ? { color } : undefined}>
          {value}
          {demo && color && <span className="rounded bg-gold-light px-1 text-[10px] font-bold text-foreground">{demoLabel}</span>}
        </span>
        <span className="mt-1 block truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      </span>
    </div>
  );
}
