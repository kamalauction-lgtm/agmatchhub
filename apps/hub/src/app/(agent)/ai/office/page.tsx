import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { CommandHeader } from "@/components/ui/command-header";
import { Badge } from "@/components/ui/badge";
import { OfficeScene, type OfficeLabels } from "@/components/ai/office-scene";
import { loadOffice } from "@/lib/ai/office";
import type { WorkerState } from "@/lib/ai/office-state";

/**
 * AI Live Office — "watch your AI team working".
 *
 * A visual mission-control view of the AI Workforce: twelve departments, one
 * character per role, each drawn in the state `buildOffice()` derived from
 * the agent's own job and task rows. The page only loads data and translates
 * labels; it decides nothing about what a character is doing.
 */
export const dynamic = "force-dynamic";

const STATES: WorkerState[] = ["active", "finished", "attention", "idle", "error", "planned", "offline"];
const REASONS = ["quota", "daily_cap", "platform_cap", "circuit_open", "disabled", "feature_off", "unverified", "no_provider", "failed"];

export default async function AiOfficePage() {
  const data = await loadOffice();
  if (!data) redirect("/login");
  const locale = await getLocale();
  const t = await getTranslations("aiOffice");
  const tw = await getTranslations("aiWorkforce");
  const tr = await getTranslations("leads.secretary");

  const labels: OfficeLabels = {
    departments: Object.fromEntries(data.departments.map((d) => [d.key, tw(`category.${d.key}` as never)])),
    state: Object.fromEntries(STATES.map((s) => [s, t(`state.${s}`)])) as OfficeLabels["state"],
    stateHint: Object.fromEntries(STATES.map((s) => [s, t(`stateHint.${s}`)])) as OfficeLabels["stateHint"],
    engine: { ai: t("engine.ai"), rules: t("engine.rules"), rules_by_design: t("engine.rules_by_design") },
    access: {
      open: t("access.open"), unavailable: t("access.unavailable"), planned: t("access.planned"),
      hero: t("access.hero"), hero_open: t("access.hero_open"),
    },
    jobStatus: { ok: t("jobStatus.ok"), degraded: t("jobStatus.degraded"), error: t("jobStatus.error"), denied: t("jobStatus.denied") },
    reason: Object.fromEntries(REASONS.map((r) => [r, tr(`reason.${r}` as never)])),
    legend: t("legend"),
    lounge: t("lounge"),
    refresh: t("refresh"),
    refreshing: t("refreshing"),
    updated: t("updated"),
    demoToggle: t("demoToggle"),
    demoOn: t("demoOn"),
    demoBanner: t("demoBanner"),
    demoBadge: t("demoBadge"),
    truth: t("truth"),
    offline: t("offlineNotice"),
    panel: {
      specialty: t("panel.specialty"), availability: t("panel.availability"), engine: t("panel.engine"),
      sharedEngine: t("panel.sharedEngine"), current: t("panel.current"), currentNone: t("panel.currentNone"),
      currentPending: t("panel.currentPending"), last: t("panel.last"), never: t("panel.never"),
      outputs: t("panel.outputs"), outputsNone: t("panel.outputsNone"), pending: t("panel.pending"),
      pendingNone: t("panel.pendingNone"), errors: t("panel.errors"), errorsNone: t("panel.errorsNone"),
      open: t("panel.open"), openTasks: t("panel.openTasks"), openWorkforce: t("panel.openWorkforce"),
      close: t("panel.close"), due: t("panel.due"),
    },
    mobileHint: t("mobileHint"),
    totals: {
      workers: t("totals.workers"), open: t("totals.open"), ai: t("totals.ai"), rules: t("totals.rules"),
      attention: t("totals.attention"), activeToday: t("totals.activeToday"),
    },
  };

  // DEMO mode is a labelled client-side simulation. It is offered on staging
  // and local builds only; production never shows the toggle.
  const demoAllowed = process.env.NEXT_PUBLIC_ENVIRONMENT === "staging" || process.env.NODE_ENV !== "production";

  return (
    <AgentShell wide>
      <div className="space-y-6">
        <CommandHeader className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--command-gold)" }}>{t("eyebrow")}</p>
            <h1 className="mt-1">{t("title")}</h1>
            <p className="command-muted mt-2 text-sm">{t("intro")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="info">{t("ruleBasedBadge")}</Badge>
            <Link href="/ai" className="command-link text-sm font-semibold hover:underline">{t("back")}</Link>
          </div>
        </CommandHeader>

        <OfficeScene initial={data} labels={labels} locale={locale} demoAllowed={demoAllowed} />
      </div>
    </AgentShell>
  );
}
