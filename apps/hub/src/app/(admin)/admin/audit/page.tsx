import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";

/** Read-only audit trail viewer (§52). Append-only at the database. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("adminAudit");

  let query = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, reason, result, created_at, profiles:actor_id(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.ilike("action", `%${q}%`);
  const { data: rows } = await query;

  const name = (p: unknown) => {
    const v = Array.isArray(p) ? p[0] : p;
    return (v as { display_name?: string } | null)?.display_name ?? "—";
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <form className="flex gap-2" action="/admin/audit">
          <input name="q" defaultValue={q ?? ""} placeholder={t("searchHint")}
            className="rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson" />
          <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-crimson hover:text-crimson">
            {t("search")}
          </button>
        </form>
      </div>
      {q && (
        <p className="mb-4 text-sm text-muted">
          {t("filtered", { q })} — <Link href="/admin/audit" className="text-crimson">{t("clear")}</Link>
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs text-muted uppercase">
            <tr>
              <th className="px-4 py-3">{t("cols.time")}</th>
              <th className="px-4 py-3">{t("cols.actor")}</th>
              <th className="px-4 py-3">{t("cols.action")}</th>
              <th className="px-4 py-3">{t("cols.entity")}</th>
              <th className="px-4 py-3">{t("cols.result")}</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2.5">{name(r.profiles)}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-2.5 text-xs">
                  {r.entity_type}
                  {r.entity_id && <span className="text-muted"> · {r.entity_id.slice(0, 18)}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.result === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  }`}>
                    {r.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">{t("appendOnlyNote")}</p>
    </div>
  );
}
