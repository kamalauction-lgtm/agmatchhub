import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { CollabPanels } from "@/components/collab/collab-panels";

/** Supply Agent's view of one submission: status + collaboration (§24–27). */
export default async function SASubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sid: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { sid } = await params;
  const { error } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("submissions");
  const ts = await getTranslations("submissionStatus");
  const tc = await getTranslations("collab");

  const { data: s } = await supabase
    .from("property_submissions")
    .select("*, property_requests(human_readable_id, title, transaction_type)")
    .eq("id", sid)
    .maybeSingle();
  if (!s || s.supply_agent_id !== user.id) notFound();
  const req = Array.isArray(s.property_requests) ? s.property_requests[0] : s.property_requests;
  const offerType = req?.transaction_type === "rent" ? "rental" : "purchase";
  const price = s.asking_price ?? s.monthly_rental;

  return (
    <AgentShell wide>
      <Link href="/submissions" className="text-sm text-muted hover:text-foreground">
        ← {t("title")}
      </Link>
      <div className="mt-2 mb-1 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{s.title}</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium whitespace-nowrap">
          {ts(s.status)}
        </span>
      </div>
      <p className="mb-6 font-mono text-xs text-muted">
        {s.human_readable_id} · {t("forRequest")} {req?.human_readable_id} — {req?.title}
      </p>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {tc(`errors.${error === "counter_amount_required" ? "counter_amount_required" : "collab_failed"}`)}
        </p>
      )}

      <div className="mb-8 rounded-xl border border-line bg-surface p-5 text-sm">
        <span className="font-semibold">
          {price != null ? `${s.currency} ${Number(price).toLocaleString()}` : "—"}
        </span>
        <span className="ml-3 text-muted">{[s.district, s.city].filter(Boolean).join(", ")}</span>
      </div>

      <CollabPanels submissionId={sid} role="sa" currency={s.currency} offerType={offerType} />
    </AgentShell>
  );
}
