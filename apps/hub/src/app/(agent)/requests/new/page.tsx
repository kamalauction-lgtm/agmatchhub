import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { RequestForm } from "@/components/requests/request-form";
import { ChatToRequirement } from "@/components/requests/chat-to-requirement";
import { extractRequirementAction } from "@/app/(agent)/ai/actions";
import { getCompanions } from "@/lib/ai/cast";
import { AI_REASON_KEYS } from "@/components/ai/ai-status";
import { agentHasAccess } from "@/lib/agents/access";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; fields?: string }>;
}) {
  const { error, fields } = await searchParams;
  await requireUser();
  const supabase = await createClient();
  if (!(await agentHasAccess(supabase))) redirect("/requests");

  const t = await getTranslations("requests");
  const tb = await getTranslations("aiTools.profiler");
  const tr = await getTranslations("aiTools");
  const cast = await getCompanions(["buyer_profiler"]);

  return (
    <AgentShell>
      <h1 className="mb-6 text-2xl font-semibold">{t("newTitle")}</h1>
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${["invalid_fields", "budget_range", "save_failed"].includes(error) ? error : "save_failed"}`)}
          {fields && <span className="mt-1 block text-xs">{t("checkFields")}: {fields}</span>}
          <span className="mt-1 block text-xs">{t("dataKeptNote")}</span>
        </p>
      )}
      <ChatToRequirement
        action={extractRequirementAction}
        companion={cast.buyer_profiler}
        labels={{
          sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"),
          reasons: Object.fromEntries(AI_REASON_KEYS.map((k) => [k, tr(`reason.${k}`)])),
          title: tb("title"), hint: tb("hint"), placeholder: tb("placeholder"), run: tb("run"), working: tb("working"),
          filled: tb.raw("filled") as string, missing: tb("missing"), privacy: tb("privacy"),
        }}
      />
      <RequestForm />
    </AgentShell>
  );
}
