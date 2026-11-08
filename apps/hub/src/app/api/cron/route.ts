import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { metaConfigured } from "@/lib/social/meta";
import { publishDuePosts } from "@/lib/social/publisher";
import { createServiceClient } from "@/lib/supabase/service";
import { getDashboard } from "@/lib/dashboard/brief";
import { getAiBrief } from "@/lib/ai/brief";
import { notify } from "@/lib/notifications";
import { embedPendingListings } from "@/lib/ai/embeddings";
import { linkHeroFor } from "@/lib/hero/link";
import { heroConfigured } from "@/lib/hero/client";

/**
 * The scheduler's single entry point.
 *
 * Until 7 Nov 2026 the hub had a `publish-due` route and nothing that ever
 * called it: the OpenNext worker had no scheduled handler, so scheduled posts
 * never published. `worker.js` now wraps the OpenNext handler with a
 * Cloudflare Cron Trigger that invokes THIS route in-process (no self-fetch,
 * which Workers refuse on their own custom domain) every 15 minutes.
 *
 * Every task is idempotent and short. A task that has nothing to do says so
 * rather than being skipped silently, so the cron's JSON is an honest log.
 *
 *   curl -X POST https://<hub>/api/cron -H "x-cron-secret: $CRON_SECRET"
 *   curl -X POST https://<hub>/api/cron?only=social_publish_due …
 */

export const dynamic = "force-dynamic";

type TaskResult = Record<string, unknown>;
type Task = { name: string; every: "15m" | "daily"; run: () => Promise<TaskResult> };

