import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { HelpArticle } from "@/components/help/help-views";
import { AGENT_TOPICS } from "@/lib/help/content-agent";
import { helpLang } from "@/lib/help/types";

export default async function AgentHelpTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const topic = AGENT_TOPICS.find((x) => x.slug === slug);
  if (!topic) notFound();
  const locale = await getLocale();
  const t = await getTranslations("help");
  return (
    <AgentShell>
      <HelpArticle topic={topic} lang={helpLang(locale)} base="/help" labels={{ back: t("back"), updated: t("updated"), open: t("open") }} />
    </AgentShell>
  );
}
