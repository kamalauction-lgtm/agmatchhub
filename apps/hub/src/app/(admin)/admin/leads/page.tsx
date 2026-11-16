import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireCapability } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { leadResponseStats, type LeadTiming } from "@/lib/leads/response";

/**
 * Leads response-time view (screen 10, "Leads and Requests Ops").
 *
 * How fast agents answer buyer inquiries: answered on time (before the
 * lead's first_response_due), median first response, and what is overdue now
 * — overall and per agent. Gated by request.manage, the capability that
 * already owns this screen; rows are scoped by the leads RLS policy
 * (admin_sees_lead, the admin's countries).
 *
 * Confidentiality: no buyer contact is read here — only the lead reference,
 * its listing and its agent, and timestamps.
 */

const PERIODS = [7, 30, 90] as const;
type LeadRow = LeadTiming & {
  id: string; human_readable_id: string; status: string;
  listings: { title: string; human_readable_id: string } | null;
  profiles: { display_name: string | null } | null;
};

export const dynamic = "force-dynamic";

/** The clock, read outside render (react-hooks/purity). */
function clock(days: number) {
  const nowMs = Date.now();
  return { since: new Date(nowMs - days * 86_400_000).toISOString(), now: new Date(nowMs).toISOString() };
}

export default async function LeadsResponsePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireCapability("request.manage");
  const sp = await searchParams;
  const days = (PERIODS as readonly number[]).includes(Number(sp.days)) ? Number(sp.days) : 30;
  const t = await getTranslations("adminLeads");
  const supabase = await createClient();

  const { since, now } = clock(days);
  const { data } = await supabase
    .from("leads")
    .select("id, human_readable_id, status, agent_id, created_at, first_response_due, first_responded_at, listings (title, human_readable_id), profiles (display_name)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []) as unknown as LeadRow[];
  const stats = leadResponseStats(rows, now);
  const names = new Map(rows.map((r) => [r.agent_id, r.profiles?.display_name ?? "—"]));
  const overdue = rows.filter((r) => !r.first_responded_at && r.first_response_due && r.first_response_due < now)
    .sort((a, b) => (a.first_response_due! < b.first_response_due! ? -1 : 1));

  const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
  const dur = (min: number | null) => {
    if (min === null) return "—";
    if (min < 60) return t("minutes", { n: Math.round(min) });
    if (min < 48 * 60) return t("hours", { n: Math.round(min / 60) });
    return t("days", { n: Math.round(min / 1440) });
  };
  const late = (iso: string) => dur((Date.parse(now) - Date.parse(iso)) / 60_000);
  const card = "rounded-xl border border-line p-4";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-4 text-sm text-muted">{t("hint")}</p>
      <nav className="mb-6 flex flex-wrap gap-2" aria-label={t("period")}>
        {PERIODS.map((d) => (
          <Link key={d} href={`/admin/leads?days=${d}`} aria-current={d === days ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${d === days ? "border-crimson bg-crimson-soft font-semibold text-crimson" : "border-line text-muted hover:text-foreground"}`}>
            {t("lastDays", { n: d })}
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-leads={stats.total}>
        <div className={card}><p className="text-xs text-muted">{t("kpi.leads")}</p><p className="mt-1 text-2xl font-semibold" data-kpi="leads">{stats.total}</p></div>
        <div className={card}><p className="text-xs text-muted">{t("kpi.onTime")}</p><p className="mt-1 text-2xl font-semibold" data-kpi="on-time">{pct(stats.onTimeRate)}</p></div>
        <div className={card}><p className="text-xs text-muted">{t("kpi.median")}</p><p className="mt-1 text-2xl font-semibold" data-kpi="median">{dur(stats.medianMinutes)}</p></div>
        <div className={card}><p className="text-xs text-muted">{t("kpi.overdue")}</p><p className={`mt-1 text-2xl font-semibold ${stats.overdueNow ? "text-danger" : ""}`} data-kpi="overdue">{stats.overdueNow}</p></div>
      </section>

      <section className="mt-8" aria-labelledby="agents-title">
        <h2 id="agents-title" className="text-lg font-semibold">{t("byAgent")}</h2>
        {!stats.byAgent.length ? (
          <p className="mt-3 rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">{t("empty")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">{t("cols.agent")}</th>
                  <th className="px-3 py-2 text-right">{t("cols.leads")}</th>
                  <th className="px-3 py-2 text-right">{t("cols.answered")}</th>
                  <th className="px-3 py-2 text-right">{t("cols.onTime")}</th>
                  <th className="px-3 py-2 text-right">{t("cols.median")}</th>
                  <th className="px-3 py-2 text-right">{t("cols.overdue")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.byAgent.map((a) => (
                  <tr key={a.agentId} className="border-t border-line" data-agent={a.agentId} data-overdue={a.overdueNow}>
                    <td className="px-3 py-2"><Link href={`/admin/agents/${a.agentId}`} className="hover:underline">{names.get(a.agentId)}</Link></td>
                    <td className="px-3 py-2 text-right">{a.total}</td>
                    <td className="px-3 py-2 text-right">{a.responded}</td>
                    <td className="px-3 py-2 text-right">{pct(a.onTimeRate)}</td>
                    <td className="px-3 py-2 text-right">{dur(a.medianMinutes)}</td>
                    <td className={`px-3 py-2 text-right ${a.overdueNow ? "font-semibold text-danger" : ""}`}>{a.overdueNow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="overdue-title">
        <h2 id="overdue-title" className="text-lg font-semibold">{t("overdueTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("overdueHint")}</p>
        {!overdue.length ? (
          <p className="mt-3 rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted">{t("noOverdue")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-sm">
            {overdue.slice(0, 100).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-2 px-3 py-2" data-overdue-lead={r.id}>
                <span className="font-medium">{r.human_readable_id}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{r.listings?.title ?? "—"}</span>
                <span className="text-xs">{r.profiles?.display_name ?? "—"}</span>
                <span className="text-xs font-semibold text-danger">{t("lateBy", { time: late(r.first_response_due!) })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
