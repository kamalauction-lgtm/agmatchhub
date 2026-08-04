import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";

const FILTERS = ["pending_admin_approval", "resubmitted", "amendment_required", "link_active", "all"] as const;

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status = "pending_admin_approval" } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("adminRequests");
  const tr = await getTranslations("requests");

  let query = supabase
    .from("property_requests")
    .select("id, human_readable_id, title, city, country_code, transaction_type, priority, status, created_at, profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data: rows } = await query;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/requests?status=${f}`}
            className={`rounded-full border px-3 py-1 ${
              f === status
                ? "border-crimson bg-crimson-soft font-semibold text-crimson"
                : "border-line text-muted hover:text-foreground"
            }`}
          >
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
                <th className="px-4 py-3">{t("cols.title")}</th>
                <th className="px-4 py-3">{t("cols.agent")}</th>
                <th className="px-4 py-3">{t("cols.location")}</th>
                <th className="px-4 py-3">{t("cols.status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ra = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-3 font-mono text-xs">{r.human_readable_id}</td>
                    <td className="px-4 py-3 font-medium">{r.title}</td>
                    <td className="px-4 py-3">{ra?.display_name ?? "—"}</td>
                    <td className="px-4 py-3">{r.city}, {r.country_code}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-surface px-2 py-1 text-xs font-medium">
                        {tr(`status.${r.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/requests/${r.id}`} className="font-medium text-crimson hover:underline">
                        {t("review")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
