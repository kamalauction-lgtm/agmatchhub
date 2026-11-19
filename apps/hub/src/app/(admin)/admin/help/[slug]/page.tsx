import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { HelpArticle } from "@/components/help/help-views";
import { ADMIN_TOPICS } from "@/lib/help/content-admin";
import { helpLang } from "@/lib/help/types";

export default async function AdminHelpTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const topic = ADMIN_TOPICS.find((x) => x.slug === slug);
  if (!topic) notFound();
  const locale = await getLocale();
  const t = await getTranslations("help");
  return <HelpArticle topic={topic} lang={helpLang(locale)} base="/admin/help" labels={{ back: t("back"), updated: t("updated"), open: t("open") }} />;
}
