import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { HelpIndex } from "@/components/help/help-views";
import { AGENT_TOPICS } from "@/lib/help/content-agent";
import { indexLabels } from "@/lib/help/labels";
import { helpLang } from "@/lib/help/types";

/** Agent playbook: picture walkthroughs, English and Bahasa Indonesia. */
export default async function AgentHelpPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  await requireUser();
  const locale = await getLocale();
  const { lang } = await searchParams;
  return (
    <AgentShell>
      <HelpIndex topics={AGENT_TOPICS} lang={helpLang(locale, lang)} base="/help" labels={await indexLabels("agent")} />
    </AgentShell>
  );
}
