import Link from "next/link";
import { getTranslations, getFormatter } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, myCapabilities } from "@/lib/authz";
import { Panel, StatCard } from "@/components/admin/panel";
import { BarChart, Funnel, type Series } from "@/components/admin/charts";

/**
 * Command Center.
 *
 * Phase 1's North Star is ACTIVATED AGENTS WITH PUBLISHED INVENTORY — not
 * registrations, and explicitly not revenue while billing mode is FREE_LAUNCH.
 *
 * "Activated" is `public.is_activated_agent()`, the SAME rule the referral
 * engine pays on. Two definitions of activation would be worse than none: the
 * dashboard would disagree with the rewards and nobody could tell which was
 * right.
 *
 * ORDER OF THE PAGE
 *   Queues before metrics, always. A number nobody can act on is a poster; the
 *   Action Center is the part of this screen that is work rather than reading,
 *   so it sits above everything except the four headline counts.
 *
 * EVERY NUMBER CARRIES ITS CHANGE
 *   This page used to be fourteen bare counters. A counter says what is true
 *   now, which runs a queue but not a business — 41 activated agents is not a
 *   fact until you know whether it was 12 or 60 last month.
 *
 * The range and the breakdown dimension are URL parameters, so a view can be
 * linked, bookmarked and sent to a colleague — which is what somebody actually
 * does with a dashboard they want another person to look at.
 */

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

type Metrics = {
  agents_total: number;
  agents_verified: number;
  agents_activated: number;
  listings_published: number;
  listings_per_activated: string;
  referrals_total: number;
  referrals_activated: number;
};

type Queues = {
  listings_in_review: number;
  agents_awaiting: number;
  requests_to_approve: number;
  open_reports: number;
  failed_imports: number;
  rewards_to_review: number;
  expiring_policies: number;
};

type Point = {
  day: string;
  signups: number;
  verifications: number;
  activations: number;
  listings_published: number;
  referrals: number;
};

type Comparison = { metric: string; current_value: number; previous_value: number };
type FunnelRow = { stage: string; people: number; step: number };
type BreakdownRow = { label: string; agents: number; activated: number; listings: number };
type TopAgent = { agent_id: string; display_name: string; organisation: string; published: number };
type TopReferrer = {
  referrer_id: string;
  display_name: string;
  activated: number;
  network_listings: number;
};
type Snapshot = {
  billing_mode: string;
  currency: string;
  shadow_mrr: string;
  charged_mrr: string;
  active_subscriptions: number;
  complimentary_subscriptions: number;
  organisations_with_policy: number;
  active_policies: number;
};
type Health = { check_key: string; status: string; detail_count: number };

const HEALTH_TONE: Record<string, string> = {
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  down: "bg-danger-soft text-danger",
};