const TASKS: Task[] = [
  {
    name: "social_publish_due",
    every: "15m",
    run: async () => {
      if (!metaConfigured()) return { skipped: "meta_not_configured" };
      return publishDuePosts(10);
    },
  },
  {
    /**
     * The AI Manager writes the morning brief before the agent opens the app,
     * so the first thing they see is already there. Audience = verified,
     * recently active, feature on (ai_brief_audience); each agent's counts are
     * computed with the service client scoped to them; the cache makes the
     * dashboard's own call a no-op afterwards. Capped per tick so a cron can
     * never spend more than ~200 tasks in one go.
     */
    name: "ai_daily_brief",
    every: "daily",
    run: async () => {
      const service = createServiceClient();
      const { data: audience, error } = await service.rpc("ai_brief_audience", { p_days: 14 });
      if (error) return { error: error.message };
      let written = 0, rules = 0, cached = 0;
      for (const a of ((audience ?? []) as { user_id: string; locale: string; display_name: string | null }[]).slice(0, 200)) {
        const locale = ["id", "en", "ms"].includes(a.locale) ? a.locale : "id";
        const t = await getTranslations({ locale, namespace: "dashboard" });
        const { counts, brief } = await getDashboard({ client: service, agentId: a.user_id });
        const res = await getAiBrief({
          userId: a.user_id, locale, firstName: (a.display_name ?? "").split(" ")[0], brief, counts,
          actionLabels: brief.actions.map((x) => t(`brief.actions.${x.key}`, { count: x.count })),
          client: service,
        });
        if (res.fromCache) cached++; else if (res.source === "ai") written++; else rules++;
      }
      return { audience: audience?.length ?? 0, written, rules, cached };
    },
  },
  {
    /**
     * The Secretary's nudge: a lead past its first-response deadline with no
     * reply gets its agent a notification, at most once every 12 hours per
     * lead, for the lead's first week. Writes with the service role; the
     * agent-insert policy on lead_events does not apply to it.
     */
    name: "lead_nudges",
    every: "15m",
    run: async () => {
      const service = createServiceClient();
      const { data: overdue, error } = await service
        .from("leads")
        .select("id, human_readable_id, agent_id")
        .is("first_responded_at", null)
        .lt("first_response_due", new Date().toISOString())
        .gt("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
        .not("status", "in", '("closed_won","closed_lost","spam")')
        .limit(200);
      if (error) return { error: error.message };
      let nudged = 0, recent = 0;
      const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
      for (const lead of overdue ?? []) {
        const { count } = await service
          .from("lead_events")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id)
          .eq("kind", "nudge.sent")
          .gt("created_at", since);
        if ((count ?? 0) > 0) { recent++; continue; }
        await notify({ userId: lead.agent_id, kind: "lead_overdue", payload: { ref: lead.human_readable_id }, href: "/leads" });
        await service.from("lead_events").insert({ lead_id: lead.id, kind: "nudge.sent", detail: { by: "cron" }, actor_id: null });
        nudged++;
      }
      return { overdue: overdue?.length ?? 0, nudged, already_nudged: recent };
    },
  },
  {
    /** Embeddings for the matcher: published listings, once per text version, 20 per tick. */
    name: "listing_embeddings",
    every: "15m",
    run: () => embedPendingListings(),
  },
  {
    /**
     * Reminders: a task due within the hour (or just overdue) and a lead
     * viewing starting within two hours — each reminded exactly once, stamped
     * on the row.
     */
    name: "reminders",
    every: "15m",
    run: async () => {
      const service = createServiceClient();
      const soon = new Date(Date.now() + 60 * 60_000).toISOString();
      const { data: tasks } = await service
        .from("agent_tasks")
        .select("id, agent_id, title")
        .eq("status", "open")
        .is("reminder_sent_at", null)
        .lte("due_at", soon)
        .limit(200);
      let taskReminders = 0;
      for (const task of tasks ?? []) {
        await notify({ userId: task.agent_id, kind: "task_due", payload: { ref: task.title.slice(0, 80) }, href: "/tasks" });
        await service.from("agent_tasks").update({ reminder_sent_at: new Date().toISOString() }).eq("id", task.id);
        taskReminders++;
      }
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: viewings } = await service
        .from("viewing_appointments")
        .select("id, human_readable_id, proposed_date, proposed_time, lead_id, leads (agent_id)")
        .not("lead_id", "is", null)
        .eq("status", "confirmed")
        .is("reminder_sent_at", null)
        .gte("proposed_date", todayStr)
        .limit(200);
      let viewingReminders = 0;
      for (const v of viewings ?? []) {
        const at = Date.parse(`${v.proposed_date}T${v.proposed_time ?? "09:00"}:00+08:00`);
        if (Number.isNaN(at) || at - Date.now() > 2 * 3_600_000) continue;
        const lead = (Array.isArray(v.leads) ? v.leads[0] : v.leads) as { agent_id: string } | null;
        if (!lead) continue;
        await notify({ userId: lead.agent_id, kind: "viewing_soon", payload: { ref: v.human_readable_id }, href: "/tasks" });
        await service.from("viewing_appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", v.id);
        viewingReminders++;
      }
      return { taskReminders, viewingReminders };
    },
  },
  {
    /**
     * Nightly Hero re-check for every linked or stale account. A transient
     * error keeps the last state; a confirmed "not found" lets the benefits
     * run out after the grace period. Nothing is deleted.
     */
    name: "hero_recheck",
    every: "daily",
    run: async () => {
      if (!heroConfigured()) return { skipped: "HERO_API_KEY missing" };
      const service = createServiceClient();
      const { data: links } = await service.from("hero_links").select("user_id, status").in("status", ["linked", "stale"]).limit(500);
      const tally: Record<string, number> = {};
      for (const l of links ?? []) {
        const out = await linkHeroFor(l.user_id, service);
        tally[out.kind] = (tally[out.kind] ?? 0) + 1;
      }
      return { checked: links?.length ?? 0, ...tally };
    },
  },
  {
    /** A checkout nobody finished within its window is closed (E11). Idempotent, service-only RPC. */
    name: "payment_expire",
    every: "15m",
    run: async () => {
      const service = createServiceClient();
      const { data, error } = await service.rpc("payment_intents_expire");
      if (error) return { error: error.message };
      return { expired: Number(data ?? 0) };
    },
  },
];

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.SOCIAL_CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("x-cron-secret") === secret;
}

async function tick(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const only = url.searchParams.get("only");
  const cadence = url.searchParams.get("cadence"); // "15m" | "daily" | null = all

  const started = Date.now();
  const results: Record<string, TaskResult> = {};
  for (const task of TASKS) {
    if (only && task.name !== only) continue;
    if (cadence && task.every !== cadence) continue;
    const t0 = Date.now();
    try {
      results[task.name] = { ...(await task.run()), ms: Date.now() - t0 };
    } catch (e) {
      console.error(`[cron:${task.name}]`, e instanceof Error ? e.message : e);
      results[task.name] = { error: e instanceof Error ? e.message.slice(0, 200) : "failed", ms: Date.now() - t0 };
    }
  }
  return NextResponse.json({ at: new Date().toISOString(), ms: Date.now() - started, results });
}

export async function POST(request: Request) {
  return tick(request);
}
export async function GET(request: Request) {
  return tick(request);
}
