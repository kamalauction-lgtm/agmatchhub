"use client";

import { useCallback, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from "react";

/**
 * Zoom-and-pan wrapper for the floor. Works on the SVG viewBox, so the scene
 * stays vector-crisp at every zoom. Wheel zooms around the cursor, drag pans,
 * buttons step and reset; touch drag pans on phones.
 */
export type ViewBox = { x: number; y: number; w: number; h: number };

export function OfficeCanvas({
  base,
  children,
  defs,
  labels,
  ariaLabel,
  className = "",
  initialZoom = 1,
}: {
  /** < 1 starts zoomed in around the centre of the base box. */
  initialZoom?: number;
  base: ViewBox;
  children: ReactNode;
  defs?: ReactNode;
  labels: { zoomIn: string; zoomOut: string; reset: string };
  ariaLabel: string;
  className?: string;
}) {
  const start = (): ViewBox => {
    const w = base.w * initialZoom;
    const h = base.h * initialZoom;
    return { x: base.x + (base.w - w) / 2, y: base.y + (base.h - h) / 2, w, h };
  };
  const [vb, setVb] = useState<ViewBox>(start);
  const drag = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const clamp = (v: ViewBox): ViewBox => {
    const minW = base.w / 4;
    const maxW = base.w * 1.4;
    const w = Math.min(maxW, Math.max(minW, v.w));
    const h = (w * base.h) / base.w;
    return { x: v.x, y: v.y, w, h };
  };

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setVb((cur) => {
      const cx = px ?? cur.x + cur.w / 2;
      const cy = py ?? cur.y + cur.h / 2;
      const next = clamp({ ...cur, w: cur.w * factor, h: cur.h * factor });
      const k = next.w / cur.w;
      return { ...next, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k };
    });
  }, [base.h, base.w]); // eslint-disable-line react-hooks/exhaustive-deps

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: vb.x + ((e.clientX - r.left) / r.width) * vb.w, y: vb.y + ((e.clientY - r.top) / r.height) * vb.h };
  };

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const p = toSvg(e);
    zoomAt(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y);
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, vb };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / r.width) * vb.w;
    const dy = ((e.clientY - drag.current.y) / r.height) * vb.h;
    setVb({ ...drag.current.vb, x: drag.current.vb.x - dx, y: drag.current.vb.y - dy });
  };
  const onUp = () => { drag.current = null; };

  return (
    <div className={`relative h-full ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="office-canvas block h-full w-full touch-pan-y select-none"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      >
        <defs>{defs}</defs>
        {children}
      </svg>
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        {[
          { t: "+", a: () => zoomAt(0.8), l: labels.zoomIn },
          { t: "−", a: () => zoomAt(1.25), l: labels.zoomOut },
          { t: "⟲", a: () => setVb(start()), l: labels.reset },
        ].map((b) => (
          <button
            key={b.t}
            type="button"
            onClick={b.a}
            aria-label={b.l}
            title={b.l}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/20 bg-white/10 text-base font-bold text-white backdrop-blur hover:bg-white/20"
          >
            {b.t}
          </button>
        ))}
      </div>
    </div>
  );
}
