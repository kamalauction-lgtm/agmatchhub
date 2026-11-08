import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";

export default async function MySubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await requireUser();
  const { submitted } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("submissions");
  const ts = await getTranslations("submissionStatus");

  const { data: rows } = await supabase
    .from("property_submissions")
    .select("id, human_readable_id, title, city, status, asking_price, monthly_rental, currency, created_at, property_requests(human_readable_id, title)")
    .eq("supply_agent_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <AgentShell wide>
      <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>

      {submitted && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("submittedNotice", { id: submitted })}
        </p>
      )}

      {!rows?.length ? (
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs text-muted uppercase">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">{t("cols.property")}</th>
                <th className="px-4 py-3">{t("cols.forRequest")}</th>
                <th className="px-4 py-3">{t("cols.price")}</th>
                <th className="px-4 py-3">{t("cols.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const req = Array.isArray(s.property_requests) ? s.property_requests[0] : s.property_requests;
                const price = s.asking_price ?? s.monthly_rental;
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="px-4 py-3 font-mono text-xs">{s.human_readable_id}</td>
                    <td className="px-4 py-3">
                      <Link href={`/submissions/${s.id}`} className="font-medium text-crimson hover:underline">
                        {s.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">{req?.human_readable_id}</td>
                    <td className="px-4 py-3">
                      {price != null ? `${s.currency} ${Number(price).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-surface px-2 py-1 text-xs font-medium">
                        {ts(s.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AgentShell>
  );
}
