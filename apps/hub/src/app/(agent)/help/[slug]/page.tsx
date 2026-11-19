import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { HelpArticle } from "@/components/help/help-views";
import { AGENT_TOPICS } from "@/lib/help/content-agent";
import { articleLabels, stepParam } from "@/lib/help/labels";
import { helpLang } from "@/lib/help/types";

export default async function AgentHelpTopicPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string; step?: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const topic = AGENT_TOPICS.find((x) => x.slug === slug);
  if (!topic) notFound();
  const locale = await getLocale();
  const { lang, step } = await searchParams;
  return (
    <AgentShell>
      <HelpArticle topic={topic} lang={helpLang(locale, lang)} base="/help" initialStep={stepParam(step)} labels={await articleLabels()} />
    </AgentShell>
  );
}
