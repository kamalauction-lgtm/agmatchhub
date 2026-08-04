import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";

const FILTERS = ["under_review", "additional_information_required", "verified", "rejected", "all"] as const;

export default async function AgentQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status = "under_review" } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("admin");
  const td = await getTranslations("dashboard");

  let query = supabase
    .from("profiles")
    .select("id, display_name, agent_status, created_at, agent_profiles(agency_name, licence_number, country_code, submitted_at)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("agent_status", status);
  const { data: rows } = await query;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("agentsTitle")}</h1>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/agents?status=${f}`}
            className={`rounded-full border px-3 py-1 ${
              f === status
                ? "border-crimson bg-crimson-soft font-semibold text-crimson"
                : "border-line text-muted hover:text-foreground"
            }`}
          >
            {f === "all" ? t("filterAll") : td(`status.${f}`)}
          </Link>
        ))}
      </div>

      {!rows?.length ? (
        <p className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">
          {t("emptyQueue")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-3">{t("cols.agent")}</th>
                <th className="px-4 py-3">{t("cols.agency")}</th>
                <th className="px-4 py-3">{t("cols.licence")}</th>
                <th className="px-4 py-3">{t("cols.country")}</th>
                <th className="px-4 py-3">{t("cols.status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ap = Array.isArray(r.agent_profiles) ? r.agent_profiles[0] : r.agent_profiles;
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{r.display_name}</td>
                    <td className="px-4 py-3">{ap?.agency_name ?? "—"}</td>
                    <td className="px-4 py-3">{ap?.licence_number ?? "—"}</td>
                    <td className="px-4 py-3">{ap?.country_code ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-surface px-2 py-1 text-xs font-medium">
                        {td(`status.${r.agent_status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/agents/${r.id}`} className="font-medium text-crimson hover:underline">
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
