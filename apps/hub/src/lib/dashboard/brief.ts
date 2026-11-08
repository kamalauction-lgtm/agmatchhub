import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Dashboard data + the rules-only Brief Harian.
 *
 * "Rules-only" is deliberate, not a placeholder: the ranked action list is the
 * part that changes what an agent does in the next ten minutes, and it needs
 * no model at all. The AI Manager (lib/ai/brief.ts) writes a paragraph OVER
 * this list and degrades back to exactly this when a quota is exhausted.
 *
 * Everything here is a head-count query scoped by RLS to the signed-in agent,
 * so the page stays cheap (§24).
 *
 * SCOPE, FOR THE CRON
 *   The morning cron writes briefs for many agents with the service client,
 *   which RLS does not scope. Pass `{ client, agentId }` and every query adds
 *   the owner filter explicitly. Without a scope, behaviour is unchanged: the
 *   caller's own session, RLS does the scoping.
 *
 * TODO(perf): if this grows past ~15 counts, fold it into one SECURITY DEFINER
 * RPC returning a single row rather than adding more round trips.
 */

const EXPIRING_DAYS = 7;

export type DashboardCounts = {
  leadsNew: number;
  leadsUnanswered: number;
  leadsOverdue: number;
  listingsDraft: number;
  listingsInReview: number;
  listingsPublished: number;
  listingsRejected: number;
  listingsExpiring: number;
  listingsClosed: number;
  listingsActive: number;
  mhRequests: number;
  mhSubmissions: number;
  tasksOverdue: number;
  tasksDueToday: number;
};

/** One thing the agent should do, most urgent first. */
export type BriefAction = {
  /** Translation key under `dashboard.brief.actions.` */
  key: string;
  count: number;
  href: string;
  tone: "danger" | "warning" | "normal";
};

export type Brief = {
  /** Translation key under `dashboard.brief.greeting.` */
  greetingKey: "morning" | "afternoon" | "evening";
  actions: BriefAction[];
  /** True when nothing needs the agent right now. */
  allClear: boolean;
};

export type DashboardScope = { client: SupabaseClient; agentId: string };

/** Jakarta time decides the greeting — the agent's day, not the server's. */
function jakartaHour(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? 9);
}

export async function getDashboard(scope?: DashboardScope): Promise<{
  counts: DashboardCounts;
  brief: Brief;
}> {
  const supabase = scope?.client ?? (await createClient());
  const nowIso = new Date().toISOString();
  const expiringIso = new Date(Date.now() + EXPIRING_DAYS * 86_400_000).toISOString();

  const openLeadStatuses = '("closed_won","closed_lost","spam")';

  // Head-count query on a table, owner-filtered only when a scope is given.
  const count = (table: string, ownerColumn: string) => {
    const q = supabase.from(table).select("id", { count: "exact", head: true });
    return scope ? q.eq(ownerColumn, scope.agentId) : q;
  };
  const leads = () => count("leads", "agent_id");
  const listings = () => count("listings", "agent_id");
  const tasks = () => count("agent_tasks", "agent_id").eq("status", "open");
  const endOfDayIso = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();

  const [
    leadsNew,
    leadsUnanswered,
    leadsOverdue,
    lDraft,
    lReview,
    lPublished,
    lRejected,
    lExpiring,
    lClosed,
    lActive,
    reqs,
    subs,
    tOverdue,
    tToday,
  ] = await Promise.all([
    leads().eq("status", "new"),
    leads().is("first_responded_at", null).not("status", "in", openLeadStatuses),
    leads().is("first_responded_at", null).lt("first_response_due", nowIso),
    listings().eq("status", "draft"),
    listings().eq("status", "pending_review"),
    listings().eq("status", "published"),
    listings().eq("status", "rejected"),
    listings().eq("status", "published").lt("expires_at", expiringIso).gt("expires_at", nowIso),
    listings().in("status", ["sold", "rented"]),
    listings().in("status", ["draft", "pending_review", "published"]),
    count("property_requests", "requesting_agent_id"),
    count("property_submissions", "supply_agent_id"),
    tasks().lt("due_at", nowIso),
    tasks().gte("due_at", nowIso).lte("due_at", endOfDayIso),
  ]);

  const counts: DashboardCounts = {
    leadsNew: leadsNew.count ?? 0,
    leadsUnanswered: leadsUnanswered.count ?? 0,
    leadsOverdue: leadsOverdue.count ?? 0,
    listingsDraft: lDraft.count ?? 0,
    listingsInReview: lReview.count ?? 0,
    listingsPublished: lPublished.count ?? 0,
    listingsRejected: lRejected.count ?? 0,
    listingsExpiring: lExpiring.count ?? 0,
    listingsClosed: lClosed.count ?? 0,
    listingsActive: lActive.count ?? 0,
    mhRequests: reqs.count ?? 0,
    mhSubmissions: subs.count ?? 0,
    tasksOverdue: tOverdue.count ?? 0,
    tasksDueToday: tToday.count ?? 0,
  };

  // Priority order is the product decision: a client waiting beats everything,
  // then work that will be lost if ignored, then work that is merely pending.
  const candidates: BriefAction[] = [
    { key: "overdueLeads", count: counts.leadsOverdue, href: "/leads", tone: "danger" },
    { key: "overdueTasks", count: counts.tasksOverdue, href: "/tasks", tone: "danger" },
    { key: "newLeads", count: counts.leadsNew, href: "/leads", tone: "warning" },
    { key: "expiringListings", count: counts.listingsExpiring, href: "/listings", tone: "warning" },
    { key: "rejectedListings", count: counts.listingsRejected, href: "/listings", tone: "warning" },
    { key: "draftListings", count: counts.listingsDraft, href: "/listings", tone: "normal" },
    { key: "inReviewListings", count: counts.listingsInReview, href: "/listings", tone: "normal" },
    { key: "dueTasks", count: counts.tasksDueToday, href: "/tasks", tone: "normal" },
  ];

  const actions = candidates.filter((a) => a.count > 0).slice(0, 3);
  const hour = jakartaHour();

  return {
    counts,
    brief: {
      greetingKey: hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening",
      actions,
      allClear: actions.length === 0,
    },
  };
}
