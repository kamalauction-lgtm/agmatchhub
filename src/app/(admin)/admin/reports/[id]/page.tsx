import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";
import { updateReport } from "../actions";

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-crimson";

const STATUSES = ["under_review", "additional_evidence_required", "user_contacted",
  "account_restricted", "resolved", "rejected", "escalated", "archived"] as const;

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("adminReports");
  const tr = await getTranslations("collab.report");

  const [{ data: r }, { data: adminRow }] = await Promise.all([
    supabase
      .from("violation_reports")
      .select("*, reporter:profiles!violation_reports_reporter_id_fkey(display_name), reported:profiles!violation_reports_reported_user_id_fkey(display_name), property_submissions(human_readable_id, title)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("violation_report_admin").select("internal_notes").eq("report_id", id).maybeSingle(),
  ]);
  if (!r) notFound();

  const name = (p: unknown) => {
    const v = Array.isArray(p) ? p[0] : p;
    return (v as { display_name?: string } | null)?.display_name ?? "—";
  };
  const sub = Array.isArray(r.property_submissions) ? r.property_submissions[0] : r.property_submissions;

  return (
    <div>
      <Link href="/admin/reports" className="text-sm text-muted hover:text-foreground">
        ← {t("title")}
      </Link>
      <div className="mt-2 mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{tr(`categories.${r.category}`)}</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium">
          {tr(`status.${r.status}`)}
        </span>
      </div>
      <p className="mb-6 font-mono text-xs text-muted">{r.human_readable_id}</p>

      {saved && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("savedNotice")}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-crimson-soft px-4 py-3 text-sm text-crimson">
          {t("saveFailed")}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-line p-6 text-sm">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted uppercase">{t("cols.reporter")}</dt>
                <dd className="font-medium">{name(r.reporter)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted uppercase">{t("cols.reported")}</dt>
                <dd className="font-medium">{name(r.reported)}</dd>
              </div>
              {sub && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted uppercase">{t("submission")}</dt>
                  <dd className="font-medium">{sub.human_readable_id} — {sub.title}</dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted uppercase">{t("description")}</dt>
                <dd className="whitespace-pre-line">{r.description}</dd>
              </div>
              {r.resolution && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted uppercase">{t("resolution")}</dt>
                  <dd className="whitespace-pre-line">{r.resolution}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <aside className="h-fit rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 font-semibold">{t("decisionTitle")}</h2>
          <form action={updateReport} className="space-y-4 text-sm">
            <input type="hidden" name="reportId" value={id} />
            <label className="block">
              <span className="mb-1 block font-medium">{t("newStatus")}</span>
              <select name="status" defaultValue={r.status === "submitted" ? "under_review" : r.status} className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{tr(`status.${s}`)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">{t("resolutionLabel")}</span>
              <textarea name="resolution" rows={3} defaultValue={r.resolution ?? ""} className={inputCls}
                placeholder={t("resolutionHint")} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">{t("internalNotes")}</span>
              <textarea name="internalNotes" rows={3} defaultValue={adminRow?.internal_notes ?? ""} className={inputCls} />
            </label>
            <button type="submit" className="w-full rounded-lg bg-crimson px-4 py-2.5 font-semibold text-white hover:bg-crimson-strong">
              {t("save")}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
