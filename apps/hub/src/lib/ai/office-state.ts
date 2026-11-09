import {
  roleAccess,
  roleEngine,
  type AccessContext,
  type Provider,
  type RoleAccess,
  type RoleEngine,
  type WorkforceModel,
  type WorkforceRole,
} from "./workforce-status-rules";

/**
 * AI Live Office — the one place that decides what a character is DOING,
 * from backend rows only. Pure (no database, no env, no clock of its own) so
 * it is unit-tested and the scene merely draws what comes back.
 *
 * WHAT IS TRUE AND WHAT IS NOT
 *   · A job row (`ai_jobs`) is written AFTER a feature ran — synchronously,
 *     while the agent waited on the screen. There is no queue and no "running"
 *     row, so no character is ever shown "working right now" from job data.
 *     What we can say honestly: it finished a job minutes ago (celebrate), it
 *     worked today (at the desk), it has not been asked today (idle).
 *   · `status = 'denied' / no_provider` means the deterministic floor answered.
 *     That is still real work for the agent, labelled "rules".
 *   · "Waiting for you" is the one genuinely pending state: an open task the
 *     AI proposed (`agent_tasks.source` ai_manager | task_extract | secretary)
 *     that the agent has not done or dismissed.
 *   · Several roles share one engine feature (three roles run `listing_copy`).
 *     Jobs are attributed to every role on that feature, and the inspector
 *     says so, rather than inventing per-role splits.
 *   · Planned roles never animate as working. Unverified agents see the whole
 *     office offline.
 */

export type JobRow = {
  feature: string;
  status: "ok" | "degraded" | "error" | "denied";
  denied_reason: string | null;
  created_at: string;
  latency_ms: number | null;
  input_ref_type: string | null;
  input_ref_id: string | null;
};

export type TaskRow = {
  id: string;
  title: string;
  source: "manual" | "ai_manager" | "secretary" | "task_extract";
  status: "open" | "done" | "dismissed";
  due_at: string | null;
  kind: string;
  lead_id: string | null;
  listing_id: string | null;
};

export type PersonaRow = {
  role_key: string;
  country_code: string | null;
  name: string;
  avatar_path: string | null;
  portrait_path: string | null;
};

export type RoleRow = WorkforceRole & {
  category: string;
  sort: number;
  name: Record<string, string>;
};

export type WorkerState =
  | "planned"     // no screen yet — never animates as working
  | "offline"     // the agent is not verified, so nothing opens
  | "idle"        // available, not asked today
  | "active"      // ran at least once today
  | "finished"    // ran within the last few minutes — a short celebration
  | "attention"   // proposed work is waiting for the agent
  | "error";      // the most recent run failed

export type PendingTask = { id: string; title: string; dueAt: string | null; kind: string; href: string };

export type Worker = {
  key: string;
  category: string;
  persona: string;
  role: string;
  avatar: string | null;
  portrait: string | null;
  access: RoleAccess;
  engine: RoleEngine;
  feature: string | null;
  /** Other role keys that run on the same engine feature. */
  sharedWith: string[];
  state: WorkerState;
  lastAt: string | null;
  lastStatus: JobRow["status"] | null;
  lastReason: string | null;
  counts7d: { ok: number; degraded: number; error: number; denied: number };
  pending: PendingTask[];
  href: string | null;
  external: boolean;
};

export type Department = { key: string; workers: Worker[] };

export type OfficeData = {
  generatedAt: string;
  verified: boolean;
  departments: Department[];
  totals: { workers: number; open: number; ai: number; rules: number; planned: number; attention: number; activeToday: number };
};

export const FINISHED_WINDOW_MS = 5 * 60 * 1000;

