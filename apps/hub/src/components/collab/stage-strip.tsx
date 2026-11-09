import { STAGE_KEYS } from "@/lib/requests/stages";

/**
 * Stage strip (MatchHub 2.0): six steps, the current one highlighted, earlier
 * ones marked done. Labels come from messages/* via the caller. `closedOk`
 * colours the last step green only for a successful close; every other
 * closed status renders it neutral, so an expired or cancelled requirement is
 * never dressed up as a win.
 */
export function StageStrip({
  current,
  labels,
  closedOk = false,
  compact = false,
}: {
  current: number;
  labels: Record<(typeof STAGE_KEYS)[number], string>;
  closedOk?: boolean;
  compact?: boolean;
}) {
  return (
    <ol className={`grid gap-1.5 ${compact ? "grid-cols-6" : "grid-cols-3 sm:grid-cols-6"}`} aria-label={labels[STAGE_KEYS[current]]}>
      {STAGE_KEYS.map((k, i) => {
        const done = i < current;
        const on = i === current;
        const isClosed = k === "closed";
        const tone = on
          ? isClosed && !closedOk
            ? "border-line-strong bg-surface text-muted-strong"
            : "border-blue bg-blue-soft text-blue"
          : done
            ? "border-success-soft bg-success-soft text-success-ink"
            : "border-line bg-card text-muted";
        return (
          <li
            key={k}
            aria-current={on ? "step" : undefined}
            className={`rounded-lg border px-1.5 py-1 text-center text-[11px] font-semibold leading-tight ${tone} ${compact ? "truncate" : ""}`}
          >
            {compact ? (done ? "✓" : i + 1) : labels[k]}
          </li>
        );
      })}
    </ol>
  );
}
