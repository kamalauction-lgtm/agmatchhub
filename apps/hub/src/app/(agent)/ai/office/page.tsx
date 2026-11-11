import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { OfficeScene } from "@/components/ai/office-scene";
import { loadOffice } from "@/lib/ai/office";
import { buildOfficeLabels } from "@/lib/ai/office-labels";

/**
 * AI Live Office — "Watch your AI team working".
 *
 * A visual mission-control view of the AI Workforce: twelve department rooms,
 * one character per role, each drawn in the state `buildOffice()` derived from
 * the agent's own job and task rows. The page only loads data and translates
 * labels; it decides nothing about what a character is doing.
 */
export const dynamic = "force-dynamic";


export default async function AiOfficePage() {
  const data = await loadOffice();
  if (!data) redirect("/login");
  const locale = await getLocale();
  const t = await getTranslations("aiOffice");

  const labels = await buildOfficeLabels(data);


  // DEMO mode is a labelled client-side simulation, offered on staging and
  // local builds only; production never shows the toggle.
  const demoAllowed = process.env.NEXT_PUBLIC_ENVIRONMENT === "staging" || process.env.NODE_ENV !== "production";

  return (
    <AgentShell wide="full">
      <OfficeScene
        initial={data}
        labels={labels}
        locale={locale}
        demoAllowed={demoAllowed}
        header={{ eyebrow: t("eyebrow"), title: t("title"), subtitle: t("subtitle"), badge: t("ruleBasedBadge"), back: t("back") }}
      />
    </AgentShell>
  );
}
