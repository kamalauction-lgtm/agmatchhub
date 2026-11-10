import Link from "next/link";
import type { Worker, WorkerState } from "@/lib/ai/office-state";
import { STATE_COLOR, relTime, type OfficeLabels } from "./types";

/**
 * The three operational panels under the floor — the same facts as the
 * floor, in list form. Real mode reads only recorded runs and open proposals;
 * demo mode synthesises entries and tags every one of them.
 */

export function ActivityFeed({ workers, labels, locale, demo, generatedAt }: { workers: Worker[]; labels: OfficeLabels; locale: string; demo: boolean; generatedAt: string }) {
  // Demo timestamps step back from the server's snapshot time: deterministic,
  // so rendering stays pure and the feed never claims a real clock reading.
  const anchor = Date.parse(generatedAt);
  const items = demo
    ? workers.filter((w) => w.state === "finished" || w.state === "active").slice(0, 6).map((w, i) => ({
        key: `${w.key}-demo`, who: w.persona, text: labels.feed.demoLine, at: new Date(anchor - (i + 1) * 7 * 60000).toISOString(), status: "denied" as const, href: w.href,
      }))
    : workers
        .flatMap((w) => w.recent.map((r) => ({ key: `${w.key}-${r.at}`, who: w.persona, text: `${labels.jobStatus[r.status]}${r.status === "denied" && r.reason ? ` — ${labels.reason[r.reason] ?? r.reason}` : ""}`, at: r.at, status: r.status, href: r.href ?? w.href })))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, 6);
  return (
    <Panel title={labels.feed.title} badge={demo ? labels.demoBadge : labels.feed.live} badgeTone={demo ? "demo" : "live"}>
      {items.length ? (
        <ul className="divide-y divide-line text-sm">
          {items.map((it) => (
            <li key={it.key} className="flex items-start gap-3 py-2">
              <span className="w-14 shrink-0 text-xs tabular-nums text-muted">{relTime(it.at, locale, "")}</span>
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: it.status === "error" ? STATE_COLOR.error : STATE_COLOR.active }} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">✦ {it.who}</span> <span className="text-muted-strong">{it.text}</span>
              </span>
              {it.href && <Link href={it.href} className="shrink-0 text-xs font-semibold text-blue hover:underline">→</Link>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{labels.feed.empty}</p>
      )}
    </Panel>
  );
}

export function TaskQueue({ workers, labels, locale, demo }: { workers: Worker[]; labels: OfficeLabels; locale: string; demo: boolean }) {
  const items = demo
    ? workers.filter((w) => w.state === "attention").slice(0, 5).map((w) => ({ id: `${w.key}-demo`, who: w.persona, title: labels.queue.demoLine, dueAt: null as string | null }))
    : workers.flatMap((w) => w.pending.map((t) => ({ id: t.id, who: w.persona, title: t.title, dueAt: t.dueAt }))).slice(0, 6);
  return (
    <Panel title={`${labels.queue.title} (${items.length})`} badge={demo ? labels.demoBadge : undefined} badgeTone="demo">
      {items.length ? (
        <ul className="space-y-1.5 text-sm">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm border-2" style={{ borderColor: STATE_COLOR.attention }} />
              <span className="min-w-0 flex-1 truncate"><span className="text-muted">✦ {t.who} · </span>{t.title}</span>
              {t.dueAt && <span className="shrink-0 text-xs text-muted">{relTime(t.dueAt, locale, "")}</span>}
              <Link href="/tasks" className="shrink-0 text-xs font-semibold text-blue hover:underline">→</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{labels.queue.empty}</p>
      )}
    </Panel>
  );
}

export function DepartmentStatus({ workers, labels, departments }: { workers: Worker[]; labels: OfficeLabels; departments: number }) {
  const order: WorkerState[] = ["finished", "active", "attention", "idle", "error", "planned", "offline"];
  const counts = order.map((s) => ({ s, n: workers.filter((w) => w.state === s).length })).filter((c) => c.n > 0);
  const total = workers.length || 1;
  let acc = 0;
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <Panel title={labels.deptStatus.title}>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 90 90" className="h-24 w-24 shrink-0" role="img" aria-label={labels.deptStatus.title}>
          <circle cx="45" cy="45" r={r} fill="none" stroke="var(--surface)" strokeWidth="10" />
          {counts.map((c) => {
            const len = (c.n / total) * circ;
            const el = (
              <circle
                key={c.s} cx="45" cy="45" r={r} fill="none" stroke={STATE_COLOR[c.s]} strokeWidth="10"
                strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-acc} transform="rotate(-90 45 45)"
              />
            );
            acc += len;
            return el;
          })}
          <text x="45" y="43" textAnchor="middle" fontSize="16" fontWeight="800" fill="currentColor">{departments}</text>
          <text x="45" y="56" textAnchor="middle" fontSize="7" fill="var(--muted)">{labels.kpi.departments}</text>
        </svg>
        <ul className="min-w-0 flex-1 space-y-1 text-sm">
          {counts.map((c) => (
            <li key={c.s} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATE_COLOR[c.s] }} />{labels.state[c.s]}</span>
              <span className="font-bold tabular-nums">{c.n}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function Panel({ title, badge, badgeTone, children }: { title: string; badge?: string; badgeTone?: "live" | "demo"; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeTone === "demo" ? "bg-gold-light text-foreground" : "bg-success-soft text-success-ink"}`}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
