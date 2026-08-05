import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { MAX_ACTIVE_LISTINGS } from "@/config/quotas";

/**
 * The agent OS home (§20 agent dashboard). MatchHub is deliberately ONE
 * module card among peers here — the platform is the operating system, not a
 * co-broke tool with extras (product decision, Kamal, 4 Aug 2026). New
 * modules (viewings, tasks, projects, content studio) slot in as cards.
 */

const STATUS_KEYS = [
  "draft", "email_verification_pending", "mobile_verification_pending",
  "documents_pending", "under_review", "additional_information_required",
  "verified", "rejected", "suspended", "temporarily_restricted", "banned",
  "expired_licence", "archived",
] as const;

type Counts = {
  leadsNew: number;
  leadsUnanswered: number;
  leadsOverdue: number;
  listingsPublished: number;
  listingsInReview: number;
  listingsRejected: number;
  listingsActive: number;
  mhRequests: number;
  mhSubmissions: number;
};

async function getCounts(): Promise<Counts> {
  const supabase = await createClient();

  // head-count queries only — the dashboard must stay cheap (§24). RLS scopes
  // every one of these to the signed-in agent.
  const [leadsNew, leadsUnanswered, leadsOverdue, pub, rev, rej, act, reqs, subs] =
    await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("first_responded_at", null)
        .not("status", "in", '("closed_won","closed_lost","spam")'),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("first_responded_at", null)
        .lt("first_response_due", new Date().toISOString()),
      supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "rejected"),
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "pending_review", "published"]),
      supabase.from("property_requests").select("id", { count: "exact", head: true }),
      supabase.from("property_submissions").select("id", { count: "exact", head: true }),
    ]);

  return {
    leadsNew: leadsNew.count ?? 0,
    leadsUnanswered: leadsUnanswered.count ?? 0,
    leadsOverdue: leadsOverdue.count ?? 0,
    listingsPublished: pub.count ?? 0,
    listingsInReview: rev.count ?? 0,
    listingsRejected: rej.count ?? 0,
    listingsActive: act.count ?? 0,
    mhRequests: reqs.count ?? 0,
    mhSubmissions: subs.count ?? 0,
  };
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    supabase.from("profiles").select("display_name, agent_status").eq("id", user.id).single(),
    supabase.rpc("is_platform_admin"),
  ]);

  const t = await getTranslations("dashboard");

  const status = (STATUS_KEYS as readonly string[]).includes(profile?.agent_status ?? "")
    ? (profile!.agent_status as (typeof STATUS_KEYS)[number])
    : "draft";
  const isVerified = status === "verified";
  const counts = isVerified
    ? await getCounts()
    : ({
        leadsNew: 0, leadsUnanswered: 0, leadsOverdue: 0,
        listingsPublished: 0, listingsInReview: 0, listingsRejected: 0,
        listingsActive: 0, mhRequests: 0, mhSubmissions: 0,
      } satisfies Counts);

  const needsAttention =
    counts.leadsOverdue > 0 || counts.leadsNew > 0 || counts.listingsRejected > 0;

  return (
    <AgentShell wide>
      <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-muted">
        {t("welcome", { name: profile?.display_name ?? user.email ?? "" })}
      </p>

      {!isVerified && (
        <section className="mb-6 rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-2 text-sm font-medium text-muted">{t("statusLabel")}</h2>
          <span className="inline-block rounded-full bg-crimson-soft px-3 py-1 text-sm font-semibold text-crimson">
            {t(`status.${status}`)}
          </span>
          <p className="mt-3 text-sm leading-6 text-muted">{t("statusNote")}</p>
          <Link
            href="/verification"
            className="mt-4 inline-block rounded-lg bg-crimson px-5 py-2.5 text-sm font-semibold text-white hover:bg-crimson-strong"
          >
            {t("startVerification")}
          </Link>
        </section>
      )}

      {isVerified && (
        <>
          {/* Today strip: what needs the agent NOW. */}
          <section aria-label={t("today.label")} className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              href="/leads"
              className={`rounded-xl border p-4 ${
                counts.leadsOverdue > 0 ? "border-danger/50 bg-danger/5" : "border-line"
              }`}
            >
              <p className="text-3xl font-bold">{counts.leadsOverdue}</p>
              <p className="mt-1 text-xs font-medium text-muted">{t("today.overdue")}</p>
            </Link>
            <Link
              href="/leads"
              className={`rounded-xl border p-4 ${
                counts.leadsNew > 0 ? "border-warning/50 bg-warning/5" : "border-line"
              }`}
            >
              <p className="text-3xl font-bold">{counts.leadsNew}</p>
              <p className="mt-1 text-xs font-medium text-muted">{t("today.newLeads")}</p>
            </Link>
            <Link href="/listings" className="rounded-xl border border-line p-4">
              <p className="text-3xl font-bold">{counts.listingsPublished}</p>
              <p className="mt-1 text-xs font-medium text-muted">{t("today.live")}</p>
            </Link>
            <Link
              href="/listings"
              className={`rounded-xl border p-4 ${
                counts.listingsRejected > 0 ? "border-warning/50 bg-warning/5" : "border-line"
              }`}
            >
              <p className="text-3xl font-bold">{counts.listingsRejected}</p>
              <p className="mt-1 text-xs font-medium text-muted">{t("today.rejected")}</p>
            </Link>
          </section>

          {!needsAttention && (
            <p className="mb-8 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
              {t("allClear")}
            </p>
          )}

          {/* Module cards — the OS surface. Every future module lands here. */}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {t("modules.label")}
          </h2>
          <section className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/leads"
              className="group rounded-xl border border-line p-5 transition hover:border-crimson"
            >
              <div className="flex items-start justify-between">
                <span aria-hidden className="text-2xl">📥</span>
                {counts.leadsUnanswered > 0 && (
                  <span className="rounded-full bg-crimson px-2 py-0.5 text-xs font-bold text-white">
                    {counts.leadsUnanswered}
                  </span>
                )}
              </div>
              <h3 className="mt-3 font-semibold group-hover:text-crimson">{t("modules.leads")}</h3>
              <p className="mt-1 text-sm text-muted">{t("modules.leadsDesc")}</p>
            </Link>

            <Link
              href="/listings"
              className="group rounded-xl border border-line p-5 transition hover:border-crimson"
            >
              <div className="flex items-start justify-between">
                <span aria-hidden className="text-2xl">🏠</span>
                <span className="text-xs font-medium text-muted">
                  {t("modules.listingsQuota", { active: counts.listingsActive, max: MAX_ACTIVE_LISTINGS })}
                </span>
              </div>
              <h3 className="mt-3 font-semibold group-hover:text-crimson">{t("modules.listings")}</h3>
              <p className="mt-1 text-sm text-muted">
                {t("modules.listingsDesc", { inReview: counts.listingsInReview })}
              </p>
            </Link>

            <Link
              href="/requests"
              className="group rounded-xl border border-line p-5 transition hover:border-crimson"
            >
              <div className="flex items-start justify-between">
                <span aria-hidden className="text-2xl">🤝</span>
                <span className="text-xs font-medium text-muted">
                  {t("modules.matchhubCounts", {
                    requests: counts.mhRequests,
                    submissions: counts.mhSubmissions,
                  })}
                </span>
              </div>
              <h3 className="mt-3 font-semibold group-hover:text-crimson">
                {t("modules.matchhub")}
              </h3>
              <p className="mt-1 text-sm text-muted">{t("modules.matchhubDesc")}</p>
            </Link>

            <Link
              href="/profile"
              className="group rounded-xl border border-line p-5 transition hover:border-crimson"
            >
              <span aria-hidden className="text-2xl">👤</span>
              <h3 className="mt-3 font-semibold group-hover:text-crimson">{t("modules.profile")}</h3>
              <p className="mt-1 text-sm text-muted">{t("modules.profileDesc")}</p>
            </Link>

            {/* Coming next in the OS — visible so agents know the direction. */}
            <div className="rounded-xl border border-dashed border-line p-5 opacity-70">
              <span aria-hidden className="text-2xl">🗓️</span>
              <h3 className="mt-3 font-semibold">{t("modules.viewings")}</h3>
              <p className="mt-1 text-sm text-muted">{t("modules.comingSoon")}</p>
            </div>
            <div className="rounded-xl border border-dashed border-line p-5 opacity-70">
              <span aria-hidden className="text-2xl">✨</span>
              <h3 className="mt-3 font-semibold">{t("modules.contentStudio")}</h3>
              <p className="mt-1 text-sm text-muted">{t("modules.comingSoon")}</p>
            </div>
          </section>
        </>
      )}

      {isAdmin && (
        <Link
          href="/admin"
          className="mt-8 inline-block rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-crimson hover:text-crimson"
        >
          {t("adminConsole")}
        </Link>
      )}
    </AgentShell>
  );
}
