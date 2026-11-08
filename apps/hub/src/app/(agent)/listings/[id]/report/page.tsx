import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { ToolHeader } from "@/components/ai/tool-header";
import { AiStatus, AI_REASON_KEYS } from "@/components/ai/ai-status";
import { CopyButton } from "@/components/ui/copy-button";
import { buildOwnerReport } from "@/lib/ai/owner-report";

/**
 * Owner Report Writer — one listing's last 7 or 30 days as the update the
 * agent sends to the owner. `?ai=1` spends one AI task on the prose; the
 * numbers and the plain template are free and always there.
 */
export default async function OwnerReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ days?: string; ai?: string; owner?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("aiTools.report");
  const tr = await getTranslations("aiTools");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const days = sp.days === "30" ? 30 : 7;
  const owner = (sp.owner ?? "").slice(0, 80) || null;
  const r = await buildOwnerReport({ listingId: id, days, ownerName: owner, agentName: profile?.display_name ?? "", userId: user.id, locale, withAi: sp.ai === "1" });
  if (!r) notFound();
  const n = r.numbers;
  const q = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams({ days: String(days), ...(owner ? { owner } : {}), ...(sp.ai ? { ai: sp.ai } : {}) });
    for (const [k, v] of Object.entries(patch)) { if (v == null) u.delete(k); else u.set(k, v); }
    return `/listings/${id}/report?${u.toString()}`;
  };
  const full = `${r.subject}\n\n${r.report}\n\n${t("nextSteps")}:\n${r.nextSteps.map((s) => `- ${s}`).join("\n")}${r.askOwner ? `\n\n${r.askOwner}` : ""}`;
  const stat = (label: string, v: number, prev?: number) => (
    <div className="rounded-lg bg-surface p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{v}{prev != null && <span className={`ml-2 text-xs ${v >= prev ? "text-success" : "text-danger"}`}>{v >= prev ? "+" : ""}{v - prev}</span>}</p>
    </div>
  );

  return (
    <AgentShell wide>
      <ToolHeader roleKey="owner_report_writer" title={t("title")} intro={t("intro")} userId={user.id} />
      <p className="mb-4 text-sm text-muted"><Link href={`/listings/${id}/edit`} className="font-medium text-crimson hover:underline">{r.listing.human_readable_id}</Link> · {r.listing.title} · {r.listing.price}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="flex rounded-lg bg-surface p-0.5 text-xs font-semibold">
          {[7, 30].map((d) => <Link key={d} href={q({ days: String(d) })} aria-current={d === days ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${d === days ? "bg-card text-blue shadow-card" : "text-muted"}`}>{t("days", { count: d })}</Link>)}
        </nav>
        <form action={`/listings/${id}/report`} className="flex items-center gap-2">
          <input type="hidden" name="days" value={days} />
          {sp.ai && <input type="hidden" name="ai" value="1" />}
          <input name="owner" defaultValue={owner ?? ""} placeholder={t("ownerName")} maxLength={80} className="rounded-lg border border-line bg-background px-3 py-1.5 text-xs" />
          <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface">{t("apply")}</button>
        </form>
        <Link href={q({ ai: "1" })} className="ml-auto rounded-lg bg-crimson px-4 py-2 text-xs font-semibold text-white hover:bg-crimson-strong">✦ {sp.ai ? t("writeAgain") : t("writeAi")}</Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-xl border border-line bg-card p-5">
          <AiStatus source={r.source} reason={r.reason} model={r.model} labels={{ sourceAi: tr.raw("sourceAi") as string, sourceRules: tr("sourceRules"), reasons: Object.fromEntries(AI_REASON_KEYS.map((x) => [x, tr(`reason.${x}`)])) }} className="mb-3" />
          <p className="text-sm font-semibold">{r.subject}</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6">{r.report}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{t("nextSteps")}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{r.nextSteps.map((s) => <li key={s}>{s}</li>)}</ul>
          {r.askOwner && <p className="mt-3 rounded-lg bg-indigo-soft px-3 py-2 text-sm text-indigo">{r.askOwner}</p>}
          <div className="mt-4 flex gap-2">
            <CopyButton text={full} label={t("copy")} copiedLabel={t("copied")} />
            <a href={`https://wa.me/?text=${encodeURIComponent(full)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-success px-3 py-2 text-xs font-semibold text-white hover:opacity-90">{t("sendWhatsapp")}</a>
          </div>
          <p className="mt-3 text-[11px] text-muted">{t("sendNote")}</p>
        </section>
        <aside className="grid grid-cols-2 gap-2 self-start">
          {stat(t("m.views"), n.views, n.views_prev)}
          {stat(t("m.unique"), n.unique_views)}
          {stat(t("m.saves"), n.saves)}
          {stat(t("m.whatsapp"), n.whatsapp_clicks)}
          {stat(t("m.newLeads"), n.leads_new)}
          {stat(t("m.viewingStage"), n.leads_viewing)}
          {stat(t("m.negotiating"), n.leads_negotiating)}
          {stat(t("m.viewingsBooked"), n.viewings_upcoming)}
          <div className="col-span-2 rounded-lg bg-surface p-3 text-xs text-muted">{t("live", { days: n.days_live })}{n.price_changes ? ` · ${t("priceChanges", { count: n.price_changes })}` : ""}</div>
        </aside>
      </div>
    </AgentShell>
  );
}
