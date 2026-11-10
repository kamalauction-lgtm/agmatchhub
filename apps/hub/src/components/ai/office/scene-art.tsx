import type { Worker } from "@/lib/ai/office-state";
import { STATE_COLOR } from "./types";

/**
 * Vector furniture for the Live Office. Every piece is drawn in isometric
 * space from a few constants so the whole scene scales with one viewBox and
 * stays crisp at any zoom. Nothing here is a bitmap except the persona
 * portraits, which are the owner's approved character art.
 *
 * Isometric helpers: a point (u, v) on the floor maps to screen
 *   x = (u - v) * COS, y = (u + v) * SIN  where COS = 1, SIN = 0.5.
 * Heights go straight up (negative y).
 */
export const ISO = { cos: 1, sin: 0.5 };
export const iso = (u: number, v: number, h = 0) => ({ x: (u - v) * ISO.cos, y: (u + v) * ISO.sin - h });

const P = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/** A flat floor quad from (u,v) with size (w,d). */
export function Floor({ u, v, w, d, fill = "url(#floorCarpet)", stroke = "rgba(159,184,255,0.28)" }: { u: number; v: number; w: number; d: number; fill?: string; stroke?: string }) {
  return <polygon points={P([iso(u, v), iso(u + w, v), iso(u + w, v + d), iso(u, v + d)])} fill={fill} stroke={stroke} strokeWidth="1" />;
}

/** A vertical glass partition along one floor edge, with a lit top rail. */
export function GlassWall({ from, to, h = 70, lit = false }: { from: [number, number]; to: [number, number]; h?: number; lit?: boolean }) {
  const a = iso(from[0], from[1]);
  const b = iso(to[0], to[1]);
  const a2 = iso(from[0], from[1], h);
  const b2 = iso(to[0], to[1], h);
  return (
    <g>
      <polygon points={P([a, b, b2, a2])} fill="rgba(120,160,230,0.14)" stroke="rgba(159,184,255,0.35)" strokeWidth="1" />
      {/* Mullions */}
      {[0.33, 0.66].map((t) => {
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        return <line key={t} x1={x} y1={y} x2={x} y2={y - h} stroke="rgba(159,184,255,0.25)" />;
      })}
      <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} stroke={lit ? "#9fb8ff" : "rgba(159,184,255,0.5)"} strokeWidth={lit ? 2.5 : 1.5} className={lit ? "office-light" : undefined} />
    </g>
  );
}

/** A low isometric box (desk, cabinet, platform). */
export function Box({ u, v, w, d, h, top = "#1c3561", left = "#0f2244", right = "#132b55", stroke = "rgba(159,184,255,0.3)", className }: {
  u: number; v: number; w: number; d: number; h: number; top?: string; left?: string; right?: string; stroke?: string; className?: string;
}) {
  const t = [iso(u, v, h), iso(u + w, v, h), iso(u + w, v + d, h), iso(u, v + d, h)];
  const l = [iso(u, v + d, h), iso(u + w, v + d, h), iso(u + w, v + d), iso(u, v + d)];
  const r = [iso(u + w, v, h), iso(u + w, v + d, h), iso(u + w, v + d), iso(u + w, v)];
  return (
    <g className={className}>
      <polygon points={P(l)} fill={left} stroke={stroke} strokeWidth="0.8" />
      <polygon points={P(r)} fill={right} stroke={stroke} strokeWidth="0.8" />
      <polygon points={P(t)} fill={top} stroke={stroke} strokeWidth="0.8" />
    </g>
  );
}

