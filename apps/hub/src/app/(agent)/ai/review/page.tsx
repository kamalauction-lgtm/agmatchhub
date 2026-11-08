import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";
import { AiStatus, AI_REASON_KEYS } from "@/components/ai/ai-status";
import { getWeeklyReview } from "@/lib/ai/weekly-review";
import { regenerateWeeklyReview } from "../actions";

/** Performance Reviewer — the last seven days against the seven before; peers only as anonymised medians. */
function Row({ label, a, b, unit = "", invert = false }: { label: string; a: number | null; b: number | null; unit?: string; invert?: boolean }) {
  const d = a == null || b == null ? null : a - b;
  const good = d == null ? null : invert ? d <= 0 : d >= 0;
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3 text-sm">{label}</td>
      <td className="py-2 pr-3 text-right text-sm font-semibold tabular-nums">{a == null ? "—" : `${a}${unit}`}</td>
      <td className="py-2 pr-3 text-right text-sm tabular-nums text-muted">{b == null ? "—" : `${b}${unit}`}</td>
      <td className={`py-2 text-right text-xs font-semibold tabular-nums ${d == null || d === 0 ? "text-muted" : good ? "text-success" : "text-danger"}`}>{d == null ? "" : d > 0 ? `+${d}` : d}</td>
    </tr>
  );
}

export default async function ReviewPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = await getTranslations("aiTools.review");
  const tr = await getTranslations("aiTools");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name, agent_status").eq("id", user.id).maybeSingle();
  const verified = profile?.agent_status === "verified";
  const r = verified ? await getWeeklyReview({ userId: user.id, locale, firstName: (profile?.display_name ?? "").split(" ")[0] }) : null;
  const m = r?.metrics;
  return (
    <AgentShell wide>
      <ToolHeader roleKey="performance_reviewer" title={t("title")} intro={t("intro")} userId={user.id} />
      {!verified && <p className="rounded-xl border border-crimson/30 bg-crimson-soft px-5 py-4 text-sm">{t("verifyFirst")}</p>}
      {r && m && (
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <section className="rounded-xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AiStatus source={r.source} reason={r.reason} model={r.model} labels={{ sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"), reasons: Object.fromEntries(AI_REASON_KEYS.map((x) => [x, tr(`reason.${x}`)])) }} />
              <form action={regenerateWeeklyReview}><button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface">{t("again")}</button></form>
            </div>
            {r.insight ? (
              <>
                <p className="mt-3 text-base leading-7">{r.insight}</p>
                {r.win && <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">✓ {r.win}</p>}
                {r.action && <p className="mt-2 rounded-lg bg-indigo-soft px-3 py-2 text-sm text-indigo">→ {r.action}</p>}
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">{t("numbersOnly")}</p>
            )}
            <table className="mt-5 w-full">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted"><th className="pb-2">{t("metric")}</th><th className="pb-2 text-right">{t("thisWeek")}</th><th className="pb-2 text-right">{t("lastWeek")}</th><th className="pb-2 text-right">Δ</th></tr></thead>
              <tbody>
                <Row label={t("m.leads")} a={m.leads_this} b={m.leads_last} />
                <Row label={t("m.replies")} a={m.replied_this} b={m.replied_last} />
                <Row label={t("m.response")} a={m.response_minutes_this} b={m.response_minutes_last} unit=" min" invert />
                <Row label={t("m.published")} a={m.published_this} b={m.published_last} />
                <Row label={t("m.views")} a={m.views_this} b={m.views_last} />
                <Row label={t("m.inquiries")} a={m.inquiries_this} b={m.inquiries_last} />
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-muted">{t("weekOf", { date: r.weekStart })}</p>
          </section>
          <aside className="rounded-xl border border-line bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("peersTitle")}</p>
            {m.peers >= 5 ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted">{t("m.leads")}</dt><dd className="font-semibold">{m.peer_leads_median ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{t("m.response")}</dt><dd className="font-semibold">{m.peer_response_minutes_median != null ? `${m.peer_response_minutes_median} min` : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{t("m.published")}</dt><dd className="font-semibold">{m.peer_published_median ?? "—"}</dd></div>
                <p className="pt-2 text-[11px] text-muted">{t("peersNote", { count: m.peers })}</p>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted">{t("peersFew")}</p>
            )}
          </aside>
        </div>
      )}
    </AgentShell>
  );
}
