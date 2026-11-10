import Link from "next/link";
import type { Department, Worker } from "@/lib/ai/office-state";
import { relTime, type OfficeLabels } from "./types";
import { AgentStatusBadge, EngineBadge } from "./agent-status-badge";
import { AgentAvatar } from "./agent-avatar-card";
import { ActivityNode } from "./activity-node";

/**
 * The right-hand drawer. Two modes: one specialist, or one department (its
 * members as a list that opens a specialist). Everything shown is a fact from
 * the worker row; the only "opinion" is the state hint, which explains the
 * rule that produced the state.
 */
export function AgentDetailPanel({
  worker,
  department,
  members,
  labels,
  locale,
  demo,
  onClose,
  onOpenWorker,
  docked = false,
}: {
  /** Inline column on wide screens instead of a modal overlay. */
  docked?: boolean;
  worker: Worker | null;
  department: Department | null;
  members: Worker[];
  labels: OfficeLabels;
  locale: string;
  demo: boolean;
  onClose: () => void;
  onOpenWorker: (key: string) => void;
}) {
  const due = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : null;

  const aria = worker ? `${worker.persona} · ${worker.role}` : department ? labels.departments[department.key] : "";
  const body = (
      <aside
        role={docked ? "region" : "dialog"}
        aria-modal={docked ? undefined : true}
        aria-label={aria}
        onClick={(e) => e.stopPropagation()}
        className={`office-panel flex flex-col overflow-y-auto bg-card ${docked ? "h-full rounded-2xl border border-line shadow-card" : "h-full w-full max-w-md shadow-raised"}`}
      >
        {worker ? (
          <>
            <div className="command-band relative p-5">
              <button type="button" onClick={onClose} aria-label={labels.panel.close} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">×</button>
              <div className="flex items-center gap-4">
                <AgentAvatar w={worker} size={64} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--command-gold)" }}>{labels.departments[worker.category] ?? worker.category}</p>
                  <h2 className="mt-0.5 truncate text-xl font-bold">✦ {worker.persona}</h2>
                  <p className="command-muted text-sm">{worker.role}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <AgentStatusBadge state={worker.state} labels={labels} demo={demo} />
                <EngineBadge engine={worker.engine} labels={labels} />
              </div>
              <p className="command-muted mt-2 text-xs">{labels.stateHint[worker.state]}</p>
            </div>

            <div className="flex-1 space-y-5 p-5 text-sm">
              <Row label={labels.panel.availability} value={labels.access[worker.access]} />
              <Row
                label={labels.panel.engine}
                value={labels.engine[worker.engine]}
                note={worker.sharedWith.length ? `${labels.panel.sharedEngine} ${worker.sharedWith.length}` : undefined}
              />

              <Section title={labels.panel.current}>
                <p>{worker.pending.length > 0 ? labels.panel.currentPending : labels.panel.currentNone}</p>
                <div className="mt-2"><ActivityNode w={worker} labels={labels.node} /></div>
              </Section>

              <Section title={labels.panel.needs}>
                {worker.pending.length ? (
                  <>
                    <p className="mb-2 text-muted">{labels.panel.needsPending}</p>
                    <ul className="space-y-1.5">
                      {worker.pending.map((t) => (
                        <li key={t.id} className="rounded-lg border border-gold-light/50 bg-accent-soft px-3 py-2">
                          <p className="font-medium">{t.title}</p>
                          {t.dueAt && <p className="text-xs text-muted">{labels.panel.due} {due(t.dueAt)}</p>}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-muted">{labels.panel.needsNone}</p>
                )}
              </Section>

              <Section title={labels.panel.recent}>
                {worker.recent.length ? (
                  <ul className="divide-y divide-line">
                    {worker.recent.map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block font-medium">{labels.jobStatus[r.status]}{r.status === "denied" && r.reason ? ` — ${labels.reason[r.reason] ?? r.reason}` : ""}</span>
                          <span className="block text-xs text-muted">{relTime(r.at, locale, labels.panel.never)}</span>
                        </span>
                        {r.href && <Link href={r.href} className="shrink-0 text-xs font-semibold text-blue hover:underline">{labels.panel.open}</Link>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">{labels.panel.recentNone}</p>
                )}
              </Section>

              <Section title={labels.panel.outputs}>
                <dl className="grid grid-cols-4 gap-2 text-center text-xs">
                  {(["ok", "degraded", "denied", "error"] as const).map((k) => (
                    <div key={k} className="rounded-lg bg-surface px-2 py-2">
                      <dd className="text-base font-bold tabular-nums">{worker.counts7d[k]}</dd>
                      <dt className="text-muted">{labels.jobStatus[k]}</dt>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-muted">{labels.panel.last}: {relTime(worker.lastAt, locale, labels.panel.never)}</p>
              </Section>

              <Section title={labels.panel.errors}>
                <p className="text-muted">{worker.counts7d.error > 0 ? `${worker.counts7d.error} · ${labels.jobStatus.error}` : labels.panel.errorsNone}</p>
              </Section>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line p-4">
              {worker.href && (
                worker.external ? (
                  <a href={worker.href} target="_blank" rel="noreferrer" className="rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white hover:bg-indigo">{labels.panel.open}</a>
                ) : (
                  <Link href={worker.href} className="rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white hover:bg-indigo">{labels.panel.open}</Link>
                )
              )}
              {worker.pending.length > 0 && (
                <Link href="/tasks" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-blue hover:text-blue">{labels.panel.openTasks}</Link>
              )}
              <Link href="/ai" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:border-blue hover:text-blue">{labels.panel.openWorkforce}</Link>
            </div>
          </>
        ) : department ? (
          <>
            <div className="command-band relative p-5">
              <button type="button" onClick={onClose} aria-label={labels.panel.close} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">×</button>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--command-gold)" }}>{labels.panel.department}</p>
              <h2 className="mt-1 text-xl font-bold">{labels.departments[department.key] ?? department.key}</h2>
              <p className="command-muted mt-1 text-sm">{members.length} {labels.panel.members}</p>
            </div>
            <ul className="flex-1 divide-y divide-line p-3">
              {members.map((m) => (
                <li key={m.key}>
                  <button type="button" onClick={() => onOpenWorker(m.key)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface">
                    <AgentAvatar w={m} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">✦ {m.persona}</span>
                      <span className="block truncate text-xs text-muted">{m.role}</span>
                    </span>
                    <AgentStatusBadge state={m.state} labels={labels} demo={demo} size="xs" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </aside>
  );
  if (docked) return body;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]" onClick={onClose} role="presentation">
      {body}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-right font-medium">
        {value}
        {note && <span className="block text-xs font-normal text-muted">{note}</span>}
      </span>
    </div>
  );
}
