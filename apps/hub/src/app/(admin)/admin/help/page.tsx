import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { HelpIndex } from "@/components/help/help-views";
import { ADMIN_TOPICS } from "@/lib/help/content-admin";
import { helpLang } from "@/lib/help/types";

/** Admin playbook: step-by-step guides, English and Bahasa Indonesia. */
export default async function AdminHelpPage() {
  await requireUser();
  const locale = await getLocale();
  const t = await getTranslations("help");
  return (
    <HelpIndex
      topics={ADMIN_TOPICS}
      lang={helpLang(locale)}
      base="/admin/help"
      labels={{ title: t("adminTitle"), intro: t("adminIntro"), updated: t("updated"), langNote: locale === "ms" ? t("langNote") : null }}
    />
  );
}