/** A monitor standing on a desk top at height h, facing the viewer (front-right). Screen content is a tiny chart. */
export function Monitor({ u, v, h, lit, color = "#60a5fa", size = 1 }: { u: number; v: number; h: number; lit: boolean; color?: string; size?: number }) {
  const w = 22 * size;
  const sh = 15 * size;
  const base = iso(u, v, h);
  // Screen is a vertical quad along the "right" wall direction.
  const a = iso(u, v, h + 3);
  const b = iso(u + w, v, h + 3);
  const a2 = iso(u, v, h + 3 + sh);
  const b2 = iso(u + w, v, h + 3 + sh);
  return (
    <g>
      <line x1={base.x + w / 2} y1={base.y} x2={base.x + w / 2} y2={base.y - 3} stroke="#64748b" strokeWidth="2" />
      <polygon points={P([a, b, b2, a2])} fill={lit ? "#0b1b33" : "#0a1428"} stroke={lit ? color : "#334155"} strokeWidth="1" />
      {lit && (
        <g className="office-screen" opacity="0.95">
          {/* Three bars and a line: a dashboard, not a message. */}
          <line x1={a.x + 3} y1={a.y - 4} x2={a.x + 3} y2={a.y - 9} stroke={color} strokeWidth="2" />
          <line x1={a.x + 7} y1={a.y - 2} x2={a.x + 7} y2={a.y - 11} stroke={color} strokeWidth="2" />
          <line x1={a.x + 11} y1={a.y - 3} x2={a.x + 11} y2={a.y - 8} stroke={color} strokeWidth="2" />
          <polyline points={`${a.x + 14},${a.y - 6} ${a.x + 17},${a.y - 10} ${a.x + 20},${a.y - 8}`} fill="none" stroke="#c9a64b" strokeWidth="1.2" />
        </g>
      )}
      {lit && <ellipse cx={(a.x + b.x) / 2} cy={a.y - sh / 2} rx={w} ry={sh} fill={color} opacity="0.08" className="office-glow" />}
    </g>
  );
}

/** A task chair: seat box + backrest. */
export function Chair({ u, v, color = "#1e293b" }: { u: number; v: number; color?: string }) {
  return (
    <g>
      <Box u={u} v={v} w={12} d={12} h={9} top={color} left="#0f172a" right="#111c33" stroke="rgba(148,163,184,0.25)" />
      <Box u={u} v={v + 10} w={12} d={2} h={20} top={color} left="#0f172a" right="#111c33" stroke="rgba(148,163,184,0.25)" />
    </g>
  );
}

/** A potted plant: pot box + three leaf ellipses. */
export function Plant({ u, v }: { u: number; v: number }) {
  const p = iso(u + 5, v + 5, 10);
  return (
    <g>
      <Box u={u} v={v} w={10} d={10} h={10} top="#334155" left="#1e293b" right="#273449" />
      <ellipse cx={p.x - 5} cy={p.y - 8} rx="7" ry="9" fill="#1f7a4d" />
      <ellipse cx={p.x + 5} cy={p.y - 10} rx="7" ry="10" fill="#2a9d64" />
      <ellipse cx={p.x} cy={p.y - 15} rx="6" ry="9" fill="#34b574" />
    </g>
  );
}

/** A floor light strip between two floor points. */
export function LightStrip({ from, to, color = "#2563eb" }: { from: [number, number]; to: [number, number]; color?: string }) {
  const a = iso(from[0], from[1]);
  const b = iso(to[0], to[1]);
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth="6" opacity="0.18" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth="1.6" className="office-light" />
    </g>
  );
}

/**
 * A character at their workstation: the persona PORTRAIT (owner-approved art)
 * in a holographic frame standing behind the desk, a status ring, and the
 * live activity node above. Recognisable at floor scale, which a 16-px avatar
 * dot was not.
 */
