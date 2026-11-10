import type { Worker } from "@/lib/ai/office-state";
import { STATE_COLOR } from "./types";
import { ActivityNodeSvg } from "./activity-node";

/**
 * One department as an isometric room: a floor slab with two raised walls,
 * a window strip on the back wall, a name plate, three desks with glowing
 * monitors, and one character per desk. Pure SVG; animation is CSS driven by
 * the state class so reduced-motion can switch it all off.
 */
export const TILE_W = 236;
export const TILE_H = 118;
export const WALL_H = 54;

export type RoomPos = { x: number; y: number };

const DESKS: Array<[number, number]> = [
  [-52, 40], [0, 62], [52, 84],
];

export function OfficeRoom({
  pos,
  label,
  workers,
  selected,
  demo,
  demoLabel,
  onOpenWorker,
  onOpenRoom,
  titleOf,
}: {
  pos: RoomPos;
  label: string;
  workers: Worker[];
  selected: boolean;
  demo: boolean;
  demoLabel: string;
  onOpenWorker: (key: string) => void;
  onOpenRoom: () => void;
  titleOf: (w: Worker) => string;
}) {
  const { x, y } = pos;
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  const floor = `${x},${y} ${x + hw},${y + hh} ${x},${y + TILE_H} ${x - hw},${y + hh}`;
  // Back-left and back-right walls rise from the two upper edges of the slab.
  const wallL = `${x - hw},${y + hh} ${x},${y} ${x},${y - WALL_H} ${x - hw},${y + hh - WALL_H}`;
  const wallR = `${x},${y} ${x + hw},${y + hh} ${x + hw},${y + hh - WALL_H} ${x},${y - WALL_H}`;
  const hot = workers.some((w) => w.state === "attention" || w.state === "finished");

  return (
    <g className={`office-room ${selected ? "office-room-selected" : ""} ${hot ? "office-room-hot" : ""}`}>
      {/* Walls (behind everything in this room). */}
      <polygon points={wallL} fill="rgba(31,58,107,0.55)" stroke="rgba(159,184,255,0.25)" />
      <polygon points={wallR} fill="rgba(18,38,74,0.7)" stroke="rgba(159,184,255,0.25)" />
      {/* Window strip on the right wall: three panes of skyline light. */}
      {[0.18, 0.44, 0.7].map((t) => {
        const wx = x + hw * t;
        const wy = y + hh * t;
        return (
          <polygon
            key={t}
            points={`${wx},${wy - WALL_H + 10} ${wx + hw * 0.16},${wy + hh * 0.16 - WALL_H + 10} ${wx + hw * 0.16},${wy + hh * 0.16 - WALL_H + 30} ${wx},${wy - WALL_H + 30}`}
            fill="rgba(159,184,255,0.22)"
            className="office-window"
          />
        );
      })}
      {/* Floor slab with a raised edge. */}
      <polygon points={floor} fill="url(#roomFloor)" stroke="rgba(159,184,255,0.35)" strokeWidth="1.2" />
      <polygon points={`${x - hw},${y + hh} ${x},${y + TILE_H} ${x},${y + TILE_H + 9} ${x - hw},${y + hh + 9}`} fill="rgba(0,0,0,0.38)" />
      <polygon points={`${x},${y + TILE_H} ${x + hw},${y + hh} ${x + hw},${y + hh + 9} ${x},${y + TILE_H + 9}`} fill="rgba(0,0,0,0.26)" />
      {/* Clickable room hit area (opens the department panel). */}
      <polygon
        points={floor}
        fill="transparent"
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={onOpenRoom}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenRoom(); } }}
        style={{ cursor: "pointer", outline: "none" }}
        className="office-room-hit"
      />
      {/* Name plate above the back corner, where no character stands. */}
      {(() => {
        const text = label.length > 30 ? `${label.slice(0, 28)}…` : label;
        const w = Math.min(text.length * 5.9 + 18, TILE_W - 10);
        return (
          <g transform={`translate(${x} ${y - WALL_H - 12})`} style={{ pointerEvents: "none" }}>
            <rect x={-w / 2} y="-9" width={w} height="16" rx="4" fill="rgba(11,27,51,0.92)" stroke="rgba(201,166,75,0.6)" />
            <text y="3" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#e3c66f" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {text}
            </text>
          </g>
        );
      })()}

      {workers.map((w, j) => {
        const [dx, dy] = DESKS[j] ?? DESKS[1];
        const color = STATE_COLOR[w.state];
        const dim = w.state === "planned" || w.state === "offline";
        const working = w.state === "finished" || w.state === "active";
        return (
          <g key={w.key} transform={`translate(${x + dx} ${y + dy})`}>
            <g className={`office-char office-${w.state}`} style={{ ["--i" as string]: j } as React.CSSProperties}>
              {/* Desk block + monitor. */}
              <polygon points="-22,12 0,23 22,12 0,1" fill="#0b1b33" stroke="rgba(255,255,255,0.2)" />
              <polygon points="-22,12 0,23 0,29 -22,18" fill="#06101f" />
              <polygon points="0,23 22,12 22,18 0,29" fill="#081426" />
              <polygon points="6,2 20,-5 20,5 6,12" fill={working ? "#9fb8ff" : "#1e3a5f"} className={working ? "office-monitor" : ""} />
              {working && <circle cx="13" cy="4" r="18" fill="url(#monitorGlow)" className="office-glow" />}

              <g
                role="button"
                tabIndex={0}
                aria-label={titleOf(w)}
                onClick={(e) => { e.stopPropagation(); onOpenWorker(w.key); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpenWorker(w.key); } }}
                style={{ cursor: "pointer", outline: "none" }}
                className="office-body office-hit"
              >
                <title>{titleOf(w)}</title>
                <rect x="-26" y="-72" width="52" height="104" fill="transparent" />
                {/* Digital operator body: a rounded suit with a status seam. */}
                <path d="M-13 4 Q-13 -12 0 -12 Q13 -12 13 4 Z" fill={dim ? "#334155" : "#17305c"} stroke={color} strokeOpacity="0.8" strokeWidth="1.2" />
                <rect x="-2" y="-10" width="4" height="12" rx="2" fill={color} opacity={dim ? 0.4 : 0.9} />
                {/* Helmet ring + avatar. */}
                <g transform="translate(0 -28)" style={{ opacity: dim ? 0.45 : 1, filter: dim ? "grayscale(1)" : undefined }}>
                  <circle r="21" fill="rgba(255,255,255,0.08)" stroke={color} strokeOpacity="0.35" strokeWidth="6" />
                  <circle r="18" fill="#ffffff" />
                  {w.avatar ? (
                    <image href={w.avatar} x="-16" y="-16" width="32" height="32" clipPath={`url(#clip-${w.key})`} preserveAspectRatio="xMidYMid slice" />
                  ) : (
                    <text y="5" textAnchor="middle" fontSize="15" fill="#1e3a8a">✦</text>
                  )}
                  <circle r="18" fill="none" stroke={color} strokeWidth="2.5" />
                </g>
                <ActivityNodeSvg w={w} demo={demo} demoLabel={demoLabel} />
              </g>
            </g>
            <text y="42" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="rgba(255,255,255,0.9)" style={{ pointerEvents: "none" }}>
              {w.persona}
            </text>
          </g>
        );
      })}
    </g>
  );
}
