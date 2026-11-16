import "server-only";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import type { OfficeLabels } from "@/components/ai/office-scene";
import type { OfficeData, WorkerState } from "./office-state";

/**
 * The Live Office labels, shared by the agent page (/ai/office) and the admin
 * platform view (/admin/ai/office) so both read the same words.
 */
const STATES: WorkerState[] = ["finished", "active", "attention", "idle", "error", "planned", "offline"];
const REASONS = ["quota", "daily_cap", "platform_cap", "circuit_open", "disabled", "feature_off", "unverified", "no_provider", "failed"];

export async function buildOfficeLabels(data: OfficeData): Promise<OfficeLabels> {
  const t = await getTranslations("aiOffice");
  const tw = await getTranslations("aiWorkforce");
  const tr = await getTranslations("leads.secretary");
  const labels: OfficeLabels = {
    departments: Object.fromEntries(data.departments.map((d) => [d.key, tw(`category.${d.key}` as never)])),
    state: Object.fromEntries(STATES.map((s) => [s, t(`state.${s}`)])) as OfficeLabels["state"],
    stateHint: Object.fromEntries(STATES.map((s) => [s, t(`stateHint.${s}`)])) as OfficeLabels["stateHint"],
    engine: { ai: t("engine.ai"), rules: t("engine.rules"), rules_by_design: t("engine.rules_by_design") },
    engineShort: { ai: t("engineShort.ai"), rules: t("engineShort.rules"), rules_by_design: t("engineShort.rules_by_design") },
    access: {
      open: t("access.open"), unavailable: t("access.unavailable"), planned: t("access.planned"),
      hero: t("access.hero"), hero_open: t("access.hero_open"),
    },
    jobStatus: { ok: t("jobStatus.ok"), degraded: t("jobStatus.degraded"), error: t("jobStatus.error"), denied: t("jobStatus.denied") },
    reason: Object.fromEntries(REASONS.map((r) => [r, tr(`reason.${r}` as never)])),
    kpi: {
      specialists: t("kpi.specialists"), activeNow: t("kpi.activeNow"), waiting: t("kpi.waiting"),
      completedToday: t("kpi.completedToday"), departments: t("kpi.departments"),
    },
    view: { scene3d: t("view.scene3d"), office: t("view.office"), list: t("view.list"), label: t("view.label") },
    scene3d: { loading: t("scene3d.loading"), unavailable: t("scene3d.unavailable"), controls: t("scene3d.controls"), prototypes: t("scene3d.prototypes"), ambient: t("scene3d.ambient") },
    brand: brand.appShortName,
    node: { tasksToday: t("node.tasksToday"), queue: t("node.queue"), justRan: t("node.justRan") },
    hq: t("hq"),
    canvas: { zoomIn: t("canvas.zoomIn"), zoomOut: t("canvas.zoomOut"), reset: t("canvas.reset") },
    feed: { title: t("feed.title"), live: t("feed.live"), empty: t("feed.empty"), demoLine: t("feed.demoLine") },
    queue: { title: t("queue.title"), empty: t("queue.empty"), demoLine: t("queue.demoLine") },
    deptStatus: { title: t("deptStatus.title") },
    legend: t("legend"),
    refresh: t("refresh"),
    refreshing: t("refreshing"),
    updated: t("updated"),
    demoToggle: t("demoToggle"),
    demoBanner: t("demoBanner"),
    demoBadge: t("demoBadge"),
    truth: t("truth"),
    offline: t("offlineNotice"),
    mobileHint: t("mobileHint"),
    panel: {
      availability: t("panel.availability"), engine: t("panel.engine"), sharedEngine: t("panel.sharedEngine"),
      current: t("panel.current"), currentNone: t("panel.currentNone"), currentPending: t("panel.currentPending"),
      last: t("panel.last"), never: t("panel.never"), recent: t("panel.recent"), recentNone: t("panel.recentNone"),
      tasksToday: t("panel.tasksToday"), needs: t("panel.needs"), needsNone: t("panel.needsNone"), needsPending: t("panel.needsPending"),
      outputs: t("panel.outputs"), pending: t("panel.pending"), pendingNone: t("panel.pendingNone"),
      errors: t("panel.errors"), errorsNone: t("panel.errorsNone"), open: t("panel.open"), openTasks: t("panel.openTasks"),
      openWorkforce: t("panel.openWorkforce"), close: t("panel.close"), due: t("panel.due"),
      department: t("panel.department"), members: t("panel.members"),
    },
  };  return labels;
}
