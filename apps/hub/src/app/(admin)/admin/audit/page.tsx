import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { AUDIT_RESULTS, AUDIT_ROLES, auditQueryString, parseAuditFilter } from "@/lib/admin/audit-filter";
import { auditQuery } from "@/lib/admin/audit-query";

/**
 * Read-only audit trail viewer (§52). Append-only at the database.
 * Screen 13: gated by audit.view (00123: global grants only, enforced by RLS
 * too), with filters and a CSV export of exactly the filtered rows.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireCapability("audit.view");
  const f = parseAuditFilter(await searchParams);
  const supabase = await createClient();
  const t = await getTranslations("adminAudit");
  const { data: rows } = await auditQuery(supabase, f, 200);
  const qs = auditQueryString(f);
  const filtered = qs.length > 0;

  const name = (p: unknown) => {
    const v = Array.isArray(p) ? p[0] : p;
    return (v as { display_name?: string } | null)?.display_name ?? "—";
  };
  const field = "rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-crimson";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <a href={`/admin/audit/export${qs ? `?${qs}` : ""}`} className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-crimson hover:text-crimson" data-audit-export="1">
          {t("export")}
        </a>
      </div>

      <form action="/admin/audit" className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-audit-filter="1">
        <input name="q" defaultValue={f.q} placeholder={t("searchHint")} aria-label={t("filters.action")} className={field} />
        <input name="entity" defaultValue={f.entity} placeholder={t("filters.entity")} aria-label={t("filters.entity")} className={field} />
        <select name="role" defaultValue={f.role} aria-label={t("filters.role")} className={field}>
          <option value="">{t("filters.anyRole")}</option>
          {AUDIT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select name="result" defaultValue={f.result} aria-label={t("filters.result")} className={field}>
          <option value="">{t("filters.anyResult")}</option>
          {AUDIT_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input type="date" name="from" defaultValue={f.from} aria-label={t("filters.from")} className={field} />
        <input type="date" name="to" defaultValue={f.to} aria-label={t("filters.to")} className={field} />
        <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
          <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-crimson hover:text-crimson">{t("search")}</button>
          {filtered && <Link href="/admin/audit" className="self-center text-sm text-crimson">{t("clear")}</Link>}
        </div>
      </form>

      <p className="mb-3 text-xs text-muted" data-audit-rows={(rows ?? []).length}>{t("showing", { n: (rows ?? []).length })}</p>

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
              <tr key={r.id} className="border-t border-line" data-audit-row={r.action}>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted">
                  {new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="px-4 py-2.5">{name(r.profiles)}<span className="block text-xs text-muted">{r.actor_role ?? ""}</span></td>
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
