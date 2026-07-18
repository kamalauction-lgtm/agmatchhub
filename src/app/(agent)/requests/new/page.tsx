import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { RequestForm } from "@/components/requests/request-form";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles").select("agent_status").eq("id", user.id).single();
  if (profile?.agent_status !== "verified") redirect("/requests");

  const t = await getTranslations("requests");

  return (
    <AgentShell>
      <h1 className="mb-6 text-2xl font-semibold">{t("newTitle")}</h1>
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${["invalid_fields", "budget_range", "save_failed"].includes(error) ? error : "save_failed"}`)}
        </p>
      )}
      <RequestForm />
    </AgentShell>
  );
}
