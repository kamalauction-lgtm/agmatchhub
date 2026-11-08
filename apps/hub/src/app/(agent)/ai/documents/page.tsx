import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";
import { DocumentTool } from "@/components/ai/document-tool";
import { AI_REASON_KEYS } from "@/components/ai/ai-status";

/** Document Summariser (premium feature) — upload or paste, read the summary, verify anything legal or financial. */
export default async function DocumentsPage() {
  const user = await requireUser();
  const t = await getTranslations("aiTools.documents");
  const tr = await getTranslations("aiTools");
  const k = ["upload", "uploadHint", "orPaste", "pasteHint", "run", "working", "kind", "summary", "parties", "dates", "amounts", "obligations", "verify", "unreadable", "copy", "copied", "transient", "disclaimer"] as const;
  return (
    <AgentShell wide>
      <ToolHeader roleKey="document_summariser" title={t("title")} intro={t("intro")} userId={user.id} />
      <DocumentTool
        labels={{
          sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"),
          reasons: Object.fromEntries(AI_REASON_KEYS.map((x) => [x, tr(`reason.${x}`)])),
          errors: { unsupported: t("errors.unsupported"), too_large: t("errors.too_large"), empty: t("errors.empty"), failed: tr("reason.failed") },
          ...(Object.fromEntries(k.map((x) => [x, t(x)])) as Record<(typeof k)[number], string>),
        }}
      />
    </AgentShell>
  );
}
