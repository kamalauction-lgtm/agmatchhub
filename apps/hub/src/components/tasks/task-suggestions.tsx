"use client";

import { useState } from "react";
import type { TaskProposal } from "@/lib/ai/tasks";

/**
 * "Suggest tasks" → a checklist the agent edits → "Add selected" posts the
 * kept rows as one JSON field. The AI proposes; nothing lands unticked.
 */
export type SuggestLabels = {
  fromLead: string;
  fromBrief: string;
  working: string;
  sourceAi: string;      // [model]
  sourceRules: string;
  reasons: Record<string, string>;
  addSelected: string;
  nothing: string;
  due: string;
  kinds: Record<string, string>;
};

export function TaskSuggestions({
  leadId,
  suggestAction,
  bulkAction,
  labels,
}: {
  leadId?: string;
  suggestAction: (input: { leadId?: string }) => Promise<TaskProposal>;
  bulkAction: (fd: FormData) => void;
  labels: SuggestLabels;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TaskProposal | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [titles, setTitles] = useState<string[]>([]);

  async function ask(fromLead: boolean) {
    setBusy(true);
    try {
      const r = await suggestAction(fromLead ? { leadId } : {});
      setResult(r);
      setPicked(r.tasks.map(() => true));
      setTitles(r.tasks.map((t) => t.title));
    } catch {
      setResult({ tasks: [], source: "rules", reason: "failed" });
    } finally {
      setBusy(false);
    }
  }

  const selected = result ? result.tasks.map((t, i) => ({ ...t, title: titles[i] })).filter((_, i) => picked[i]) : [];
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "—");
  const btn = "rounded-lg px-3 py-2 text-xs font-semibold";

  return (
    <div className="rounded-xl border border-line bg-surface/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-indigo">✦</span>
        {leadId && (
          <button type="button" disabled={busy} onClick={() => ask(true)} className={`${btn} border border-line bg-card hover:border-crimson hover:text-crimson disabled:opacity-50`}>
            {busy ? labels.working : labels.fromLead}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => ask(false)} className={`${btn} border border-line bg-card hover:border-crimson hover:text-crimson disabled:opacity-50`}>
          {busy ? labels.working : labels.fromBrief}
        </button>
        {result && (
          <span className="text-[11px] text-muted">
            {result.source === "ai" ? labels.sourceAi.replace("[model]", result.model ?? "AI") : (labels.reasons[result.reason ?? ""] ?? labels.sourceRules)}
          </span>
        )}
      </div>

      {result && (
        result.tasks.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{labels.nothing}</p>
        ) : (
          <form action={bulkAction} className="mt-3 space-y-2">
            {result.tasks.map((t, i) => (
              <label key={i} className="flex items-start gap-3 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                <input type="checkbox" checked={picked[i] ?? false} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1 h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <input value={titles[i] ?? ""} onChange={(e) => setTitles((ts) => ts.map((v, j) => (j === i ? e.target.value : v)))} className="w-full bg-transparent font-medium outline-none" />
                  <span className="mt-0.5 block text-xs text-muted">
                    {labels.kinds[t.kind] ?? t.kind} · {labels.due}: {fmt(t.dueAt)}
                  </span>
                </span>
              </label>
            ))}
            <input type="hidden" name="source" value="task_extract" />
            <input type="hidden" name="leadId" value={leadId ?? ""} />
            <input type="hidden" name="tasks" value={JSON.stringify(selected.map((t) => ({ title: t.title, kind: t.kind, dueAt: t.dueAt })))} />
            <button type="submit" disabled={selected.length === 0} className={`${btn} bg-crimson text-white hover:bg-crimson-strong disabled:opacity-50`}>
              {labels.addSelected} ({selected.length})
            </button>
          </form>
        )
      )}
    </div>
  );
}
