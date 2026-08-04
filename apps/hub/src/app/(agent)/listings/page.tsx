import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { MAX_ACTIVE_LISTINGS } from "@/config/quotas";

/** The agent's marketplace listings — distinct from co-broke submissions. */
export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { submitted, error } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("listings");
  const ts = await getTranslations("listingStatus");

  const { data: rows } = await supabase
    .from("listings")
    .select(
      `id, human_readable_id, title, listing_type, status, moderation_state,
       moderation_reason, price, currency, rent_period, created_at, published_at,
       properties (regency_name, province_name)`
    )
    .eq("agent_id", user.id)
    .order("created_at", { ascending: false });

  const listings = rows ?? [];
  const active = listings.filter((l) =>
    ["draft", "pending_review", "published"].includes(l.status)
  ).length;

  return (
    <AgentShell wide>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("quota", { active, max: MAX_ACTIVE_LISTINGS })}
          </p>
        </div>
        <Link
          href="/listings/new"
          className="rounded-lg bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
        >
          {t("new")}
        </Link>
      </div>

      {submitted && (
        <p className="mb-6 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {t("submittedNotice", { id: submitted })}
        </p>
      )}
      {error === "quota" && (
        <p className="mb-6 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {t("quotaReached", { max: MAX_ACTIVE_LISTINGS })}
        </p>
      )}

      {!listings.length ? (
        <p className="rounded-xl border border-line bg-surface p-10 text-center text-sm text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">{t("cols.listing")}</th>
                <th className="px-4 py-3">{t("cols.location")}</th>
                <th className="px-4 py-3">{t("cols.price")}</th>
                <th className="px-4 py-3">{t("cols.status")}</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => {
                const prop = Array.isArray(l.properties) ? l.properties[0] : l.properties;
                return (
                  <tr key={l.id} className="border-t border-line">
                    <td className="px-4 py-3 font-mono text-xs">{l.human_readable_id}</td>
                    <td className="px-4 py-3 font-medium">{l.title}</td>
                    <td className="px-4 py-3 text-xs">
                      {[prop?.regency_name, prop?.province_name].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {l.currency} {Number(l.price).toLocaleString("id-ID")}
                      {l.rent_period ? (l.rent_period === "monthly" ? "/bln" : "/thn") : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          l.status === "published"
                            ? "bg-success/10 text-success"
                            : l.status === "rejected"
                              ? "bg-danger/10 text-danger"
                              : "bg-surface"
                        }`}
                      >
                        {ts(l.status as never)}
                      </span>
                      {l.status === "rejected" && l.moderation_reason && (
                        <p className="mt-1 max-w-60 text-xs text-muted">{l.moderation_reason}</p>
                      )}
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
