import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations, getFormatter, getLocale } from "next-intl/server";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";
import { getAiBrief } from "@/lib/ai/brief";
import { aiQuotaFor } from "@/lib/ai/engine";
import { regenerateBrief } from "./ai-actions";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { AnnouncementFeed } from "@/components/announcements/announcement-feed";
import { Panel, StatCard } from "@/components/admin/panel";
import { BarChart, type Series } from "@/components/admin/charts";
import { getDashboard } from "@/lib/dashboard/brief";
import { planFor } from "@/config/plans";
import { ENTITLEMENT, entitlementInt } from "@/lib/entitlements";

/**
 * The agent OS home (§20).
 *
 * Structure follows the design sheet's agent dashboard: a greeting, headline
 * numbers with their change, a performance trend, the plan and its allowances,
 * the daily brief, growth, and the agent's own inventory. MatchHub and
 * Co-Marketing remain module cards among peers — the platform is the operating
 * system, not a co-broke tool with extras (Kamal, 4 Aug 2026).
 *
 * WHAT IS NOT ON THIS PAGE, AND WHY
 *   The design mock shows "Total Views" and a click-through rate. Nothing
 *   records a listing view: there is no impression table, and the public site
 *   holds no service-role key so it cannot write one until the enqueue path
 *   exists. A number derived from something else — leads, say — would describe
 *   nothing, and agents change their price and their photographs based on
 *   exactly that number. The cards show what is measured; view tracking is its
 *   own piece of work.
 *
 * The Brief Harian stays rules-only, deliberately: the ranked action list is
 * the part that changes what an agent does in the next ten minutes, and it
 * needs no model at all (docs/module-ai-agent-dashboard.md §3).
 */

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const STATUS_KEYS = [
  "draft", "email_verification_pending", "mobile_verification_pending",
  "documents_pending", "under_review", "additional_information_required",
  "verified", "rejected", "suspended", "temporarily_restricted", "banned",
  "expired_licence", "archived",
] as const;

type Summary = {
  listings_active: number;
  listings_published: number;
  leads_total: number;
  leads_new: number;
  leads_unanswered: number;
  leads_overdue: number;
  response_rate: number;
  appointments: number;
  leads_previous: number;
  listings_previous: number;
};

