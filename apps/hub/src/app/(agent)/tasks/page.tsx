import Link from "next/link";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { AgentShell } from "@/components/layout/agent-shell";
import { Panel } from "@/components/admin/panel";
import { TaskSuggestions } from "@/components/tasks/task-suggestions";
import { createTask, createTasksBulk, setTaskStatus, proposeLeadViewing, setLeadViewingStatus } from "./actions";
import { suggestTasks } from "./ai-actions";
import { getCompanions } from "@/lib/ai/cast";

/**
 * Tasks and viewings: what the agent has agreed to do, by when, and where it
 * came from. Overdue first, then today, then the week; appointments as a strip.
 * Opened with `?lead=<id>` from a lead card, it pre-fills the task form, offers
 * suggestions from that enquiry and the viewing form for it.
 */

export const dynamic = "force-dynamic";

type Task = {
  id: string; title: string; kind: string; source: string; due_at: string | null; status: string; done_at: string | null;
  lead_id: string | null; listing_id: string | null; notes: string | null;
  leads: { human_readable_id: string; contacts: { full_name: string } | { full_name: string }[] | null } | { human_readable_id: string; contacts: { full_name: string } | { full_name: string }[] | null }[] | null;
};
type Viewing = {
  id: string; human_readable_id: string; proposed_date: string; proposed_time: string | null; viewing_type: string; status: string;
  meeting_point: string | null; lead_id: string | null; submission_id: string | null;
  leads: { contacts: { full_name: string } | { full_name: string }[] | null; listings: { title: string } | { title: string }[] | null }
       | { contacts: { full_name: string } | { full_name: string }[] | null; listings: { title: string } | { title: string }[] | null }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * Bucketing is a fact about the data at request time, not presentation, so it
 * lives here: the React Compiler (rightly) refuses Date.now() during render.
 */
function yesterdayIso(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

function bucketTasks(tasks: Task[]) {
  const nowMs = Date.now();
  const endOfDay = new Date(nowMs);
  endOfDay.setHours(23, 59, 59, 999);
  const open = tasks.filter((x) => x.status === "open");
  const due = (x: Task) => (x.due_at ? Date.parse(x.due_at) : null);
  return {
    nowMs,
    open,
    overdue: open.filter((x) => due(x) !== null && due(x)! < nowMs),
    today: open.filter((x) => due(x) !== null && due(x)! >= nowMs && due(x)! <= endOfDay.getTime()),
    later: open.filter((x) => due(x) === null || due(x)! > endOfDay.getTime()),
    done: tasks.filter((x) => x.status !== "open").slice(0, 10),
    yesterday: new Date(nowMs - 86_400_000).toISOString().slice(0, 10),
  };
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ lead?: string; notice?: string; error?: string }> }) {
  const user = await requireUser();
  const { lead: leadId, notice, error } = await searchParams;
  const t = await getTranslations("tasks");
  const tsec = await getTranslations("leads.secretary");
  const format = await getFormatter();
  const supabase = await createClient();

  const [{ data: tasksRaw }, { data: viewingsRaw }, { data: lead }] = await Promise.all([
    supabase
      .from("agent_tasks")
      .select("id, title, kind, source, due_at, status, done_at, lead_id, listing_id, notes, leads (human_readable_id, contacts (full_name))")
      .eq("agent_id", user.id)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase
      .from("viewing_appointments")
      .select("id, human_readable_id, proposed_date, proposed_time, viewing_type, status, meeting_point, lead_id, submission_id, leads (contacts (full_name), listings (title))")
      .gte("proposed_date", yesterdayIso())
      .order("proposed_date", { ascending: true })
      .limit(50),
    leadId
      ? supabase.from("leads").select("id, human_readable_id, inquiry_type, contacts (full_name), listings (title)").eq("id", leadId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { nowMs: now, open, overdue, today, later, done } = bucketTasks((tasksRaw ?? []) as Task[]);
  const viewings = (viewingsRaw ?? []) as unknown as Viewing[];

  const REASONS = ["quota", "daily_cap", "platform_cap", "circuit_open", "disabled", "feature_off", "unverified", "no_provider", "failed"];
  const cast = await getCompanions(["task_planner"]);
  const suggestLabels = {
    fromLead: t("suggest.fromLead"), fromBrief: t("suggest.fromBrief"), working: t("suggest.working"),
    sourceAi: t.raw("suggest.sourceAi") as string, sourceRules: t("suggest.sourceRules"),
    reasons: Object.fromEntries(REASONS.map((r) => [r, tsec(`reason.${r}` as never)])),
    addSelected: t("suggest.addSelected"), nothing: t("suggest.nothing"), due: t("due"),
    kinds: Object.fromEntries(["call", "message", "viewing", "document", "follow_up", "other"].map((k) => [k, t(`kind.${k}` as never)])),
  };

  const leadContact = lead ? one(lead.contacts as { full_name: string } | { full_name: string }[] | null) : null;
  const leadListing = lead ? one(lead.listings as { title: string } | { title: string }[] | null) : null;
  const input = "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm";
  const btn = "rounded-lg px-3 py-2 text-xs font-semibold";

  const TaskRow = ({ x }: { x: Task }) => {
    const l = one(x.leads);
    const c = l ? one(l.contacts) : null;
    const isOver = x.due_at && Date.parse(x.due_at) < now && x.status === "open";
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <form action={setTaskStatus}>
          <input type="hidden" name="taskId" value={x.id} />
          <input type="hidden" name="status" value={x.status === "open" ? "done" : "open"} />
          <button type="submit" aria-label={x.status === "open" ? t("markDone") : t("reopen")}
            className={`grid h-6 w-6 place-items-center rounded-full border text-xs ${x.status === "done" ? "border-success bg-success text-white" : "border-line hover:border-success"}`}>
            {x.status === "done" ? "✓" : ""}
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${x.status !== "open" ? "text-muted line-through" : ""}`}>{x.title}</p>
          <p className="text-xs text-muted">
            <span className="rounded bg-surface px-1.5 py-0.5">{t(`kind.${x.kind}` as never)}</span>
            {x.due_at && <span className={`ml-2 ${isOver ? "font-semibold text-danger" : ""}`}>{format.dateTime(new Date(x.due_at), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
            {x.source !== "manual" && <span className="ml-2 text-indigo">✦ {t(`source.${x.source}` as never)}</span>}
            {l && <Link href="/leads" className="ml-2 hover:underline">{c?.full_name ?? l.human_readable_id}</Link>}
          </p>
        </div>
        {x.status === "open" && (
          <form action={setTaskStatus}>
            <input type="hidden" name="taskId" value={x.id} />
            <input type="hidden" name="status" value="dismissed" />
            <button type="submit" className="text-xs text-muted hover:text-danger">{t("dismiss")}</button>
          </form>
        )}
      </li>
    );
  };

  const section = (title: string, items: Task[], tone = "") =>
    items.length ? (
      <Panel key={title} title={title} className={`mb-4 ${tone}`} bodyClassName="p-0">
        <ul className="divide-y divide-line">{items.map((x) => <TaskRow key={x.id} x={x} />)}</ul>
      </Panel>
    ) : null;

  return (
    <AgentShell wide>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("summary", { overdue: overdue.length, today: today.length, open: open.length })}</p>
        </div>
      </div>

      {notice && <p className="mb-4 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">{t(`notice.${notice}` as never)}</p>}
      {error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger">{t(`errors.${error}` as never)}</p>}

      {lead && (
        <p className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          {t("forLead", { name: leadContact?.full_name ?? lead.human_readable_id, listing: leadListing?.title ?? "" })}{" "}
          <Link href="/tasks" className="text-muted hover:underline">· {t("clearLead")}</Link>
        </p>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Suggestions ------------------------------------------------------ */}
        <TaskSuggestions leadId={lead?.id} suggestAction={suggestTasks} bulkAction={createTasksBulk} companion={cast.task_planner} labels={suggestLabels} />

        {/* Manual task ------------------------------------------------------ */}
        <Panel title={t("newTask")}>
          <form action={createTask} className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input name="title" required minLength={2} maxLength={160} placeholder={t("titlePlaceholder")} className={`${input} sm:col-span-2`} />
            <input name="dueAt" type="datetime-local" className={input} />
            <select name="kind" defaultValue="other" className={input}>
              {["call", "message", "viewing", "document", "follow_up", "other"].map((k) => (
                <option key={k} value={k}>{t(`kind.${k}` as never)}</option>
              ))}
            </select>
            <input type="hidden" name="leadId" value={lead?.id ?? ""} />
            <button type="submit" className={`${btn} bg-crimson text-white hover:bg-crimson-strong sm:col-span-2`}>{t("add")}</button>
          </form>
        </Panel>
      </div>

      {section(t("overdue"), overdue, "border-danger/40")}
      {section(t("today"), today)}
      {section(t("upcoming"), later)}
      {!open.length && <p className="mb-4 rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">{t("empty")}</p>}

      {/* Viewings ----------------------------------------------------------- */}
      <Panel title={t("viewingsTitle")} hint={t("viewingsHint")} className="mb-4" bodyClassName="p-0">
        {lead && (
          <form action={proposeLeadViewing} className="grid gap-3 border-b border-line px-4 py-4 sm:grid-cols-5">
            <input type="hidden" name="leadId" value={lead.id} />
            <input name="proposedDate" type="date" required className={input} />
            <input name="proposedTime" type="time" className={input} />
            <select name="viewingType" defaultValue="physical" className={input}>
              <option value="physical">{t("physical")}</option>
              <option value="virtual">{t("virtual")}</option>
            </select>
            <input name="meetingPoint" placeholder={t("meetingPoint")} maxLength={200} className={input} />
            <button type="submit" className={`${btn} bg-crimson text-white hover:bg-crimson-strong`}>{t("bookViewing")}</button>
          </form>
        )}
        {viewings.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">{t("noViewings")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {viewings.map((v) => {
              const vl = one(v.leads);
              const c = vl ? one(vl.contacts) : null;
              const l = vl ? one(vl.listings) : null;
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="font-mono text-xs text-muted">{v.human_readable_id}</span>
                  <span className="font-medium">{v.proposed_date}{v.proposed_time ? ` · ${v.proposed_time}` : ""}</span>
                  <span className="text-muted">{t(v.viewing_type as never)} · {v.lead_id ? (c?.full_name ?? "—") : t("matchhubViewing")}{l ? ` · ${l.title}` : ""}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${v.status === "confirmed" ? "bg-success/10 text-success" : v.status === "cancelled" ? "bg-surface text-muted" : "bg-warning/10 text-warning"}`}>
                    {t(`viewingStatus.${v.status}` as never)}
                  </span>
                  {v.lead_id && v.status === "confirmed" && (
                    <span className="ml-auto flex gap-2">
                      {(["completed", "cancelled"] as const).map((s) => (
                        <form key={s} action={setLeadViewingStatus}>
                          <input type="hidden" name="viewingId" value={v.id} />
                          <input type="hidden" name="status" value={s} />
                          <button type="submit" className="text-xs text-muted hover:text-foreground">{t(`viewingStatus.${s}` as never)}</button>
                        </form>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {done.length > 0 && section(t("recentlyDone"), done)}
    </AgentShell>
  );
}
