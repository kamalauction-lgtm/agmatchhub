import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { HelpIndex } from "@/components/help/help-views";
import { AGENT_TOPICS } from "@/lib/help/content-agent";
import { helpLang } from "@/lib/help/types";

/** Agent playbook: step-by-step guides, English and Bahasa Indonesia. */
export default async function AgentHelpPage() {
  await requireUser();
  const locale = await getLocale();
  const t = await getTranslations("help");
  return (
    <AgentShell>
      <HelpIndex
        topics={AGENT_TOPICS}
        lang={helpLang(locale)}
        base="/help"
        labels={{ title: t("agentTitle"), intro: t("agentIntro"), updated: t("updated"), langNote: locale === "ms" ? t("langNote") : null }}
      />
    </AgentShell>
  );
}
