import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { RequestForm } from "@/components/requests/request-form";

export default async function EditRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requireUser();
  const supabase = await createClient();
  const [{ data: request }, { data: priv }] = await Promise.all([
    supabase.from("property_requests").select("*").eq("id", id).maybeSingle(),
    supabase.from("property_request_private").select("internal_notes").eq("request_id", id).maybeSingle(),
  ]);
  if (!request) notFound();
  Object.assign(request, { internal_notes: priv?.internal_notes ?? null });
  if (!["draft", "amendment_required"].includes(request.status)) redirect(`/requests/${id}`);

  const t = await getTranslations("requests");

  return (
    <AgentShell>
      <h1 className="mb-2 text-2xl font-semibold">{t("editTitle")}</h1>
      <p className="mb-6 font-mono text-xs text-muted">{request.human_readable_id}</p>
      {request.status === "amendment_required" && request.amendment_reason && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-semibold">{t("amendmentRequired")}: </span>
          {request.amendment_reason}
        </div>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t(`errors.${["invalid_fields", "budget_range", "save_failed"].includes(error) ? error : "save_failed"}`)}
        </p>
      )}
      <RequestForm existing={request} />
    </AgentShell>
  );
}
