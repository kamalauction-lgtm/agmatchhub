import Image from "next/image";
import type { Worker } from "@/lib/ai/office-state";
import { STATE_COLOR, relTime, type OfficeLabels } from "./types";
import { AgentStatusBadge, EngineBadge } from "./agent-status-badge";
import { ActivityNode } from "./activity-node";

export function AgentAvatar({ w, size }: { w: Worker; size: number }) {
  const color = STATE_COLOR[w.state];
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full" style={{ width: size + 8, height: size + 8, background: `${color}22` }}>
      {w.avatar ? (
        <Image src={w.avatar} alt="" width={size} height={size} unoptimized className="rounded-full object-cover" style={{ width: size, height: size, border: `2px solid ${color}` }} />
      ) : (
        <span className="grid rounded-full bg-indigo-soft text-indigo" style={{ width: size, height: size }}>✦</span>
      )}
      <span aria-hidden className={`absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-card ${w.state === "finished" || w.state === "attention" ? "office-pulse" : ""}`} style={{ background: color }} />
    </span>
  );
}

/** Operational card for the List view: who, where, state, engine, counts, action. */
export function AgentAvatarCard({
  w,
  labels,
  locale,
  demo,
  onOpen,
}: {
  w: Worker;
  labels: OfficeLabels;
  locale: string;
  demo: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-start gap-3 rounded-2xl border border-line bg-card p-3 text-left shadow-card transition-colors duration-150 hover:border-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
    >
      <AgentAvatar w={w} size={44} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-bold">✦ {w.persona}</span>
          <span className="truncate text-xs text-muted">{w.role}</span>
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <AgentStatusBadge state={w.state} labels={labels} demo={demo} size="xs" />
          <EngineBadge engine={w.engine} labels={labels} size="xs" />
        </span>
        <span className="mt-2 block">
          <ActivityNode w={w} labels={labels.node} />
        </span>
        <span className="mt-1.5 block truncate text-[11px] text-muted">
          {labels.panel.last}: {relTime(w.lastAt, locale, labels.panel.never)}
        </span>
      </span>
    </button>
  );
}
