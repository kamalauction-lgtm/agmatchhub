import type { Worker } from "@/lib/ai/office-state";
import { STATE_COLOR } from "./types";

/**
 * The small live indicator above a character: typing dots while a role is
 * "working" (ran within the last minutes), a pulsing ring while something
 * waits for the agent, a tick for done-today, a cross for a failed run, and a
 * count bubble for today's jobs / the queue. SVG variant for the floor,
 * HTML variant for cards. Both read the same worker and draw nothing that
 * the worker does not say.
 */
export function ActivityNodeSvg({ w, demo, demoLabel }: { w: Worker; demo: boolean; demoLabel: string }) {
  const color = STATE_COLOR[w.state];
  const count = w.state === "attention" ? w.queueCount : w.todayCount;
  return (
    <g className="office-node" transform="translate(0 -58)">
      {w.state === "finished" && (
        <g className="office-typing">
          <rect x="-18" y="-10" width="36" height="16" rx="8" fill="#0b1b33" stroke={color} strokeOpacity="0.6" />
          <circle cx="-8" cy="-2" r="2.2" fill={color} className="office-dot office-dot-1" />
          <circle cx="0" cy="-2" r="2.2" fill={color} className="office-dot office-dot-2" />
          <circle cx="8" cy="-2" r="2.2" fill={color} className="office-dot office-dot-3" />
        </g>
      )}
      {w.state === "attention" && (
        <g>
          <circle cx="0" cy="-2" r="11" fill="none" stroke={color} strokeWidth="2" className="office-ring" />
          <rect x="-9" y="-11" width="18" height="18" rx="6" fill={color} />
          <text x="0" y="2.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0b1b33">!</text>
        </g>
      )}
      {w.state === "error" && (
        <g>
          <rect x="-9" y="-11" width="18" height="18" rx="6" fill={color} />
          <text x="0" y="2.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">×</text>
        </g>
      )}
      {w.state === "active" && (
        <g>
          <circle cx="0" cy="-2" r="8" fill={color} />
          <path d="M-4 -2 L-1 1 L4 -5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {count > 0 && w.state !== "attention" && (
        <g transform="translate(16 -8)">
          <circle r="7" fill="#ffffff" />
          <text y="2.6" textAnchor="middle" fontSize="8" fontWeight="800" fill="#0b1b33">{count}</text>
        </g>
      )}
      {demo && (
        <g transform="translate(-30 -16)">
          <rect width="26" height="11" rx="3" fill="#c9a64b" />
          <text x="13" y="8.3" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#0b1b33">{demoLabel}</text>
        </g>
      )}
    </g>
  );
}

export function ActivityNode({ w, labels }: { w: Worker; labels: { tasksToday: string; queue: string; justRan: string } }) {
  const color = STATE_COLOR[w.state];
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[11px] text-muted">
      {w.state === "finished" && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: `${color}1f`, color }}>
          <span className="office-dot office-dot-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          <span className="office-dot office-dot-2 inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          <span className="office-dot office-dot-3 inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {labels.justRan}
        </span>
      )}
      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5">
        <strong className="tabular-nums text-foreground">{w.todayCount}</strong> {labels.tasksToday}
      </span>
      {w.queueCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold" style={{ background: `${STATE_COLOR.attention}26`, color: "#7a5f1f" }}>
          <strong className="tabular-nums">{w.queueCount}</strong> {labels.queue}
        </span>
      )}
    </span>
  );
}
