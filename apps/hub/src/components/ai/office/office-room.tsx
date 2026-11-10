import type { Worker } from "@/lib/ai/office-state";
import { Box, Chair, Character, Floor, GlassWall, LightStrip, Monitor, Plant, iso } from "./scene-art";
import { STATE_COLOR } from "./types";

/**
 * One department as a glass-walled room on the isometric floor: carpet,
 * partitions on the two back edges with a lit top rail, a name plate above the
 * back corner, one workstation per specialist (desk, monitor, chair) and the
 * specialist at it, plants in the corners. Pure SVG built from scene-art.
 */
export const CELL = 220;

export function OfficeRoom({
  u0, v0, label, workers, selected, demo, demoLabel, onOpenWorker, onOpenRoom, titleOf, stateLabel, index,
}: {
  u0: number; v0: number; label: string; workers: Worker[]; selected: boolean; demo: boolean; demoLabel: string;
  onOpenWorker: (key: string) => void; onOpenRoom: () => void; titleOf: (w: Worker) => string; stateLabel: (w: Worker) => string; index: number;
}) {
  const m = 10;
  const hot = workers.some((w) => w.state === "attention" || w.state === "finished");
  const plate = iso(u0 + CELL / 2, v0 + m, 92);
  const text = label.length > 30 ? `${label.slice(0, 28)}…` : label;
  const pw = Math.min(text.length * 7.2 + 24, CELL + 40);
  const floorPts = [iso(u0 + m, v0 + m), iso(u0 + CELL - m, v0 + m), iso(u0 + CELL - m, v0 + CELL - m), iso(u0 + m, v0 + CELL - m)];

  return (
    <g className={`office-room ${selected ? "office-room-selected" : ""}`}>
      <Floor u={u0 + m} v={v0 + m} w={CELL - 2 * m} d={CELL - 2 * m} />
      {/* Floor light strips along the two front edges. */}
      <LightStrip from={[u0 + m, v0 + CELL - m]} to={[u0 + CELL - m, v0 + CELL - m]} color={hot ? "#60a5fa" : "#2563eb"} />
      <LightStrip from={[u0 + CELL - m, v0 + m]} to={[u0 + CELL - m, v0 + CELL - m]} color={hot ? "#60a5fa" : "#2563eb"} />
      {/* Glass partitions on the back edges. */}
      <GlassWall from={[u0 + m, v0 + m]} to={[u0 + CELL - m, v0 + m]} lit={hot} />
      <GlassWall from={[u0 + m, v0 + m]} to={[u0 + m, v0 + CELL - m]} lit={hot} />

      {/* Room hit area (department panel). */}
      <polygon
        points={floorPts.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="transparent"
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={onOpenRoom}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenRoom(); } }}
        style={{ cursor: "pointer", outline: "none" }}
        className="office-room-hit"
      />

      <Plant u={u0 + CELL - 34} v={v0 + 16} />
      <Plant u={u0 + 16} v={v0 + CELL - 34} />

      {/* Workstations, left to right. */}
      {workers.map((w, i) => {
        const du = u0 + 26 + i * 64;
        const dv = v0 + 86;
        const lit = w.state === "finished" || w.state === "active";
        const pos = iso(du + 23, dv + 58);
        return (
          <g key={w.key}>
            <Box u={du} v={dv} w={46} d={22} h={16} />
            <Monitor u={du + 6} v={dv + 3} h={16} lit={lit} color={STATE_COLOR[w.state]} />
            <Monitor u={du + 28} v={dv + 3} h={16} lit={lit} color={STATE_COLOR[w.state]} size={0.6} />
            <Chair u={du + 17} v={dv + 30} />
            <g transform={`translate(${pos.x} ${pos.y}) scale(1.22)`}>
              <Character
                w={w} x={0} y={0} index={index * 3 + i} demo={demo} demoLabel={demoLabel}
                label={w.persona} stateLabel={stateLabel(w)} title={titleOf(w)} onOpen={() => onOpenWorker(w.key)}
              />
            </g>
          </g>
        );
      })}

      {/* Name plate above the back corner. */}
      <g transform={`translate(${plate.x} ${plate.y})`} style={{ pointerEvents: "none" }}>
        <rect x={-pw / 2} y="-12" width={pw} height="24" rx="7" fill="rgba(11,27,51,0.94)" stroke="rgba(201,166,75,0.7)" strokeWidth="1" />
        <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="#e3c66f" style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}>{text}</text>
      </g>
    </g>
  );
}