/** Where each health check sends you to do something about it. */
const HEALTH_HREF: Record<string, string> = {
  importer: "/admin/listings",
  moderation: "/admin/listings",
  verification: "/admin/agents",
  media: "/admin/listings",
  trust: "/admin/reports",
  rewards: "/admin/growth",
};

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; range?: string; by?: string }>;
}) {
  await requireAdmin();
  const { denied, range: rangeParam, by } = await searchParams;
  const t = await getTranslations("admin");
  const format = await getFormatter();
  const caps = await myCapabilities();
  const supabase = await createClient();

  const days: Range = RANGES.includes(Number(rangeParam) as Range) ? (Number(rangeParam) as Range) : 30;
  const dimension = ["country", "organisation", "status"].includes(by ?? "") ? (by as string) : "country";

  const [
    { data: m },
    { data: q },
    { data: seriesRows },
    { data: comparisonRows },
    { data: funnelRows },
    { data: breakdownRows },
    { data: topAgentRows },
    { data: topReferrerRows },
    { data: snapshotRows },
    { data: healthRows },
    { data: audit },
  ] = await Promise.all([
    supabase.rpc("admin_growth_metrics"),
    supabase.rpc("admin_action_queues"),
    supabase.rpc("admin_metric_series", { p_days: days }),
    supabase.rpc("admin_period_comparison", { p_days: days }),
    supabase.rpc("admin_funnel"),
    supabase.rpc("admin_breakdown", { p_dimension: dimension }),
    supabase.rpc("admin_top_agents", { p_limit: 6 }),
    supabase.rpc("admin_top_referrers", { p_limit: 5 }),
    supabase.rpc("admin_commercial_snapshot"),
    supabase.rpc("admin_system_health"),
    supabase
      .from("audit_logs")
      .select("action, entity_type, created_at, profiles:actor_id(display_name)")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const metrics = ((m ?? []) as Metrics[])[0];
  const queues = ((q ?? []) as Queues[])[0];
  const points = (seriesRows ?? []) as Point[];
  const funnelData = (funnelRows ?? []) as FunnelRow[];
  const breakdown = (breakdownRows ?? []) as BreakdownRow[];
  const topAgents = (topAgentRows ?? []) as TopAgent[];
  const topReferrers = (topReferrerRows ?? []) as TopReferrer[];
  const snapshot = ((snapshotRows ?? []) as Snapshot[])[0];
  const health = (healthRows ?? []) as Health[];

  const compare = new Map(
    ((comparisonRows ?? []) as Comparison[]).map((c) => [c.metric, c.current_value - c.previous_value])
  );

  /* Only queues this admin can actually clear. A compliance admin sent to the
     banners queue would be bounced by the capability gate on that page. */
  const queueRows = [
    { key: "agentsAwaiting", n: queues?.agents_awaiting ?? 0, href: "/admin/agents", cap: "agent.verify", tone: "red" },
    { key: "listingsInReview", n: queues?.listings_in_review ?? 0, href: "/admin/listings", cap: "listing.moderate", tone: "blue" },
    { key: "requestsToApprove", n: queues?.requests_to_approve ?? 0, href: "/admin/requests", cap: "request.manage", tone: "indigo" },
    { key: "rewardsToReview", n: queues?.rewards_to_review ?? 0, href: "/admin/growth", cap: "growth.manage", tone: "orange" },
    { key: "openReports", n: queues?.open_reports ?? 0, href: "/admin/reports", cap: "report.manage", tone: "red" },
    { key: "failedImports", n: queues?.failed_imports ?? 0, href: "/admin/listings", cap: "listing.moderate", tone: "orange" },
    { key: "expiringPolicies", n: queues?.expiring_policies ?? 0, href: "/admin/commercial", cap: "commercial.manage", tone: "indigo" },
  ].filter((c) => caps.has(c.cap));

  const waiting = queueRows.reduce((n, c) => n + c.n, 0);

  /* next-intl types message keys as a literal union, so a key built from data
     needs `as never` — which then types the values argument as `undefined`.
     This is the escape hatch for the handful of places that need both. */
  const tDynamic = t as unknown as (key: string, values?: Record<string, unknown>) => string;

  const shortDay = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short" });
  const money = (v: string | number) =>
    format.number(Number(v ?? 0), {
      style: "currency",
      currency: snapshot?.currency ?? "IDR",
      maximumFractionDigits: 0,
    });

  /* Four series, in the order a person moves through them. Verifications are
     the daily RATE, which is different information from the funnel's
     cumulative "Verified" stage — the funnel says how many are through, this
     says whether anyone is being let through this week. */
  const series: Series[] = [
    { key: "signups", label: t("kpi.registered"), colour: "var(--indigo)", values: points.map((p) => p.signups) },
    { key: "verifications", label: t("kpi.verified"), colour: "var(--blue)", values: points.map((p) => p.verifications) },
    { key: "activations", label: t("kpi.activated"), colour: "var(--teal)", values: points.map((p) => p.activations) },
    { key: "listings", label: t("kpi.published"), colour: "var(--success)", values: points.map((p) => p.listings_published) },
  ];

  const funnelHints: Record<string, string> = {
    registered: t("funnel.registeredHint"),
    verified: t("funnel.verifiedHint"),
    has_listing: t("funnel.hasListingHint"),
    activated: t("funnel.activatedHint"),
  };

  const rangeTabs = (
    <nav className="flex rounded-lg bg-surface p-0.5" aria-label={t("rangeLabel")}>
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/admin?range=${r}&by=${dimension}`}
          aria-current={r === days ? "page" : undefined}
          className={`min-h-7 rounded-md px-3 text-xs font-semibold leading-7 transition-colors duration-150 ${
            r === days ? "bg-card text-blue shadow-card" : "text-muted hover:text-foreground"
          }`}
        >
          {t("rangeDays", { count: r })}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="space-y-6">
      {/* Header ---------------------------------------------------------- */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t("overviewTitle")}</h1>
          <p className="mt-1 text-sm text-muted">
            {waiting === 0 ? t("allClear") : t("waitingCount", { count: waiting })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {snapshot?.billing_mode && (
            <span className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-strong">
              {t(`billingMode.${snapshot.billing_mode}` as never)}
            </span>
          )}
          {rangeTabs}
        </div>
      </header>

      {denied && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          {t("deniedCapability", { capability: denied })}
        </p>
      )}

      {/* Headline numbers ------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="👥"
          tone="indigo"
          value={format.number(metrics?.agents_total ?? 0)}
          label={t("kpi.registered")}
          delta={compare.get("signups") ?? null}
          caption={t("comparedTo", { count: days })}
          series={points.map((p) => p.signups)}
        />
        <StatCard
          icon="🛡"
          tone="green"
          value={format.number(metrics?.agents_verified ?? 0)}
          label={t("kpi.verified")}
          caption={t("kpi.verifiedHint")}
          series={points.map((p) => p.verifications)}
          href="/admin/agents"
        />
        <StatCard
          icon="🚀"
          tone="orange"
          value={format.number(metrics?.agents_activated ?? 0)}
          label={t("kpi.activated")}
          delta={compare.get("activations") ?? null}
          caption={t("kpi.activatedHint")}
          series={points.map((p) => p.activations)}
          href="/admin/agents"
        />
        <StatCard
          icon="🏠"
          tone="blue"
          value={format.number(metrics?.listings_published ?? 0)}
          label={t("kpi.published")}
          delta={compare.get("listings") ?? null}
          caption={t("kpi.perAgentValue", { n: metrics?.listings_per_activated ?? "0" })}
          series={points.map((p) => p.listings_published)}
          href="/admin/listings"
        />
      </div>

      {/* Growth ----------------------------------------------------------- */}
      <Panel title={t("trendTitle", { count: days })} hint={t("growthHint")} action={rangeTabs}>
        <BarChart
          labels={points.map((p) => shortDay(p.day))}
          series={series}
          emptyLabel={t("noMovement")}
          bucketLabel={(n) => t("bucketLabel", { count: n })}
        />
      </Panel>

      {/* Action centre + growth partners ---------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title={t("needsAttention")}
          action={
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                waiting > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
              }`}
            >
              {waiting}
            </span>
          }
          bodyClassName="p-0 sm:p-0"
        >
          {queueRows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">{t("noQueues")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {queueRows.map((c) => (
                <li key={c.key}>
                  <Link
                    href={c.href}
                    className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface"
                  >
                    <span
                      aria-hidden
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs ${
                        c.n > 0 ? "bg-crimson-soft text-crimson" : "bg-surface text-muted"
                      }`}
                    >
                      ●
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{t(`queue.${c.key}` as never)}</span>
                      <span className="block truncate text-xs text-muted">
                        {t(`queueWhy.${c.key}` as never)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-base font-bold tabular-nums ${
                        c.n > 0 ? "text-crimson" : "text-muted"
                      }`}
                    >
                      {c.n}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={t("topPartnersTitle")}
          hint={t("topPartnersHint")}
          action={
            caps.has("growth.manage") ? (
              <Link href="/admin/growth" className="text-xs font-semibold text-blue hover:underline">
                {t("seeLeaderboard")}
              </Link>
            ) : null
          }
          bodyClassName="p-0 sm:p-0"
        >
          {topReferrers.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">{t("noReferrers")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th scope="col" className="px-5 py-2 font-semibold">#</th>
                  <th scope="col" className="py-2 font-semibold">{t("colPartner")}</th>
                  <th scope="col" className="py-2 text-right font-semibold">{t("colAgents")}</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">{t("colListings")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topReferrers.map((r, i) => (
                  <tr key={r.referrer_id} className="transition-colors duration-150 hover:bg-surface">
                    <td className="px-5 py-2.5 text-xs font-bold text-muted tabular-nums">{i + 1}</td>
                    <td className="py-2.5">
                      <Link href={`/admin/agents/${r.referrer_id}`} className="font-medium hover:text-blue">
                        {r.display_name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{r.activated}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.network_listings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* Funnel + breakdown ----------------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("funnelTitle")} hint={t("funnelHint")}>
          <Funnel
            stages={funnelData.map((f) => ({
              label: t(`funnel.${f.stage}` as never),
              value: f.people,
              hint: funnelHints[f.stage],
            }))}
          />
        </Panel>

        <Panel
          title={t("breakdownTitle")}
          action={
            <nav className="flex gap-0.5 rounded-lg bg-surface p-0.5 text-xs" aria-label={t("breakdownTitle")}>
              {["country", "organisation", "status"].map((d) => (
                <Link
                  key={d}
                  href={`/admin?range=${days}&by=${d}`}
                  aria-current={d === dimension ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1.5 font-semibold transition-colors duration-150 ${
                    d === dimension ? "bg-card text-blue shadow-card" : "text-muted hover:text-foreground"
                  }`}
                >
                  {t(`dimension.${d}` as never)}
                </Link>
              ))}
            </nav>
          }
          bodyClassName="p-0 sm:p-0"
        >
          {breakdown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">{t("noData")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th scope="col" className="px-5 py-2 font-semibold">
                      {t(`dimension.${dimension}` as never)}
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">{t("colAgents")}</th>
                    <th scope="col" className="py-2 text-right font-semibold">{t("colActivated")}</th>
                    <th scope="col" className="px-5 py-2 text-right font-semibold">{t("colListings")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {breakdown.map((r) => (
                    <tr key={r.label} className="transition-colors duration-150 hover:bg-surface">
                      <td className="px-5 py-2.5 font-medium">{r.label}</td>
                      <td className="py-2.5 text-right tabular-nums">{r.agents}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-blue">{r.activated}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{r.listings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Commercial + health ---------------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title={t("commercialTitle")}
          hint={t("commercialHint")}
          action={
            caps.has("commercial.manage") ? (
              <Link href="/admin/commercial" className="text-xs font-semibold text-blue hover:underline">
                {t("seeDetail")}
              </Link>
            ) : null
          }
        >
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                k: "billingMode",
                v: snapshot?.billing_mode ? t(`billingMode.${snapshot.billing_mode}` as never) : "—",
                sub: t("commercial.billingModeSub"),
              },
              {
                k: "shadowMrr",
                v: money(snapshot?.shadow_mrr ?? 0),
                sub: t("commercial.shadowMrrSub"),
              },
              {
                k: "subscriptions",
                v: format.number(snapshot?.active_subscriptions ?? 0),
                sub: t("commercial.subscriptionsSub", {
                  count: snapshot?.complimentary_subscriptions ?? 0,
                }),
              },
              {
                k: "organisations",
                v: format.number(snapshot?.organisations_with_policy ?? 0),
                sub: t("commercial.organisationsSub", { count: snapshot?.active_policies ?? 0 }),
              },
            ].map((cell) => (
              <div key={cell.k} className="rounded-lg bg-surface px-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t(`commercial.${cell.k}` as never)}
                </dt>
                <dd className="mt-1 truncate text-base font-bold">{cell.v}</dd>
                <dd className="mt-0.5 text-xs text-muted">{cell.sub}</dd>
              </div>
            ))}
          </dl>
          {/* Said out loud, because a projection on a dashboard becomes a
              forecast in somebody's slide by Friday. */}
          <p className="mt-3 text-xs italic text-muted">{t("commercial.disclaimer")}</p>
        </Panel>

        <Panel title={t("healthTitle")} hint={t("healthHint")}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {health.map((h) => (
              <li key={h.check_key}>
                <Link
                  href={HEALTH_HREF[h.check_key] ?? "/admin"}
                  className="block rounded-lg border border-line px-3 py-2.5 transition-colors duration-150 hover:border-blue"
                >
                  <span className="block text-xs font-semibold text-muted-strong">
                    {t(`health.${h.check_key}` as never)}
                  </span>
                  <span
                    className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      HEALTH_TONE[h.status] ?? HEALTH_TONE.ok
                    }`}
                  >
                    {t(`healthStatus.${h.status}` as never)}
                  </span>
                  {h.detail_count > 0 && (
                    <span className="mt-1 block text-xs text-muted">
                      {tDynamic(`healthDetail.${h.check_key}`, { count: h.detail_count })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Top agents + activity -------------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("topAgentsTitle")} hint={t("topAgentsHint")} bodyClassName="p-0 sm:p-0">
          {topAgents.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">{t("noData")}</p>
          ) : (
            <ol className="divide-y divide-line">
              {topAgents.map((a, i) => (
                <li key={a.agent_id}>
                  <Link
                    href={`/admin/agents/${a.agent_id}`}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors duration-150 hover:bg-surface"
                  >
                    <span className="w-4 shrink-0 text-xs font-bold tabular-nums text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.display_name}</span>
                      <span className="block truncate text-xs text-muted">{a.organisation}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">{a.published}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel
          title={t("recentActivity")}
          action={
            <Link href="/admin/audit" className="text-xs font-semibold text-blue hover:underline">
              {t("openAudit")}
            </Link>
          }
          bodyClassName="p-0 sm:p-0"
        >
          {!(audit ?? []).length ? (
            <p className="px-5 py-10 text-center text-sm text-muted">{t("noActivity")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th scope="col" className="px-5 py-2 font-semibold">{t("colWhen")}</th>
                  <th scope="col" className="py-2 font-semibold">{t("colActivity")}</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">{t("colWho")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(audit ?? []).map((a, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-xs text-muted">
                      {format.relativeTime(new Date(a.created_at))}
                    </td>
                    <td className="py-2.5 font-mono text-xs">{a.action}</td>
                    <td className="px-5 py-2.5 text-right text-xs text-muted">
                      {(a.profiles as unknown as { display_name: string } | null)?.display_name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