type Point = { day: string; leads: number; listings_published: number; responses: number };
type Growth = {
  code: string | null;
  activated: number;
  pending: number;
  network_listings: number;
  points: number;
};
type NextReward = { threshold: number; remaining: number; label: string };
type RecentListing = {
  id: string;
  title: string;
  status: string;
  price: number | null;
  currency: string | null;
  human_readable_id: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const days: Range = RANGES.includes(Number(rangeParam) as Range) ? (Number(rangeParam) as Range) : 30;

  const partnerIdentityPublic = await isPartnerIdentityPublic();
  // Env only (CLAUDE.md rule 6). Unset means no marketplace link is shown.
  const marketplaceUrl = process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: isAdmin }, { data: agentProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url, agent_status, public_slug, country_code")
      .eq("id", user.id)
      .single(),
    supabase.rpc("is_platform_admin"),
    supabase.from("agent_profiles").select("agency_name, city").eq("user_id", user.id).maybeSingle(),
  ]);

  const t = await getTranslations("dashboard");
  const tp = await getTranslations("plans");
  const format = await getFormatter();

  const status = (STATUS_KEYS as readonly string[]).includes(profile?.agent_status ?? "")
    ? (profile!.agent_status as (typeof STATUS_KEYS)[number])
    : "draft";
  const isVerified = status === "verified";
  const plan = await planFor(user.id);

  // Unverified agents have no inventory and no leads; skip the whole query set.
  const [data, summaryRows, seriesRows, growthRows, nextRewardRows, recentRows, boostCredits, vouchers] =
    isVerified
      ? await Promise.all([
          // Owner-scoped explicitly: an admin who is also an agent would
          // otherwise see platform-wide counts through the admin read policies
          // and be told to "finish 1 draft listing" that is somebody else's.
          getDashboard({ client: supabase, agentId: user.id }),
          supabase.rpc("my_performance_summary", { p_days: days }),
          supabase.rpc("my_performance_series", { p_days: days }),
          supabase.rpc("my_growth_summary"),
          supabase.rpc("my_next_reward"),
          supabase
            .from("listings")
            .select("id, title, status, price, currency, human_readable_id")
            .eq("agent_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(4),
          entitlementInt(user.id, ENTITLEMENT.boostMonthlyCredits),
          entitlementInt(user.id, ENTITLEMENT.featuredVouchers),
        ])
      : [null, { data: null }, { data: null }, { data: null }, { data: null }, { data: null }, 0, 0];

  const counts = data?.counts;
  const brief = data?.brief;
  const summary = ((summaryRows?.data ?? []) as Summary[])[0];
  const points = (seriesRows?.data ?? []) as Point[];
  const growth = ((growthRows?.data ?? []) as Growth[])[0];
  const nextReward = ((nextRewardRows?.data ?? []) as NextReward[])[0];
  const recent = (recentRows?.data ?? []) as RecentListing[];

  const quotaPct = summary
    ? Math.min(100, Math.round((summary.listings_active / Math.max(plan.maxListings, 1)) * 100))
    : 0;

  const shortDay = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short" });

  const series: Series[] = [
    { key: "leads", label: t("perf.leads"), colour: "var(--blue)", values: points.map((p) => p.leads) },
    { key: "responses", label: t("perf.responses"), colour: "var(--teal)", values: points.map((p) => p.responses) },
    { key: "listings", label: t("perf.listings"), colour: "var(--success)", values: points.map((p) => p.listings_published) },
  ];

  const rangeTabs = (
    <nav className="flex rounded-lg bg-surface p-0.5" aria-label={t("perf.rangeLabel")}>
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/dashboard?range=${r}`}
          aria-current={r === days ? "page" : undefined}
          className={`min-h-7 rounded-md px-3 text-xs font-semibold leading-7 transition-colors duration-150 ${
            r === days ? "bg-card text-blue shadow-card" : "text-muted hover:text-foreground"
          }`}
        >
          {t("perf.rangeDays", { count: r })}
        </Link>
      ))}
    </nav>
  );

  const firstName = (profile?.display_name ?? "").split(" ")[0];

  // The AI Manager's paragraph over the rules-only list — cached per day, so
  // this is one cheap read on every render after the first.
  const locale = await getLocale();
  /* The AI Manager has a face (00097): the agent's country row of the cast
     wins over the default, like the /ai directory. */
  const { data: personaRows } = await supabase
    .from("ai_role_personas").select("name, avatar_path, country_code").eq("role_key", "ai_manager");
  const manager = (personaRows ?? []).find((p) => p.country_code && p.country_code === (profile as { country_code?: string | null } | null)?.country_code)
    ?? (personaRows ?? []).find((p) => !p.country_code) ?? null;

  const [aiBrief, aiQuota] =
    isVerified && brief && counts
      ? await Promise.all([
          getAiBrief({
            userId: user.id,
            locale,
            firstName,
            brief,
            counts,
            actionLabels: brief.actions.map((a) => t(`brief.actions.${a.key}`, { count: a.count })),
          }),
          aiQuotaFor(user.id),
        ])
      : [null, null];

  return (
    <AgentShell wide>
      <div className="space-y-5">
        {/* Anything the platform is telling this agent. Renders nothing when
            there is nothing outstanding, which is most days. */}
        <AnnouncementFeed />

        {/* Greeting -------------------------------------------------------- */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {manager?.avatar_path && (
              <Image src={manager.avatar_path} alt={manager.name} width={48} height={48} unoptimized
                     className="h-12 w-12 shrink-0 rounded-full border-2 border-card object-cover shadow-card" title={t("brief.by", { name: manager.name })} />
            )}
            <div className="min-w-0">
            <h1 className="truncate">
              {t(`brief.greeting.${brief?.greetingKey ?? "morning"}`, { name: firstName })}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {agentProfile?.agency_name ?? t("independentAgent")}
              {agentProfile?.city ? ` · ${agentProfile.city}` : ""}
              {manager ? ` · ${t("brief.by", { name: manager.name })}` : ""}
            </p>
            </div>
          </div>
          {isVerified && rangeTabs}
        </header>

        {/* Verification gate ---------------------------------------------- */}
        {!isVerified && (
          <section className="rounded-xl border border-crimson/30 bg-crimson-soft p-6">
            <h2 className="text-lg font-semibold">{t("statusLabel")}</h2>
            <p className="mt-1 text-sm font-medium text-crimson">{t(`status.${status}`)}</p>
            <p className="mt-2 text-sm leading-6 text-muted-strong">{t("statusNote")}</p>
            <Link
              href="/verification"
              className="mt-4 inline-block rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-crimson-strong"
            >
              {t("startVerification")}
            </Link>
          </section>
        )}

        {isVerified && summary && counts && brief && (
          <>
            {/* Headline numbers ------------------------------------------ */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon="🏠"
                tone="blue"
                value={format.number(summary.listings_published)}
                label={t("kpi.liveListings")}
                delta={summary.listings_published - summary.listings_previous}
                caption={t("kpi.ofQuota", { used: summary.listings_active, max: plan.maxListings })}
                series={points.map((p) => p.listings_published)}
                href="/listings"
              />
              <StatCard
                icon="📥"
                tone="indigo"
                value={format.number(summary.leads_total)}
                label={t("kpi.leads")}
                delta={summary.leads_total - summary.leads_previous}
                caption={t("kpi.newLeads", { count: summary.leads_new })}
                series={points.map((p) => p.leads)}
                href="/leads"
              />
              <StatCard
                icon="⏱"
                tone={summary.response_rate >= 80 ? "green" : "orange"}
                value={`${summary.response_rate}%`}
                label={t("kpi.responseRate")}
                caption={t("kpi.responseRateHint")}
                series={points.map((p) => p.responses)}
                href="/leads"
              />
              <StatCard
                icon="⚠"
                tone={summary.leads_overdue > 0 ? "red" : "green"}
                value={format.number(summary.leads_overdue)}
                label={t("kpi.overdue")}
                caption={t("kpi.overdueHint")}
                invert
                href="/leads"
              />
            </div>

            {/* Performance + plan ---------------------------------------- */}
            <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
              <Panel title={t("perf.title", { count: days })} hint={t("perf.hint")}>
                <BarChart
                  labels={points.map((p) => shortDay(p.day))}
                  series={series}
                  emptyLabel={t("perf.empty")}
                  bucketLabel={(n) => t("perf.bucket", { count: n })}
                />
              </Panel>

              {/* `planLabel` lives in the `dashboard` namespace, not `plans` —
                  getting that wrong renders the literal key on the page. */}
              <Panel title={t("planLabel")}>
                <p className="text-xl font-bold">
                  {plan.productName ?? plan.name}
                  {plan.productName && <span className="ml-2 text-xs font-normal text-muted">{plan.name}</span>}
                </p>
                {plan.effectivePrice === 0 && (
                  <p className="mt-0.5 text-xs font-medium text-success">
                    {tp(partnerIdentityPublic ? "complimentary" : "complimentaryNeutral")}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted">{t("quotaLabel")}</span>
                  <span className="font-semibold tabular-nums">
                    {summary.listings_active}/{plan.maxListings}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface"
                  role="progressbar"
                  aria-valuenow={summary.listings_active}
                  aria-valuemin={0}
                  aria-valuemax={plan.maxListings}
                  aria-label={t("quotaLabel")}
                >
                  <div
                    className={`h-full rounded-full ${quotaPct >= 90 ? "bg-danger" : "bg-blue"}`}
                    style={{ width: `${quotaPct}%` }}
                  />
                </div>

                {/* The allowances the plan actually grants, from the same
                    engine that enforces them. */}
                <dl className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-surface px-3 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {t("plan.boostCredits")}
                    </dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums">{boostCredits}</dd>
                  </div>
                  <div className="rounded-lg bg-surface px-3 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {t("plan.vouchers")}
                    </dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums">{vouchers}</dd>
                  </div>
                </dl>

                <Link href="/plan" className="mt-4 block text-center text-xs font-semibold text-indigo hover:underline">
                  {t("plan.viewPlans")} →
                </Link>
                {plan.canUpgrade && (
                  <Link
                    href="/verification"
                    className="mt-4 block rounded-lg bg-crimson px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors duration-150 hover:bg-crimson-strong"
                  >
                    {tp("upgradeCta")}
                  </Link>
                )}
              </Panel>
            </div>

            {/* Brief + growth -------------------------------------------- */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title={t("brief.title")} bodyClassName="p-0 sm:p-0">
                {/* The AI Manager's sentence, when there is one. The list
                    below is unchanged either way — the paragraph explains it,
                    never replaces it. */}
                {aiBrief?.paragraph && (
                  <div className="border-b border-line bg-indigo-soft/40 px-5 py-4">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-indigo">
                      {manager?.avatar_path && <Image src={manager.avatar_path} alt="" width={22} height={22} unoptimized className="h-[22px] w-[22px] rounded-full object-cover" />}
                      ✦ {manager ? `${manager.name} · ` : ""}{t("brief.aiEyebrow")}
                    </p>
                    <p className="mt-1 text-sm leading-6">{aiBrief.paragraph}</p>
                  </div>
                )}
                {brief.allClear ? (
                  <p className="px-5 py-10 text-center text-sm font-medium text-success">
                    {t("brief.allClear")}
                  </p>
                ) : (
                  <ol className="divide-y divide-line">
                    {brief.actions.map((a, i) => (
                      <li key={a.key}>
                        <Link
                          href={a.href}
                          className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface"
                        >
                          <span
                            aria-hidden
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                              a.tone === "danger"
                                ? "bg-danger-soft text-danger"
                                : a.tone === "warning"
                                  ? "bg-warning-soft text-warning"
                                  : "bg-surface text-muted"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1 text-sm font-medium">
                            {t(`brief.actions.${a.key}`, { count: a.count })}
                          </span>
                          <span aria-hidden className="shrink-0 text-muted">→</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
                {/* Where the words came from, what is left this month, and
                    the one button that spends a task on purpose. */}
                <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-2.5 text-xs text-muted">
                  <span className="min-w-0">
                    {aiBrief?.paragraph
                      ? t("brief.aiCaption", { model: aiBrief.model ?? "AI" })
                      : t(`brief.rulesOnly.${aiBrief?.reason ?? "allClear"}` as never)}
                  </span>
                  <span className="flex items-center gap-3">
                    {aiQuota && (
                      <span className="tabular-nums">
                        {t("brief.quota", { remaining: aiQuota.remaining, total: aiQuota.monthly_allowance })}
                      </span>
                    )}
                    {!brief.allClear && (
                      <form action={regenerateBrief}>
                        <button
                          type="submit"
                          className="min-h-7 cursor-pointer rounded-md border border-line px-2.5 font-semibold text-muted transition-colors duration-150 hover:border-blue hover:text-blue"
                        >
                          {t("brief.regenerate")}
                        </button>
                      </form>
                    )}
                  </span>
                </footer>
              </Panel>

              <Panel
                title={t("growth.title")}
                action={
                  <Link href="/growth" className="text-xs font-semibold text-blue hover:underline">
                    {t("growth.seeAll")}
                  </Link>
                }
              >
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { k: "activated", v: growth?.activated ?? 0 },
                    { k: "pending", v: growth?.pending ?? 0 },
                    { k: "networkListings", v: growth?.network_listings ?? 0 },
                  ].map((cell) => (
                    <div key={cell.k} className="rounded-lg bg-surface px-2 py-3">
                      <dd className="text-2xl font-bold tabular-nums">{cell.v}</dd>
                      <dt className="mt-0.5 text-[11px] font-medium leading-tight text-muted">
                        {t(`growth.${cell.k}` as never)}
                      </dt>
                    </div>
                  ))}
                </dl>

                {nextReward && nextReward.remaining > 0 ? (
                  <div className="mt-4 rounded-lg border border-line p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {t("growth.nextReward")}
                    </p>
                    <p className="mt-1 text-sm font-medium">{nextReward.label}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-crimson"
                          style={{
                            width: `${Math.round(
                              ((nextReward.threshold - nextReward.remaining) /
                                Math.max(nextReward.threshold, 1)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        {nextReward.threshold - nextReward.remaining}/{nextReward.threshold}
                      </span>
                    </div>
                  </div>
                ) : (
                  growth?.code && (
                    <div className="mt-4 rounded-lg border border-line p-3 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {t("growth.yourCode")}
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold tracking-widest">{growth.code}</p>
                    </div>
                  )
                )}
              </Panel>
            </div>

            {/* Pipeline + recent inventory -------------------------------- */}
            <Panel
              title={t("pipeline.label")}
              action={
                <Link href="/listings" className="text-xs font-semibold text-blue hover:underline">
                  {t("growth.seeAll")}
                </Link>
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ["draft", counts.listingsDraft],
                  ["inReview", counts.listingsInReview],
                  ["live", counts.listingsPublished],
                  ["expiring", counts.listingsExpiring],
                  ["closed", counts.listingsClosed],
                ].map(([key, value]) => (
                  <Link
                    key={key as string}
                    href="/listings"
                    className="rounded-lg bg-surface px-3 py-3 transition-colors duration-150 hover:bg-blue-soft"
                  >
                    <p className="text-2xl font-bold tabular-nums">{value as number}</p>
                    <p className="mt-0.5 text-xs font-medium text-muted">
                      {t(`pipeline.${key as string}`)}
                    </p>
                  </Link>
                ))}
              </div>

              {recent.length > 0 && (
                <ul className="mt-4 divide-y divide-line border-t border-line">
                  {recent.map((l) => (
                    <li key={l.id}>
                      <Link
                        href="/listings"
                        className="flex items-center gap-3 py-2.5 transition-colors duration-150 hover:text-blue"
                      >
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            l.status === "published"
                              ? "bg-success-soft text-success"
                              : l.status === "pending_review"
                                ? "bg-warning-soft text-warning"
                                : "bg-surface text-muted"
                          }`}
                        >
                          {t(`pipelineStatus.${l.status}` as never)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.title}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted">
                          {l.price
                            ? format.number(Number(l.price), {
                                style: "currency",
                                currency: l.currency ?? "IDR",
                                maximumFractionDigits: 0,
                                notation: "compact",
                              })
                            : l.human_readable_id}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Modules ---------------------------------------------------- */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                {t("modules.label")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ModuleCard
                  href="/leads"
                  icon="📥"
                  title={t("modules.leads")}
                  desc={t("modules.leadsDesc")}
                  badge={counts.leadsUnanswered || undefined}
                />
                <ModuleCard
                  href="/listings"
                  icon="🏠"
                  title={t("modules.listings")}
                  desc={t("modules.listingsDesc", { inReview: counts.listingsInReview })}
                  meta={`${counts.listingsActive}/${plan.maxListings}`}
                />
                <ModuleCard
                  href="/requests"
                  icon="🤝"
                  title={t("modules.matchhub")}
                  desc={t("modules.matchhubDesc")}
                  meta={t("modules.matchhubCounts", {
                    requests: counts.mhRequests,
                    submissions: counts.mhSubmissions,
                  })}
                />
                <ModuleCard href="/profile" icon="👤" title={t("modules.profile")} desc={t("modules.profileDesc")} />
                <ModuleCard
                  href="/collab/pool"
                  icon="🔁"
                  title={t("modules.coMarketing")}
                  desc={t("modules.coMarketingDesc")}
                />
                {/* Opens the agent's public page on the marketplace — a
                    different origin, so a plain anchor rather than <Link>. */}
                {profile?.public_slug && marketplaceUrl ? (
                  <a
                    href={`${marketplaceUrl}/agent/${profile.public_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-line bg-card p-5 shadow-card transition-colors duration-150 hover:border-blue"
                  >
                    <span aria-hidden className="text-2xl">🌐</span>
                    <h3 className="mt-3 text-base font-semibold">{t("modules.landingPage")}</h3>
                    <p className="mt-1 text-sm text-muted">{t("modules.landingPageDesc")}</p>
                    <p className="mt-2 truncate text-xs text-blue">/agent/{profile.public_slug}</p>
                  </a>
                ) : (
                  <SoonCard icon="🌐" title={t("modules.landingPage")} desc={t("modules.landingPageDesc")} />
                )}
                <ModuleCard
                  href="/studio"
                  icon="✨"
                  title={t("modules.contentStudio")}
                  desc={t("modules.contentStudioDesc")}
                />
                <ModuleCard
                  href="/tasks"
                  icon="☑️"
                  title={t("modules.tasks")}
                  desc={t("modules.tasksDesc")}
                  badge={counts.tasksOverdue || undefined}
                  meta={t("modules.tasksMeta", { today: counts.tasksDueToday })}
                />
                <ModuleCard href="/ai" icon="✦" title={t("modules.aiWorkforce")} desc={t("modules.aiWorkforceDesc")} />
                <ModuleCard href="/card" icon="💳" title={t("modules.digitalCard")} desc={t("modules.digitalCardDesc")} />
                <ModuleCard href="/training" icon="🎓" title={t("modules.training")} desc={t("modules.trainingDesc")} />
              </div>
            </section>
          </>
        )}

        {isAdmin && (
          <Link
            href="/admin"
            className="inline-block rounded-lg border border-line bg-card px-5 py-2.5 text-sm font-semibold shadow-card transition-colors duration-150 hover:border-blue hover:text-blue"
          >
            {t("adminConsole")}
          </Link>
        )}
      </div>
    </AgentShell>
  );
}

function ModuleCard({
  href,
  icon,
  title,
  desc,
  badge,
  meta,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
  badge?: number;
  meta?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-line bg-card p-5 shadow-card transition-colors duration-150 hover:border-blue"
    >
      <div className="flex items-start justify-between gap-2">
        <span aria-hidden className="text-2xl">{icon}</span>
        {badge ? (
          <span className="rounded-full bg-crimson px-2 py-0.5 text-[11px] font-bold text-white">
            {badge}
          </span>
        ) : meta ? (
          <span className="text-xs font-medium tabular-nums text-muted">{meta}</span>
        ) : null}
      </div>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-snug text-muted">{desc}</p>
    </Link>
  );
}

function SoonCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-5 opacity-60">
      <span aria-hidden className="text-2xl">{icon}</span>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-snug text-muted">{desc}</p>
    </div>
  );
}
