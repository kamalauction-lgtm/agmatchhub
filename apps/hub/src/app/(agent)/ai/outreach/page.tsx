import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";
import { OutreachTool } from "@/components/ai/outreach-tool";
import { AI_REASON_KEYS } from "@/components/ai/ai-status";
import { runOutreach } from "../actions";

/** Owner Outreach Drafter — the first message to a prospective owner. Nothing typed here is stored. */
export default async function OutreachPage() {
  const user = await requireUser();
  const t = await getTranslations("aiTools.outreach");
  const tr = await getTranslations("aiTools");
  const k = ["property", "propertyHint", "source", "sourceHint", "offer", "offerHint", "ownerName", "channel", "whatsapp", "email", "run", "working", "message", "subject", "followUp", "tips", "copy", "copied", "openWhatsapp", "phone", "phoneHint", "notStored"] as const;
  return (
    <AgentShell wide>
      <ToolHeader roleKey="owner_outreach" title={t("title")} intro={t("intro")} userId={user.id} />
      <OutreachTool
        action={runOutreach}
        labels={{
          sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"),
          reasons: Object.fromEntries(AI_REASON_KEYS.map((x) => [x, tr(`reason.${x}`)])),
          ...(Object.fromEntries(k.map((x) => [x, t(x)])) as Record<(typeof k)[number], string>),
        }}
      />
    </AgentShell>
  );
}
