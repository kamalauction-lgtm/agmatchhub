import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";

const FILTERS = ["submitted", "under_review", "resolved", "all"] as const;

export default async function ReportsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status = "submitted" } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("adminReports");
  const tr = await getTranslations("collab.report");

  let query = supabase
    .from("violation_reports")
    .select("id, human_readable_id, category, status, priority, created_at, reporter:profiles!violation_reports_reporter_id_fkey(display_name), reported:profiles!violation_reports_reported_user_id_fkey(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data: rows } = await query;

  const name = (p: unknown) => {
    const v = Array.isArray(p) ? p[0] : p;
    return (v as { display_name?: string } | null)?.display_name ?? "—";
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin/reports?status=${f}`}
            className={`rounded-full border px-3 py-1 ${
              f === status
                ? "border-crimson bg-crimson-soft font-semibold text-crimson"
                : "border-line text-muted hover:text-foreground"
            }`}>
            {f === "all" ? t("filterAll") : tr(`status.${f}`)}
          </Link>
        ))}
      </div>

      {!rows?.length ? (
        <p className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">{t("cols.category")}</th>
                <th className="px-4 py-3">{t("cols.reporter")}</th>
                <th className="px-4 py-3">{t("cols.reported")}</th>
                <th className="px-4 py-3">{t("cols.status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs">{r.human_readable_id}</td>
                  <td className="px-4 py-3">{tr(`categories.${r.category}`)}</td>
                  <td className="px-4 py-3">{name(r.reporter)}</td>
                  <td className="px-4 py-3">{name(r.reported)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface px-2 py-1 text-xs font-medium">
                      {tr(`status.${r.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/reports/${r.id}`} className="font-medium text-crimson hover:underline">
                      {t("review")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
