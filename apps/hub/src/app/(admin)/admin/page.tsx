import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/authz";

/**
 * Admin home.
 *
 * This used to redirect straight to /admin/agents, which meant an admin landed
 * on one tab and had to guess which of the others had work in it. Same
 * principle as the agent's Brief Harian: answer "what needs me now" before
 * showing anything else.
 *
 * Queues first, ordered by how much a delay costs: a listing stuck in
 * moderation is an agent's income waiting, a violation report is a trust
 * problem ageing, an unverified agent cannot work at all.
 */

type Queue = {
  key: string;
  count: number;
  href: string;
  /** Non-zero here means someone is blocked, not merely informed. */
  blocking: boolean;
};

async function getQueues() {
  const supabase = await createClient();

  const [listings, agents, requests, reports, published, activeAgents, audit] =
    await Promise.all([
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("agent_status", "under_review"),
      supabase
        .from("property_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending_admin_approval", "resubmitted"]),
      supabase
        .from("violation_reports")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "under_review"]),
      supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("agent_status", "verified"),
      supabase
        .from("audit_logs")
        // Explicit FK hint: actor_id points at auth.users, so PostgREST cannot
        // infer the profiles embed on its own.
        .select("action, created_at, profiles:actor_id(display_name)")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const queues: Queue[] = [
    { key: "listings", count: listings.count ?? 0, href: "/admin/listings", blocking: true },
    { key: "agents", count: agents.count ?? 0, href: "/admin/agents", blocking: true },
    { key: "requests", count: requests.count ?? 0, href: "/admin/requests", blocking: true },
    { key: "reports", count: reports.count ?? 0, href: "/admin/reports", blocking: false },
  ];

  return {
    queues,
    stats: {
      published: published.count ?? 0,
      agents: activeAgents.count ?? 0,
    },
    recent: (audit.data ?? []).map((r) => {
      const p = (r as { profiles?: unknown }).profiles;
      const actor = Array.isArray(p) ? p[0] : p;
      return {
        action: r.action as string,
        created_at: r.created_at as string,
        actorName: (actor as { display_name?: string } | null)?.display_name ?? null,
      };
    }),
  };
}

export default async function AdminHome() {
  await requireAdmin();
  const t = await getTranslations("adminHome");
  const locale = await getLocale();
  // Absolute Jakarta time, not relative — relative time needs a "now" and would
  // make this page non-deterministic to render.
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
  const { queues, stats, recent } = await getQueues();

  const waiting = queues.reduce((n, q) => n + q.count, 0);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">
        {waiting > 0 ? t("summary", { count: waiting }) : t("allClear")}
      </p>

      {/* Queues ---------------------------------------------------------- */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        {t("queues")}
      </h2>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {queues.map((q) => (
          <Link
            key={q.key}
            href={q.href}
            className={`rounded-xl border p-5 transition hover:border-crimson ${
              q.count === 0
                ? "border-line"
                : q.blocking
                  ? "border-danger/40 bg-danger/5"
                  : "border-warning/40 bg-warning/5"
            }`}
          >
            <p className="text-3xl font-bold">{q.count}</p>
            <p className="mt-1 text-sm font-medium">{t(`queue.${q.key}`)}</p>
            <p className="mt-1 text-xs text-muted">{t(`queueHint.${q.key}`)}</p>
          </Link>
        ))}
      </section>

      {/* Platform snapshot ------------------------------------------------ */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        {t("snapshot")}
      </h2>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-5">
          <p className="text-2xl font-bold">{stats.published}</p>
          <p className="mt-1 text-sm text-muted">{t("stat.published")}</p>
        </div>
        <div className="rounded-xl border border-line p-5">
          <p className="text-2xl font-bold">{stats.agents}</p>
          <p className="mt-1 text-sm text-muted">{t("stat.verifiedAgents")}</p>
        </div>
      </section>

      {/* Recent activity -------------------------------------------------- */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        {t("recent")}
      </h2>
      {!recent.length ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted">
          {t("noActivity")}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {recent.map((r, i) => (
            <li key={`${r.created_at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 px-4 py-3 text-sm">
              <code className="font-mono text-xs">{r.action}</code>
              <span className="text-muted">{r.actorName ?? t("systemActor")}</span>
              <span className="ml-auto text-xs text-muted">
                {when.format(new Date(r.created_at))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3">
        <Link href="/admin/audit" className="text-sm font-semibold text-crimson hover:underline">
          {t("viewAudit")} →
        </Link>
      </p>
    </>
  );
}
