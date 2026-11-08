import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";
import { WeekPlanner } from "@/components/studio/week-planner";
import { AI_REASON_KEYS } from "@/components/ai/ai-status";
import { weekStart } from "@/lib/ai/weekly-review";
import { ANGLES } from "@/lib/ai/social-plan-rules";
import { planWeekAction, scheduleWeek } from "./actions";

/** Social Calendar Planner — a week of posts across the agent's listings, scheduled through the Studio's queue. */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const t = await getTranslations("aiTools.plan");
  const tr = await getTranslations("aiTools");
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("social_accounts").select("platform").eq("status", "active");
  const has = { facebook: (accounts ?? []).some((a) => a.platform === "facebook_page"), instagram: (accounts ?? []).some((a) => a.platform === "instagram_business") };
  // Default to next Monday so nothing lands in the past.
  const thisMonday = new Date(`${weekStart()}T00:00:00Z`); thisMonday.setUTCDate(thisMonday.getUTCDate() + 7);
  const k = ["weekStart", "plan", "working", "empty", "noAccounts", "connect", "keep", "time", "scheduleAll", "scheduledHint", "copy", "copied", "igNeedsImage"] as const;

  return (
    <AgentShell wide>
      <ToolHeader roleKey="social_planner" title={t("title")} intro={t("intro")} userId={user.id} />
      {error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{t(`errors.${error}` as never)}</p>}
      <WeekPlanner
        planAction={planWeekAction}
        scheduleAction={scheduleWeek}
        hasAccounts={has}
        defaultWeekStart={thisMonday.toISOString().slice(0, 10)}
        labels={{
          sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"),
          reasons: Object.fromEntries(AI_REASON_KEYS.map((x) => [x, tr(`reason.${x}`)])),
          angle: Object.fromEntries(ANGLES.map((a) => [a, t(`angles.${a}`)])),
          weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => t(`weekdays.${d}` as never)),
          ...(Object.fromEntries(k.map((x) => [x, x === "scheduleAll" ? (t.raw("scheduleAll") as string) : t(x)])) as Record<(typeof k)[number], string>),
        }}
      />
    </AgentShell>
  );
}
