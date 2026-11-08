import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";
import { CoachTool } from "@/components/ai/coach-tool";
import { AI_REASON_KEYS } from "@/components/ai/ai-status";
import { SCENARIOS, langOf } from "@/lib/ai/coach-rules";
import { runObjection, runPractice } from "../actions";

/**
 * Objection Coach + Team Coach. Linked AG Hero agents also see the deep link
 * to Hero's Sales Lab / AI Coach (the catalogue's external_url); the in-hub
 * coach is there for everyone.
 */
export default async function CoachPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const user = await requireUser();
  const { mode } = await searchParams;
  const locale = await getLocale();
  const lang = langOf(locale);
  const t = await getTranslations("aiTools.coach");
  const tr = await getTranslations("aiTools");
  const supabase = await createClient();
  const [{ data: link }, { data: roles }] = await Promise.all([
    supabase.from("hero_links").select("status").eq("user_id", user.id).maybeSingle(),
    supabase.from("ai_roles").select("key, external_url").in("key", ["objection_coach", "team_coach"]),
  ]);
  const linked = link?.status === "linked";
  const url = (k: string) => (linked ? ((roles ?? []).find((r) => r.key === k)?.external_url ?? null) : null);
  const k = ["tabObjection", "tabPractice", "objection", "objectionHint", "context", "contextHint", "run", "working", "meaning", "approaches", "sampleReply", "followUp", "copy", "copied", "scenario", "yourReply", "replyHint", "score", "clarity", "empathy", "nextStep", "feedback", "improved", "tryNext", "heroHint", "heroOpen"] as const;

  return (
    <AgentShell wide>
      <ToolHeader roleKey={mode === "objection" ? "objection_coach" : "team_coach"} title={t("title")} intro={t("intro")} userId={user.id} />
      <CoachTool
        mode={mode === "objection" ? "objection" : "practice"}
        scenarios={SCENARIOS.map((s) => ({ key: s.key, client: s.client[lang], context: s.context[lang] }))}
        objectionAction={runObjection}
        practiceAction={runPractice}
        heroUrls={{ objection: url("objection_coach"), practice: url("team_coach") }}
        labels={{
          sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"),
          reasons: Object.fromEntries(AI_REASON_KEYS.map((x) => [x, tr(`reason.${x}`)])),
          examples: [t("examples.price"), t("examples.think"), t("examples.agent"), t("examples.wait")],
          ...(Object.fromEntries(k.map((x) => [x, t(x)])) as Record<(typeof k)[number], string>),
        }}
      />
    </AgentShell>
  );
}