/**
 * The command hub in the centre of the floor: a circular lit platform with
 * Astra (the AI Manager) on it, an orbiting hologram ring, and lounge seating
 * around the plaza. The platform is a stage, not a claim — Astra's state and
 * numbers come from the same rows as everyone else's.
 */
export function CommandHub({
  u0, v0, size, manager, hqLabel, demo, demoLabel, onOpen, titleOf, stateLabel,
}: {
  u0: number; v0: number; size: number; manager: Worker | null; hqLabel: string; demo: boolean; demoLabel: string;
  onOpen: (key: string) => void; titleOf: (w: Worker) => string; stateLabel: (w: Worker) => string;
}) {
  const cu = u0 + size / 2;
  const cv = v0 + size / 2;
  const c = iso(cu, cv);
  const m = 16;
  return (
    <g className="office-hub">
      <Floor u={u0 + m} v={v0 + m} w={size - 2 * m} d={size - 2 * m} fill="url(#plazaFloor)" stroke="rgba(159,184,255,0.2)" />
      <LightStrip from={[u0 + m, v0 + size - m]} to={[u0 + size - m, v0 + size - m]} color="#c9a64b" />
      <LightStrip from={[u0 + size - m, v0 + m]} to={[u0 + size - m, v0 + size - m]} color="#c9a64b" />
      <LightStrip from={[u0 + m, v0 + m]} to={[u0 + size - m, v0 + m]} color="#c9a64b" />
      <LightStrip from={[u0 + m, v0 + m]} to={[u0 + m, v0 + size - m]} color="#c9a64b" />

      {/* Lounge: two sofas and a table on the near side. */}
      <Box u={u0 + 60} v={v0 + size - 90} w={70} d={24} h={14} top="#243b63" left="#15274a" right="#1b2f56" />
      <Box u={u0 + size - 130} v={v0 + size - 90} w={70} d={24} h={14} top="#243b63" left="#15274a" right="#1b2f56" />
      <Box u={u0 + size / 2 - 22} v={v0 + size - 80} w={44} d={26} h={10} top="#3b4a66" left="#1e293b" right="#273449" />
      <Plant u={u0 + 30} v={v0 + 30} />
      <Plant u={u0 + size - 44} v={v0 + 30} />

      {/* Platform rings. */}
      <ellipse cx={c.x} cy={c.y + 4} rx="118" ry="59" fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeOpacity="0.6" />
      <ellipse cx={c.x} cy={c.y + 4} rx="96" ry="48" fill="url(#hubFloor)" stroke="#9fb8ff" strokeOpacity="0.7" strokeWidth="1.5" />
      <ellipse cx={c.x} cy={c.y + 4} rx="110" ry="55" fill="none" stroke="#c9a64b" strokeWidth="1.2" strokeDasharray="6 10" className="office-orbit" />
      <ellipse cx={c.x} cy={c.y + 4} rx="70" ry="35" fill="none" stroke="#9fb8ff" strokeWidth="1" strokeDasharray="3 9" className="office-orbit-rev" />
      {/* Hologram pillar of light behind the manager. */}
      <polygon points={`${c.x - 40},${c.y} ${c.x + 40},${c.y} ${c.x + 26},${c.y - 150} ${c.x - 26},${c.y - 150}`} fill="url(#holoBeam)" className="office-glow" style={{ pointerEvents: "none" }} />

      {manager && (
        <g transform={`translate(${c.x} ${c.y - 4}) scale(1.5)`}>
          <Character
            w={manager} x={0} y={0} index={99} demo={demo} demoLabel={demoLabel}
            label={manager.persona} stateLabel={stateLabel(manager)} title={titleOf(manager)} onOpen={() => onOpen(manager.key)}
          />
        </g>
      )}
      <g transform={`translate(${c.x} ${c.y - 172})`} style={{ pointerEvents: "none" }}>
        <rect x="-96" y="-13" width="192" height="26" rx="8" fill="rgba(11,27,51,0.95)" stroke="#c9a64b" strokeOpacity="0.9" />
        <text y="4.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#e3c66f" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>{hqLabel}</text>
      </g>
    </g>
  );
}
