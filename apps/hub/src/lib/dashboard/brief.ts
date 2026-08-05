import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Dashboard data + the rules-only Brief Harian.
 *
 * "Rules-only" is deliberate, not a placeholder: the ranked action list is the
 * part that changes what an agent does in the next ten minutes, and it needs
 * no model at all. AI prose wraps this later (see
 * docs/module-ai-agent-dashboard.md §3) and degrades back to exactly this when
 * a quota is exhausted.
 *
 * Everything here is a head-count query scoped by RLS to the signed-in agent,
 * so the page stays cheap (§24).
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

/** Jakarta time decides the greeting — the agent's day, not the server's. */
function jakartaHour(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? 9);
}

export async function getDashboard(): Promise<{
  counts: DashboardCounts;
  brief: Brief;
}> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const expiringIso = new Date(Date.now() + EXPIRING_DAYS * 86_400_000).toISOString();

  const openLeadStatuses = '("closed_won","closed_lost","spam")';

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
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("first_responded_at", null)
      .not("status", "in", openLeadStatuses),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("first_responded_at", null)
      .lt("first_response_due", nowIso),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .lt("expires_at", expiringIso)
      .gt("expires_at", nowIso),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .in("status", ["sold", "rented"]),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .in("status", ["draft", "pending_review", "published"]),
    supabase.from("property_requests").select("id", { count: "exact", head: true }),
    supabase.from("property_submissions").select("id", { count: "exact", head: true }),
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
  };

  // Priority order is the product decision: a client waiting beats everything,
  // then work that will be lost if ignored, then work that is merely pending.
  const candidates: BriefAction[] = [
    { key: "overdueLeads", count: counts.leadsOverdue, href: "/leads", tone: "danger" },
    { key: "newLeads", count: counts.leadsNew, href: "/leads", tone: "warning" },
    { key: "expiringListings", count: counts.listingsExpiring, href: "/listings", tone: "warning" },
    { key: "rejectedListings", count: counts.listingsRejected, href: "/listings", tone: "warning" },
    { key: "draftListings", count: counts.listingsDraft, href: "/listings", tone: "normal" },
    { key: "inReviewListings", count: counts.listingsInReview, href: "/listings", tone: "normal" },
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
