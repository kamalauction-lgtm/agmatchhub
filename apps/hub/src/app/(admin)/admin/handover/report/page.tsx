import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { activationRate, adminEffort, batchStats, weeklyMedianHours } from "@/lib/admin/handover-report";

/**
 * Handover reporting (screen 14, P2-b). Everything is read with the admin's
 * own session, so each section is limited to the admin's countries by the
 * existing RLS; the admin-effort section needs audit.view (00123). No client,
 * buyer or agent contact data is read.
 */
export const dynamic = "force-dynamic";

function clock() {
  const n = Date.now();
  return { now: new Date(n).toISOString(), since: new Date(n - 90 * 86_400_000).toISOString(), since8w: new Date(n - 56 * 86_400_000).toISOString() };
}

export default async function HandoverReportPage() {
  await requireCapability("listing.moderate");
  const t = await getTranslations("adminHandoverReport");
  const supabase = await createClient();
  const { now, since, since8w } = clock();

  const [{ data: batches }, { data: invites }, { data: requests }, { data: moderated }, { data: canAudit }, { data: live }] = await Promise.all([
    supabase.from("import_batches").select("created_at, handed_over_at, agent_review_completed_at").not("acting_admin_id", "is", null).gte("created_at", since).limit(2000),
    supabase.from("agent_invitations").select("created_at, redeemed_at, status").gte("created_at", since).limit(2000),
    supabase.from("listing_change_requests").select("opened_at, answered_at, closed_at").gte("opened_at", since8w).limit(2000),
    supabase.from("listings").select("created_at, moderated_at").not("moderated_at", "is", null).gte("moderated_at", since8w).limit(5000),
    supabase.rpc("has_capability", { p_capability: "audit.view" }),
    supabase.from("listings").select("id").eq("status", "published").limit(5000),
  ]);
  const b = batchStats(batches ?? [], now);
  const a = activationRate(invites ?? [], now);
  const answerTrend = weeklyMedianHours((requests ?? []).map((r) => ({ start: r.opened_at, end: r.answered_at })), now);
  const moderationTrend = weeklyMedianHours((moderated ?? []).map((l) => ({ start: l.created_at, end: l.moderated_at })), now);
  let effort: ReturnType<typeof adminEffort> | null = null;
  if (canAudit) {
    const ids = (live ?? []).map((l) => l.id);
    const { data: aud } = ids.length
      ? await supabase.from("audit_logs").select("entity_id").eq("entity_type", "listing").in("actor_role", ["super_admin", "admin", "compliance_admin", "country_admin"]).in("entity_id", ids.slice(0, 1000)).limit(10000)
      : { data: [] as { entity_id: string }[] };
    effort = adminEffort(ids, (aud ?? []).map((x) => x.entity_id as string));
  }
  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  const num = (x: number | null, unit: string) => (x === null ? "—" : `${x.toFixed(1)} ${unit}`);
  const card = "rounded-xl border border-line p-4";
  const trend = (rows: { week: string; count: number; medianHours: number | null }[], key: string) => (
    <table className="w-full text-sm" data-trend={key}>
      <thead className="text-left text-xs text-muted"><tr><th className="py-1">{t("week")}</th><th className="py-1 text-right">{t("count")}</th><th className="py-1 text-right">{t("medianHours")}</th></tr></thead>
      <tbody>{rows.map((w) => <tr key={w.week} className="border-t border-line"><td className="py-1">{w.week}</td><td className="py-1 text-right">{w.count}</td><td className="py-1 text-right">{w.medianHours === null ? "—" : w.medianHours.toFixed(1)}</td></tr>)}</tbody>
    </table>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8" data-handover-report="1">
      <Link href="/admin/handover" className="text-sm text-muted hover:text-foreground">← {t("back")}</Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted">{t("hint")}</p>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={card}><p className="text-xs text-muted">{t("kpi.batches")}</p><p className="mt-1 text-2xl font-semibold" data-kpi="batches">{b.batches}</p><p className="text-xs text-muted">{t("kpi.batchesSub", { handed: b.handedOver, complete: b.complete })}</p></div>
        <div className={card}><p className="text-xs text-muted">{t("kpi.prep")}</p><p className="mt-1 text-2xl font-semibold" data-kpi="prep">{num(b.medianPrepDays, t("days"))}</p></div>
        <div className={card}><p className="text-xs text-muted">{t("kpi.review")}</p><p className="mt-1 text-2xl font-semibold" data-kpi="review">{num(b.medianReviewDays, t("days"))}</p><p className="text-xs text-muted">{t("kpi.within14", { pct: pct(b.completedWithin14) })}</p></div>
        <div className={card}><p className="text-xs text-muted">{t("kpi.activation")}</p><p className="mt-1 text-2xl font-semibold" data-kpi="activation">{pct(a.rate)}</p><p className="text-xs text-muted">{t("kpi.activationSub", { activated: a.activated, decided: a.decided })}</p></div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className={card}><h2 className="mb-2 font-semibold">{t("answerTrend")}</h2>{trend(answerTrend, "answer")}</div>
        <div className={card}><h2 className="mb-2 font-semibold">{t("moderationTrend")}</h2>{trend(moderationTrend, "moderation")}</div>
      </section>

      <section className={`mt-8 ${card}`} data-effort={effort ? "1" : "0"}>
        <h2 className="mb-1 font-semibold">{t("effortTitle")}</h2>
        {effort ? (
          <p className="text-sm">{t("effortLine", { per: effort.perListing === null ? "—" : effort.perListing.toFixed(1), actions: effort.actions, live: effort.live })}</p>
        ) : (
          <p className="text-sm text-muted">{t("effortNeedsAudit")}</p>
        )}
      </section>
    </div>
  );
}
