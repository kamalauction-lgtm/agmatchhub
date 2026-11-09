"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { OfficeData, Worker, WorkerState } from "@/lib/ai/office-state";
import { refreshOffice } from "@/app/(agent)/ai/office/actions";

/**
 * AI Live Office — the isometric floor and the inspector.
 *
 * Pure presentation: every state arrives decided by `buildOffice()` on the
 * server, and this component only draws it. The one thing it adds is DEMO
 * mode, a client-side simulation that is labelled on the banner, on every
 * character and in the inspector, never written anywhere, and off by default.
 *
 * Rendering: inline SVG with CSS keyframe animations rather than a canvas
 * engine. The scene is 36 sprites on 12 tiles — well inside what SVG handles —
 * and it stays server-renderable, accessible (each character is a real
 * button), crisp on any DPI and free of a 400 KB dependency. Reduced motion
 * disables every animation; phones get a department list instead of the floor.
 */

export type OfficeLabels = {
  departments: Record<string, string>;
  state: Record<WorkerState, string>;
  stateHint: Record<WorkerState, string>;
  engine: Record<"ai" | "rules" | "rules_by_design", string>;
  access: Record<"open" | "unavailable" | "planned" | "hero" | "hero_open", string>;
  jobStatus: Record<"ok" | "degraded" | "error" | "denied", string>;
  reason: Record<string, string>;
  legend: string;
  lounge: string;
  refresh: string;
  refreshing: string;
  updated: string;
  demoToggle: string;
  demoOn: string;
  demoBanner: string;
  demoBadge: string;
  truth: string;
  offline: string;
  panel: {
    specialty: string;
    availability: string;
    engine: string;
    sharedEngine: string;
    current: string;
    currentNone: string;
    currentPending: string;
    last: string;
    never: string;
    outputs: string;
    outputsNone: string;
    pending: string;
    pendingNone: string;
    errors: string;
    errorsNone: string;
    open: string;
    openTasks: string;
    openWorkforce: string;
    close: string;
    due: string;
  };
  mobileHint: string;
  totals: { workers: string; open: string; ai: string; rules: string; attention: string; activeToday: string };
};

const TW = 236; // tile width (iso)
const TH = 118; // tile height (iso)
const ORIGIN = { x: 640, y: 96 };
const GRID: Array<[number, number]> = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [0, 1], [1, 1], [2, 1], [3, 1],
  [0, 2], [1, 2], [2, 2], [3, 2],
];
const LOUNGE: [number, number] = [4, 2];

const iso = (col: number, row: number) => ({
  x: ORIGIN.x + ((col - row) * TW) / 2,
  y: ORIGIN.y + ((col + row) * TH) / 2,
});

/** Three desk anchors inside a tile, left to right along the iso diagonal. */
const DESKS: Array<[number, number]> = [
  [-46, 48], [0, 72], [46, 96],
];

const STATE_COLOR: Record<WorkerState, string> = {
  planned: "#94a3b8",
  offline: "#94a3b8",
  idle: "#60a5fa",
  active: "#2563eb",
  finished: "#16a34a",
  attention: "#c9a64b",
  error: "#e53935",
};

const DEMO_STATES: WorkerState[] = ["active", "finished", "attention", "idle", "active"];

