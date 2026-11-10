import type { Worker, WorkerState } from "@/lib/ai/office-state";
import { STATE_COLOR, type OfficeLabels } from "./types";

/**
 * The activity state as a pill, plus the engine as a second, quieter pill.
 * Two badges on purpose: "Working" and "Rule-based" are different facts, and
 * folding them into one label is how a rule-based tool ends up looking like a
 * model-powered worker.
 */
export function AgentStatusBadge({
  state,
  labels,
  demo = false,
  size = "sm",
}: {
  state: WorkerState;
  labels: OfficeLabels;
  demo?: boolean;
  size?: "xs" | "sm";
}) {
  const color = STATE_COLOR[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}
      style={{ borderColor: `${color}55`, background: `${color}1f`, color }}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${state === "finished" || state === "attention" ? "office-pulse" : ""}`} style={{ background: color }} />
      {labels.state[state]}
      {demo && <span className="rounded bg-gold-light px-1 text-[10px] font-bold text-foreground">{labels.demoBadge}</span>}
    </span>
  );
}

export function EngineBadge({ engine, labels, size = "sm" }: { engine: Worker["engine"]; labels: OfficeLabels; size?: "xs" | "sm" }) {
  const ai = engine === "ai";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} ${
        ai ? "border-indigo/40 bg-indigo-soft text-indigo" : "border-line-strong bg-surface text-muted-strong"
      }`}
      title={labels.engine[engine]}
    >
      <span aria-hidden>{ai ? "✦" : "⚙"}</span>
      {labels.engineShort[engine]}
    </span>
  );
}