export function Character({
  w, x, y, demo, demoLabel, label, stateLabel, onOpen, title, index,
}: {
  w: Worker; x: number; y: number; demo: boolean; demoLabel: string; label: string; stateLabel: string;
  onOpen: () => void; title: string; index: number;
}) {
  const color = STATE_COLOR[w.state];
  const dim = w.state === "planned" || w.state === "offline";
  const working = w.state === "finished";
  const fw = 46;
  const fh = 54;
  const count = w.state === "attention" ? w.queueCount : w.todayCount;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={`office-char office-${w.state}`} style={{ ["--i" as string]: index } as React.CSSProperties}>
        {/* Floor shadow */}
        <ellipse cx="0" cy="4" rx="16" ry="6" fill="rgba(0,0,0,0.35)" />
        <g
          role="button"
          tabIndex={0}
          aria-label={title}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpen(); } }}
          style={{ cursor: "pointer", outline: "none" }}
          className="office-body office-hit"
        >
          <title>{title}</title>
          <rect x={-fw / 2 - 6} y={-fh - 28} width={fw + 12} height={fh + 40} fill="transparent" />
          {/* Holographic frame */}
          <rect x={-fw / 2} y={-fh} width={fw} height={fh} rx="8" fill="rgba(11,27,51,0.9)" stroke={color} strokeWidth="1.5" style={{ opacity: dim ? 0.5 : 1 }} />
          <rect x={-fw / 2 + 2} y={-fh + 2} width={fw - 4} height={fh - 4} rx="6" fill="#0f2244" />
          {w.portrait ? (
            <image
              href={w.portrait}
              x={-fw / 2 + 2} y={-fh + 2} width={fw - 4} height={fh - 4}
              preserveAspectRatio="xMidYMin slice"
              clipPath={`url(#pclip-${w.key})`}
              style={{ filter: dim ? "grayscale(1) brightness(.7)" : undefined }}
            />
          ) : (
            <text y={-fh / 2 + 6} textAnchor="middle" fontSize="18" fill="#9fb8ff">✦</text>
          )}
          {/* Scanline sheen */}
          <rect x={-fw / 2 + 2} y={-fh + 2} width={fw - 4} height={fh - 4} rx="6" fill="url(#holoSheen)" opacity="0.35" style={{ pointerEvents: "none" }} />
          {/* Name + state plate */}
          <g transform={`translate(0 ${10})`}>
            <rect x="-34" y="-8" width="68" height="16" rx="5" fill="rgba(11,27,51,0.95)" stroke={color} strokeOpacity="0.7" />
            <circle cx="-26" cy="0" r="3" fill={color} className={working || w.state === "attention" ? "office-pulse-svg" : undefined} />
            <text x="2" y="3.4" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#ffffff">{label}</text>
          </g>
          <text y="27" textAnchor="middle" fontSize="7.5" fontWeight="600" fill={color}>{stateLabel}</text>
          {/* Activity node */}
          <g transform={`translate(0 ${-fh - 12})`}>
            {working && (
              <g>
                <rect x="-16" y="-7" width="32" height="14" rx="7" fill="#0b1b33" stroke={color} strokeOpacity="0.7" />
                <circle cx="-7" cy="0" r="2" fill={color} className="office-dot office-dot-1" />
                <circle cx="0" cy="0" r="2" fill={color} className="office-dot office-dot-2" />
                <circle cx="7" cy="0" r="2" fill={color} className="office-dot office-dot-3" />
              </g>
            )}
            {w.state === "attention" && (
              <g>
                <circle r="10" fill="none" stroke={color} strokeWidth="2" className="office-ring" />
                <rect x="-8" y="-9" width="16" height="16" rx="5" fill={color} />
                <text y="3" textAnchor="middle" fontSize="11" fontWeight="800" fill="#0b1b33">!</text>
              </g>
            )}
            {w.state === "active" && (
              <g>
                <circle r="7" fill={color} />
                <path d="M-3.5 0 L-1 2.5 L3.5 -2.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            {w.state === "error" && (
              <g>
                <rect x="-8" y="-9" width="16" height="16" rx="5" fill={color} />
                <text y="3" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">×</text>
              </g>
            )}
            {count > 0 && w.state !== "attention" && (
              <g transform="translate(18 -4)">
                <circle r="6.5" fill="#fff" />
                <text y="2.4" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#0b1b33">{count}</text>
              </g>
            )}
            {demo && (
              <g transform="translate(-40 -14)">
                <rect width="24" height="10" rx="3" fill="#c9a64b" />
                <text x="12" y="7.6" textAnchor="middle" fontSize="7" fontWeight="800" fill="#0b1b33">{demoLabel}</text>
              </g>
            )}
          </g>
        </g>
      </g>
    </g>
  );
}
