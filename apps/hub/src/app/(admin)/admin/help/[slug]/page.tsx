import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { HelpArticle } from "@/components/help/help-views";
import { ADMIN_TOPICS } from "@/lib/help/content-admin";
import { articleLabels, stepParam } from "@/lib/help/labels";
import { helpLang } from "@/lib/help/types";

export default async function AdminHelpTopicPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string; step?: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const topic = ADMIN_TOPICS.find((x) => x.slug === slug);
  if (!topic) notFound();
  const locale = await getLocale();
  const { lang, step } = await searchParams;
  return <HelpArticle topic={topic} lang={helpLang(locale, lang)} base="/admin/help" initialStep={stepParam(step)} labels={await articleLabels()} />;
}
