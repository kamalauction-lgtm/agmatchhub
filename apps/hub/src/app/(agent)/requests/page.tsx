import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";

export default async function RequestsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const t = await getTranslations("requests");

  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase
      .from("property_requests")
      .select("id, human_readable_id, title, city, country_code, transaction_type, status, created_at")
      .eq("requesting_agent_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("agent_status").eq("id", user.id).single(),
  ]);

  const verified = profile?.agent_status === "verified";

  return (
    <AgentShell wide>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {verified && (
          <Link
            href="/requests/new"
            className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-strong"
          >
            {t("newRequest")}
          </Link>
        )}
      </div>

      {!verified && (
        <p className="mb-6 rounded-lg bg-warning/10 px-4 py-3 text-sm">
          {t("verifyFirst")}{" "}
          <Link href="/verification" className="font-medium text-crimson">{t("verifyLink")}</Link>
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
                <th className="px-4 py-3">{t("cols.title")}</th>
                <th className="px-4 py-3">{t("cols.location")}</th>
                <th className="px-4 py-3">{t("cols.type")}</th>
                <th className="px-4 py-3">{t("cols.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs">{r.human_readable_id}</td>
                  <td className="px-4 py-3">
                    <Link href={`/requests/${r.id}`} className="font-medium text-crimson hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.city}, {r.country_code}</td>
                  <td className="px-4 py-3">{t(`transaction.${r.transaction_type}`)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface px-2 py-1 text-xs font-medium">
                      {t(`status.${r.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AgentShell>
  );
}
