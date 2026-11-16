import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { AgentShell } from "@/components/layout/agent-shell";
import { CommandHeader } from "@/components/ui/command-header";
import { StatCluster } from "@/components/ui/stat-cluster";
import { EnvironmentBadge } from "@/components/ui/environment-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { StageStrip } from "@/components/collab/stage-strip";
import { STAGE_KEYS, TABS, isTabKey, stageIndex, stageOf, type TabKey } from "@/lib/requests/stages";
import { agentHasAccess } from "@/lib/agents/access";

/**
 * The requesting agent's requirements (MatchHub 2.0 list). Same query and
 * the same rows as before; the table becomes cards with a stage strip, and
 * tabs group the 23 statuses into stages. "All" is the default so nothing
 * disappears compared with the old table.
 */

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("requests");
  const tc = await getTranslations("common");

  const [{ data: rows }, hasAccess] = await Promise.all([
    supabase
      .from("property_requests")
      .select("id, human_readable_id, title, city, country_code, transaction_type, status, created_at")
      .eq("requesting_agent_id", user.id)
      .order("created_at", { ascending: false }),
    agentHasAccess(supabase),
  ]);

  // Named for its history: since 00129 this is "may use MatchHub", not the badge.
  const verified = hasAccess;
  const all = rows ?? [];
  const tab: TabKey = isTabKey(sp.tab) ? sp.tab : "all";
  const stages = TABS[tab];
  const shown = stages ? all.filter((r) => (stages as readonly string[]).includes(stageOf(r.status))) : all;

  const countIn = (keys: readonly string[]) => all.filter((r) => keys.includes(stageOf(r.status))).length;
  const stageLabels = Object.fromEntries(STAGE_KEYS.map((k) => [k, t(`stages.${k}` as never)])) as Record<(typeof STAGE_KEYS)[number], string>;

  return (
    <AgentShell wide>
      <CommandHeader className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="command-muted mt-1 text-sm">{t("intro")}</p>
        </div>
        <StatCluster
          items={[
            { value: countIn(TABS.open), label: t("band.open") },
            { value: countIn(TABS.approval), label: t("band.awaitingApproval") },
            { value: countIn(TABS.client), label: t("band.withClient") },
          ]}
        />
      </CommandHeader>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <EnvironmentBadge label={tc("environment.staging")} />
        {verified && (
          <Link href="/requests/new" className={`${buttonClass("primary", "min-h-10")} ml-auto`}>
            {t("newRequest")}
          </Link>
        )}
      </div>

      {!verified && (
        <p className="mb-6 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
          {t("verifyFirst")}{" "}
          <Link href="/verification" className="font-medium text-crimson">{t("verifyLink")}</Link>
        </p>
      )}

      {/* Tabs: links, so the filter is a URL and the back button works. */}
      <nav aria-label={t("tabs.label")} className="mb-4 flex w-max max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-card p-1">
        {(Object.keys(TABS) as TabKey[]).map((k) => (
          <Link
            key={k}
            href={k === "all" ? "/requests" : `/requests?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-sm leading-9 ${
              tab === k ? "bg-blue-soft font-semibold text-blue" : "text-muted hover:text-foreground"
            }`}
          >
            {t(`tabs.${k}` as never)}
          </Link>
        ))}
      </nav>

      {!shown.length ? (
        <EmptyState icon="✦" title={all.length ? t("emptyTab") : t("empty")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {shown.map((r) => {
            const idx = stageIndex(r.status);
            return (
              <li key={r.id} className="min-w-0">
                <Link
                  href={`/requests/${r.id}`}
                  className="block rounded-2xl border border-line bg-card p-4 shadow-card transition-colors duration-150 hover:border-blue sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-mono text-[11px] text-muted">
                      {r.human_readable_id} · {t(`transaction.${r.transaction_type}` as never)}
                    </p>
                    <Badge tone={r.status === "successfully_closed" ? "success" : idx === 1 ? "warning" : idx === 5 ? "neutral" : "info"}>
                      {t(`status.${r.status}` as never)}
                    </Badge>
                  </div>
                  <h3 className="mt-2 font-semibold leading-snug">{r.title}</h3>
                  <p className="mt-0.5 text-sm text-muted">{r.city}, {r.country_code}</p>
                  <div className="mt-3">
                    <StageStrip current={idx} labels={stageLabels} closedOk={r.status === "successfully_closed"} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AgentShell>
  );
}