function relTime(iso: string | null, locale: string, never: string): string {
  if (!iso) return never;
  const diff = Date.now() - Date.parse(iso);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const min = Math.round(diff / 60000);
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const hrs = Math.round(min / 60);
  if (Math.abs(hrs) < 48) return rtf.format(-hrs, "hour");
  return rtf.format(-Math.round(hrs / 24), "day");
}

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
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoTick, setDemoTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<number | null>(null);

  // Near-realtime: one server action every 30 s while the tab is visible.
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
    const start = () => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 30_000);
    };
    start();
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  // DEMO mode: rotate simulated states every 5 s. Client-only, labelled.
  useEffect(() => {
    if (!demo) return;
    const id = window.setInterval(() => setDemoTick((t) => t + 1), 5000);
    return () => window.clearInterval(id);
  }, [demo]);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenKey(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);

  // The worker list, with demo overrides applied to OPEN roles only — a planned
  // role must never look busy, even in a simulation.
  const workers = useMemo(() => {
    const all = data.departments.flatMap((d) => d.workers);
    if (!demo) return all;
    return all.map((w, i) =>
      w.access === "open"
        ? { ...w, state: DEMO_STATES[(i * 7 + demoTick) % DEMO_STATES.length] }
        : w
    );
  }, [data, demo, demoTick]);
  const byKey = useMemo(() => new Map(workers.map((w) => [w.key, w])), [workers]);
  const active = openKey ? byKey.get(openKey) ?? null : null;

  const counts = useMemo(() => {
    const c = { attention: 0, activeToday: 0 };
    for (const w of workers) {
      if (w.state === "attention") c.attention++;
      if (w.state === "active" || w.state === "finished") c.activeToday++;
    }
    return c;
  }, [workers]);

  return (
    <div className="space-y-4">
      {/* Toolbar ----------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <Stat label={labels.totals.workers} value={data.totals.workers} />
          <Stat label={labels.totals.open} value={data.totals.open} />
          <Stat label={labels.totals.ai} value={data.totals.ai} />
          <Stat label={labels.totals.rules} value={data.totals.rules} />
          <Stat label={labels.totals.activeToday} value={counts.activeToday} tone={demo ? "demo" : undefined} />
          <Stat label={labels.totals.attention} value={counts.attention} tone={demo ? "demo" : undefined} />
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">
            {labels.updated} {relTime(data.generatedAt, locale, "")}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-blue hover:text-blue disabled:opacity-50"
          >
            {refreshing ? labels.refreshing : labels.refresh}
          </button>
          {demoAllowed && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gold-light/60 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent">
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

      {/* Floor (tablet and up) ---------------------------------------------- */}
      <div className={`office-floor command-band relative hidden overflow-hidden rounded-2xl md:block ${demo ? "office-demo" : ""}`}>
        <div aria-hidden className="office-grid pointer-events-none absolute inset-0" />
        <svg
          viewBox="250 70 900 560"
          className="relative block h-auto w-full"
          role="img"
          aria-label={labels.legend}
        >
          <defs>
            <linearGradient id="tileFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1d3a6b" />
              <stop offset="1" stopColor="#12264a" />
            </linearGradient>
            <linearGradient id="loungeFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3a3217" />
              <stop offset="1" stopColor="#2a2312" />
            </linearGradient>
            <radialGradient id="glow">
              <stop offset="0" stopColor="#60a5fa" stopOpacity="0.55" />
              <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
            </radialGradient>
            {workers.map((w) => (
              <clipPath key={w.key} id={`clip-${w.key}`}>
                <circle cx="0" cy="0" r="17" />
              </clipPath>
            ))}
          </defs>

          {/* Lounge tile: where idle characters wander to. */}
          <Tile pos={iso(...LOUNGE)} fill="url(#loungeFill)" label={labels.lounge} muted />

          {data.departments.map((d, i) => {
            const [col, row] = GRID[i] ?? [i % 4, Math.floor(i / 4)];
            const pos = iso(col, row);
            return (
              <g key={d.key}>
                <Tile pos={pos} fill="url(#tileFill)" label={labels.departments[d.key] ?? d.key} />
                {d.workers.map((w0, j) => {
                  const w = byKey.get(w0.key) ?? w0;
                  const [dx, dy] = DESKS[j] ?? DESKS[1];
                  const loungeTo = iso(...LOUNGE);
                  const walkX = loungeTo.x - (pos.x + dx);
                  const walkY = loungeTo.y + 60 - (pos.y + dy);
                  return (
                    <Character
                      key={w.key}
                      w={w}
                      x={pos.x + dx}
                      y={pos.y + dy}
                      index={i * 3 + j}
                      walk={{ x: walkX * 0.85, y: walkY * 0.85 }}
                      demo={demo && w.access === "open"}
                      demoBadge={labels.demoBadge}
                      onOpen={() => setOpenKey(w.key)}
                      title={`${w.persona} · ${w.role} · ${labels.state[w.state]}`}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend --------------------------------------------------------------- */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label={labels.legend}>
        {(Object.keys(labels.state) as WorkerState[]).map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STATE_COLOR[s] }} />
            {labels.state[s]}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{labels.truth}</p>

      {/* Phone: departments as a list — same data, same inspector. ------------- */}
      <div className="space-y-3 md:hidden">
        <p className="text-xs text-muted">{labels.mobileHint}</p>
        {data.departments.map((d) => (
          <section key={d.key} className="rounded-2xl border border-line bg-card p-3 shadow-card">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.departments[d.key] ?? d.key}</h2>
            <ul className="mt-2 divide-y divide-line">
              {d.workers.map((w0) => {
                const w = byKey.get(w0.key) ?? w0;
                return (
                  <li key={w.key}>
                    <button
                      type="button"
                      onClick={() => setOpenKey(w.key)}
                      className="flex w-full items-center gap-3 py-2 text-left"
                    >
                      <Avatar w={w} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">✦ {w.persona}</span>
                        <span className="block truncate text-xs text-muted">{w.role}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: STATE_COLOR[w.state] }}>
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR[w.state] }} />
                        {labels.state[w.state]}
                        {demo && w.access === "open" && <span className="rounded bg-accent-soft px-1 text-[10px] font-bold text-accent">{labels.demoBadge}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {active && (
        <Inspector w={active} labels={labels} locale={locale} demo={demo && active.access === "open"} onClose={() => setOpenKey(null)} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------- */

function Stat({ label, value, tone }: { label: string; value: number; tone?: "demo" }) {
  return (
    <div className="inline-flex items-baseline gap-1.5">
      <dt>{label}</dt>
      <dd className={`font-bold tabular-nums ${tone === "demo" ? "text-accent" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}

function Tile({ pos, fill, label, muted = false }: { pos: { x: number; y: number }; fill: string; label: string; muted?: boolean }) {
  const pts = `${pos.x},${pos.y} ${pos.x + TW / 2},${pos.y + TH / 2} ${pos.x},${pos.y + TH} ${pos.x - TW / 2},${pos.y + TH / 2}`;
  return (
    <g>
      <polygon points={pts} fill={fill} stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
      {/* Raised edge gives the tile a little depth. */}
      <polygon
        points={`${pos.x - TW / 2},${pos.y + TH / 2} ${pos.x},${pos.y + TH} ${pos.x},${pos.y + TH + 10} ${pos.x - TW / 2},${pos.y + TH / 2 + 10}`}
        fill="rgba(0,0,0,0.35)"
      />
      <polygon
        points={`${pos.x},${pos.y + TH} ${pos.x + TW / 2},${pos.y + TH / 2} ${pos.x + TW / 2},${pos.y + TH / 2 + 10} ${pos.x},${pos.y + TH + 10}`}
        fill="rgba(0,0,0,0.22)"
      />
      <text
        x={pos.x - TW / 2 + 22}
        y={pos.y + TH / 2 - 2}
        fontSize="11"
        fontWeight="600"
        fill={muted ? "rgba(201,166,75,0.9)" : "rgba(200,214,242,0.9)"}
        style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
      >
        {label}
      </text>
    </g>
  );
}

function Character({
  w, x, y, index, walk, demo, demoBadge, onOpen, title,
}: {
  w: Worker; x: number; y: number; index: number; walk: { x: number; y: number };
  demo: boolean; demoBadge: string; onOpen: () => void; title: string;
}) {
  const color = STATE_COLOR[w.state];
  const dim = w.state === "planned" || w.state === "offline";
  return (
    // Positioning and animation live on separate groups: a CSS transform on the
    // same element would replace the SVG translate and send the sprite to 0,0.
    <g transform={`translate(${x} ${y})`}>
    <g
      className={`office-char office-${w.state} ${index % 4 === 0 ? "office-wanderer" : ""}`}
      style={{ ["--walk-x" as string]: `${walk.x}px`, ["--walk-y" as string]: `${walk.y}px`, ["--i" as string]: index } as React.CSSProperties}
    >
      {/* Desk: a small iso block the character sits behind. */}
      <polygon points="-22,14 0,25 22,14 0,3" fill="#0b1b33" stroke="rgba(255,255,255,0.18)" />
      <polygon points="-22,14 0,25 0,31 -22,20" fill="#06101f" />
      <polygon points="0,25 22,14 22,20 0,31" fill="#081426" />
      {/* Monitor glow for roles that worked today. */}
      {(w.state === "active" || w.state === "finished") && <circle cx="0" cy="10" r="26" fill="url(#glow)" className="office-glow" />}

      <g className="office-body">
        <g
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
          aria-label={title}
          style={{ cursor: "pointer", outline: "none" }}
        >
          <title>{title}</title>
          {/* Hit area: the whole sprite, not just its drawn pixels. */}
          <rect x="-26" y="-50" width="52" height="84" fill="transparent" />
          <ellipse cx="0" cy="0" rx="13" ry="9" fill={dim ? "#334155" : "#1e3a8a"} transform="translate(0 2)" />
          <g transform="translate(0 -18)" style={{ opacity: dim ? 0.45 : 1, filter: dim ? "grayscale(1)" : undefined }}>
            <circle cx="0" cy="0" r="19" fill="#ffffff" />
            {w.avatar ? (
              <image href={w.avatar} x="-17" y="-17" width="34" height="34" clipPath={`url(#clip-${w.key})`} preserveAspectRatio="xMidYMid slice" />
            ) : (
              <text x="0" y="5" textAnchor="middle" fontSize="16" fill="#1e3a8a">✦</text>
            )}
            <circle cx="0" cy="0" r="19" fill="none" stroke={color} strokeWidth="2.5" />
          </g>
          {/* Status dot / badges. */}
          <circle cx="14" cy="-32" r="5" fill={color} stroke="#0b1b33" strokeWidth="1.5" />
          {w.state === "attention" && (
            <g className="office-bubble" transform="translate(0 -52)">
              <rect x="-10" y="-12" width="20" height="18" rx="6" fill="#c9a64b" />
              <text x="0" y="2" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0b1b33">!</text>
            </g>
          )}
          {w.state === "error" && (
            <g transform="translate(0 -52)">
              <rect x="-10" y="-12" width="20" height="18" rx="6" fill="#e53935" />
              <text x="0" y="2" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">×</text>
            </g>
          )}
          {w.state === "finished" && (
            <g className="office-sparkle" fill="#c9a64b">
              <circle cx="-22" cy="-36" r="2" /><circle cx="22" cy="-40" r="2.5" /><circle cx="0" cy="-48" r="2" /><circle cx="26" cy="-20" r="1.6" />
            </g>
          )}
          {demo && (
            <g transform="translate(-26 -46)">
              <rect width="26" height="12" rx="3" fill="#c9a64b" />
              <text x="13" y="9" textAnchor="middle" fontSize="8" fontWeight="800" fill="#0b1b33">{demoBadge}</text>
            </g>
          )}
        </g>
      </g>
      <text x="0" y="46" textAnchor="middle" fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.85)" style={{ pointerEvents: "none" }}>
        {w.persona}
      </text>
    </g>
    </g>
  );
}

function Avatar({ w, size }: { w: Worker; size: number }) {
  const color = STATE_COLOR[w.state];
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      {w.avatar ? (
        <Image src={w.avatar} alt="" width={size} height={size} unoptimized className="rounded-full object-cover" style={{ width: size, height: size, border: `2px solid ${color}` }} />
      ) : (
        <span className="grid h-full w-full place-items-center rounded-full bg-indigo-soft text-indigo">✦</span>
      )}
    </span>
  );
}

function Inspector({
  w, labels, locale, demo, onClose,
}: { w: Worker; labels: OfficeLabels; locale: string; demo: boolean; onClose: () => void }) {
  const color = STATE_COLOR[w.state];
  const total7d = w.counts7d.ok + w.counts7d.degraded + w.counts7d.error + w.counts7d.denied;
  const due = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : null);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={onClose} role="presentation">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${w.persona} · ${w.role}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-card shadow-raised"
      >
        <div className="command-band relative p-5">
          <button type="button" onClick={onClose} aria-label={labels.panel.close} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">×</button>
          <div className="flex items-center gap-4">
            <Avatar w={w} size={64} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-command-gold">{labels.departments[w.category] ?? w.category}</p>
              <h2 className="mt-0.5 truncate text-xl font-bold">✦ {w.persona}</h2>
              <p className="command-muted text-sm">{w.role}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: "rgba(255,255,255,0.12)" }}>
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />
              {labels.state[w.state]}
            </span>
            {demo && <span className="rounded-full bg-gold-light px-2.5 py-1 text-foreground">{labels.demoBadge}</span>}
          </div>
          <p className="command-muted mt-2 text-xs">{labels.stateHint[w.state]}</p>
        </div>

        <div className="flex-1 space-y-5 p-5 text-sm">
          <Row label={labels.panel.availability} value={labels.access[w.access]} />
          <Row label={labels.panel.engine} value={labels.engine[w.engine]} note={w.sharedWith.length ? `${labels.panel.sharedEngine} ${w.sharedWith.length}` : undefined} />

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.panel.current}</h3>
            <p className="mt-1">{w.pending.length > 0 ? labels.panel.currentPending : labels.panel.currentNone}</p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.panel.last}</h3>
            {w.lastAt ? (
              <p className="mt-1">
                {relTime(w.lastAt, locale, labels.panel.never)} · {labels.jobStatus[w.lastStatus ?? "ok"]}
                {w.lastStatus === "denied" && w.lastReason ? ` — ${labels.reason[w.lastReason] ?? w.lastReason}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-muted">{labels.panel.never}</p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.panel.outputs}</h3>
            {total7d > 0 ? (
              <dl className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                {(["ok", "degraded", "denied", "error"] as const).map((k) => (
                  <div key={k} className="rounded-lg bg-surface px-2 py-2">
                    <dd className="text-base font-bold tabular-nums">{w.counts7d[k]}</dd>
                    <dt className="text-muted">{labels.jobStatus[k]}</dt>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-1 text-muted">{labels.panel.outputsNone}</p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.panel.pending}</h3>
            {w.pending.length ? (
              <ul className="mt-2 space-y-1.5">
                {w.pending.map((t) => (
                  <li key={t.id} className="rounded-lg border border-gold-light/50 bg-accent-soft px-3 py-2">
                    <p className="font-medium">{t.title}</p>
                    {t.dueAt && <p className="text-xs text-muted">{labels.panel.due} {due(t.dueAt)}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted">{labels.panel.pendingNone}</p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{labels.panel.errors}</h3>
            <p className="mt-1 text-muted">{w.counts7d.error > 0 ? `${w.counts7d.error} · ${labels.jobStatus.error}` : labels.panel.errorsNone}</p>
          </section>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line p-4">
          {w.href && (
            w.external ? (
              <a href={w.href} target="_blank" rel="noreferrer" className="rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white hover:bg-indigo">{labels.panel.open}</a>
            ) : (
              <Link href={w.href} className="rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white hover:bg-indigo">{labels.panel.open}</Link>
            )
          )}
          {w.pending.length > 0 && (
            <Link href="/tasks" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-blue hover:text-blue">{labels.panel.openTasks}</Link>
          )}
          <Link href="/ai" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-blue hover:text-blue">{labels.panel.openWorkforce}</Link>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-right font-medium">
        {value}
        {note && <span className="block text-xs font-normal text-muted">{note}</span>}
      </span>
    </div>
  );
}
