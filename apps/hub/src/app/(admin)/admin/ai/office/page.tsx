import { getLocale, getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { OfficeScene } from "@/components/ai/office-scene";
import { loadPlatformOffice } from "@/lib/ai/office";
import { buildOfficeLabels } from "@/lib/ai/office-labels";
import { refreshPlatformOffice } from "./actions";

/**
 * AI Workforce Office, platform view (screen 12: "the Office view in admin").
 * The agent-side Office components, drawn from the last seven days of job
 * metadata across all agents — no prompts, outputs or agent identities — so
 * the AI team can see which roles are working, waiting, failing or not
 * configured. Read-only; ai.manage only. Works without an AI provider: roles
 * that need one show as unavailable, rule-based roles as working.
 */
export const dynamic = "force-dynamic";

export default async function AdminAiOfficePage() {
  await requireCapability("ai.manage");
  const data = await loadPlatformOffice();
  if (!data) return null;
  const locale = await getLocale();
  const t = await getTranslations("adminAiOffice");
  const labels = await buildOfficeLabels(data);
  const demoAllowed = process.env.NEXT_PUBLIC_ENVIRONMENT === "staging" || process.env.NODE_ENV !== "production";
  return (
    <div data-admin-office="1">
      <OfficeScene
        initial={data}
        labels={labels}
        locale={locale}
        demoAllowed={demoAllowed}
        refreshAction={refreshPlatformOffice}
        header={{ eyebrow: t("eyebrow"), title: t("title"), subtitle: t("subtitle"), badge: t("badge"), back: t("back"), backHref: "/admin/ai" }}
      />
    </div>
  );
}
