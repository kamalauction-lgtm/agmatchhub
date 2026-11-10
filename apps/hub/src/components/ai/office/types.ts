import type { WorkerState } from "@/lib/ai/office-state";

/**
 * Everything the Live Office components need that is a WORD rather than a
 * fact. Labels are translated on the server page and passed down, so the
 * client bundle never carries the dictionary (hub convention).
 */
export type OfficeLabels = {
  departments: Record<string, string>;
  state: Record<WorkerState, string>;
  stateHint: Record<WorkerState, string>;
  engine: Record<"ai" | "rules" | "rules_by_design", string>;
  engineShort: Record<"ai" | "rules" | "rules_by_design", string>;
  access: Record<"open" | "unavailable" | "planned" | "hero" | "hero_open", string>;
  jobStatus: Record<"ok" | "degraded" | "error" | "denied", string>;
  reason: Record<string, string>;
  kpi: { specialists: string; activeNow: string; waiting: string; completedToday: string; departments: string };
  view: { scene3d: string; office: string; list: string; label: string };
  scene3d: { loading: string; unavailable: string; controls: string; prototypes: string; ambient: string };
  /** Brand short name for the floor sign — from config, never a literal. */
  brand: string;
  node: { tasksToday: string; queue: string; justRan: string };
  hq: string;
  canvas: { zoomIn: string; zoomOut: string; reset: string };
  feed: { title: string; live: string; empty: string; demoLine: string };
  queue: { title: string; empty: string; demoLine: string };
  deptStatus: { title: string };
  legend: string;
  refresh: string;
  refreshing: string;
  updated: string;
  demoToggle: string;
  demoBanner: string;
  demoBadge: string;
  truth: string;
  offline: string;
  mobileHint: string;
  panel: {
    availability: string;
    engine: string;
    sharedEngine: string;
    current: string;
    currentNone: string;
    currentPending: string;
    last: string;
    never: string;
    recent: string;
    recentNone: string;
    tasksToday: string;
    needs: string;
    needsNone: string;
    needsPending: string;
    outputs: string;
    pending: string;
    pendingNone: string;
    errors: string;
    errorsNone: string;
    open: string;
    openTasks: string;
    openWorkforce: string;
    close: string;
    due: string;
    department: string;
    members: string;
  };
};

/** One colour per state, used for rings, dots, badges and legend — never alone. */
export const STATE_COLOR: Record<WorkerState, string> = {
  planned: "#94a3b8",
  offline: "#94a3b8",
  idle: "#60a5fa",
  active: "#2563eb",
  finished: "#22c55e",
  attention: "#c9a64b",
  error: "#e53935",
};

export function relTime(iso: string | null, locale: string, never: string): string {
  if (!iso) return never;
  const diff = Date.now() - Date.parse(iso);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const min = Math.round(diff / 60000);
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const hrs = Math.round(min / 60);
  if (Math.abs(hrs) < 48) return rtf.format(-hrs, "hour");
  return rtf.format(-Math.round(hrs / 24), "day");
}
