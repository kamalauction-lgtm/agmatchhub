import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { HelpIndex } from "@/components/help/help-views";
import { ADMIN_TOPICS } from "@/lib/help/content-admin";
import { indexLabels } from "@/lib/help/labels";
import { helpLang } from "@/lib/help/types";

/** Admin playbook: picture walkthroughs, English and Bahasa Indonesia. */
export default async function AdminHelpPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  await requireUser();
  const locale = await getLocale();
  const { lang } = await searchParams;
  return <HelpIndex topics={ADMIN_TOPICS} lang={helpLang(locale, lang)} base="/admin/help" labels={await indexLabels("admin")} />;
}