/** Which roles a proposed task "belongs" to, by the source that created it. */
const TASK_SOURCE_ROLES: Record<TaskRow["source"], string[]> = {
  ai_manager: ["ai_manager"],
  task_extract: ["task_planner", "followup_scheduler"],
  secretary: ["viewing_coordinator", "reply_drafter"],
  manual: [],
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function buildOffice(input: {
  roles: RoleRow[];
  personas: PersonaRow[];
  models: WorkforceModel[];
  jobs: JobRow[];
  tasks: TaskRow[];
  ctx: AccessContext;
  country: string | null;
  locale: string;
  now: Date;
  keyPresent: (p: Provider) => boolean;
  categoryOrder: readonly string[];
}): OfficeData {
  const { roles, personas, models, jobs, tasks, ctx, country, locale, now, keyPresent } = input;

  // Persona: the agent's country row wins over the default row.
  const personaOf = new Map<string, PersonaRow>();
  for (const p of personas) {
    const cur = personaOf.get(p.role_key);
    if (!cur || (p.country_code && p.country_code === country)) personaOf.set(p.role_key, p);
    else if (cur.country_code && cur.country_code !== country && !p.country_code) personaOf.set(p.role_key, p);
  }
  const modelOf = new Map(models.map((m) => [m.feature, m]));
  const rolesByFeature = new Map<string, string[]>();
  for (const r of roles) if (r.feature) rolesByFeature.set(r.feature, [...(rolesByFeature.get(r.feature) ?? []), r.key]);

  const sevenDaysAgo = now.getTime() - 7 * 86_400_000;
  const openAiTasks = tasks.filter((t) => t.status === "open" && t.source !== "manual");

  const workers: Worker[] = roles
    .filter((r) => r.status !== "hidden")
    .map((r) => {
      const p = personaOf.get(r.key);
      const access = roleAccess(r, ctx);
      const engine = roleEngine(r, r.feature ? modelOf.get(r.feature) : undefined, keyPresent);
      const mine = r.feature ? jobs.filter((j) => j.feature === r.feature) : [];
      mine.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      const last = mine[0] ?? null;
      const counts7d = { ok: 0, degraded: 0, error: 0, denied: 0 };
      for (const j of mine) if (Date.parse(j.created_at) >= sevenDaysAgo) counts7d[j.status]++;

      const pending: PendingTask[] = openAiTasks
        .filter((t) => TASK_SOURCE_ROLES[t.source].includes(r.key))
        .slice(0, 5)
        .map((t) => ({ id: t.id, title: t.title, dueAt: t.due_at, kind: t.kind, href: "/tasks" }));

      let state: WorkerState;
      if (access === "planned" || access === "hero") state = "planned";
      else if (access === "unavailable") state = "offline";
      else if (pending.length > 0) state = "attention";
      else if (last && last.status === "error") state = "error";
      else if (last && now.getTime() - Date.parse(last.created_at) <= FINISHED_WINDOW_MS) state = "finished";
      else if (last && sameDay(new Date(last.created_at), now)) state = "active";
      else state = "idle";

      const name = r.name[locale] ?? r.name.en ?? r.key;
      const href = access === "open" ? r.route : access === "hero_open" ? r.external_url : null;
      return {
        key: r.key,
        category: r.category,
        persona: p?.name ?? name,
        role: name,
        avatar: p?.avatar_path ?? null,
        portrait: p?.portrait_path ?? null,
        access,
        engine,
        feature: r.feature,
        sharedWith: r.feature ? (rolesByFeature.get(r.feature) ?? []).filter((k) => k !== r.key) : [],
        state,
        lastAt: last?.created_at ?? null,
        lastStatus: last?.status ?? null,
        lastReason: last?.denied_reason ?? null,
        counts7d,
        pending,
        href,
        external: access === "hero_open",
      };
    });

  const byCat = new Map<string, Worker[]>();
  for (const w of workers) byCat.set(w.category, [...(byCat.get(w.category) ?? []), w]);
  const order = [...input.categoryOrder.filter((c) => byCat.has(c)), ...[...byCat.keys()].filter((c) => !input.categoryOrder.includes(c))];
  const sortIndex = new Map(roles.map((r) => [r.key, r.sort]));
  const departments: Department[] = order.map((key) => ({
    key,
    workers: (byCat.get(key) ?? []).sort((a, b) => (sortIndex.get(a.key) ?? 0) - (sortIndex.get(b.key) ?? 0)),
  }));

  return {
    generatedAt: now.toISOString(),
    verified: ctx.verified,
    departments,
    totals: {
      workers: workers.length,
      open: workers.filter((w) => w.access === "open" || w.access === "hero_open").length,
      ai: workers.filter((w) => w.engine === "ai" && w.access === "open").length,
      rules: workers.filter((w) => w.engine !== "ai" && w.access === "open").length,
      planned: workers.filter((w) => w.state === "planned").length,
      attention: workers.filter((w) => w.state === "attention").length,
      activeToday: workers.filter((w) => w.state === "active" || w.state === "finished").length,
    },
  };
}
