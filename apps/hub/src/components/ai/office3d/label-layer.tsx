"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * One DOM layer for every label in the 3D office.
 *
 * Objects inside the Canvas register an anchor (their Object3D plus a height
 * offset) under an id; the label layer outside the Canvas renders ordinary
 * DOM for the same ids. Each frame the Projector writes screen positions
 * straight onto those DOM nodes — no per-label React roots, so labels are
 * crisp, translated, keyboard reachable and cheap even with fifty of them.
 */
type Anchor = { obj: THREE.Object3D; y: number };
type Registry = { anchors: Map<string, Anchor>; els: Map<string, HTMLElement> };

const Ctx = createContext<Registry | null>(null);

export function LabelProvider({ children }: { children: ReactNode }) {
  const [reg] = useState<Registry>(() => ({ anchors: new Map(), els: new Map() }));
  return <Ctx.Provider value={reg}>{children}</Ctx.Provider>;
}

/** Inside the Canvas: returns a ref callback for the Object3D the label follows. */
export function useAnchor(id: string, y: number) {
  const reg = useContext(Ctx);
  return useCallback((obj: THREE.Object3D | null) => {
    if (!reg) return;
    if (obj) reg.anchors.set(id, { obj, y });
    else reg.anchors.delete(id);
  }, [reg, id, y]);
}

const _v = new THREE.Vector3();

/** Inside the Canvas: projects every anchor onto its DOM node each frame. */
export function Projector() {
  const reg = useContext(Ctx);
  const { camera, size } = useThree();
  useFrame(() => {
    if (!reg) return;
    for (const [id, a] of reg.anchors) {
      const el = reg.els.get(id);
      if (!el) continue;
      a.obj.getWorldPosition(_v);
      _v.y += a.y * a.obj.getWorldScale(new THREE.Vector3()).y;
      const dist = _v.distanceTo(camera.position);
      _v.project(camera);
      const behind = _v.z > 1;
      const x = (_v.x * 0.5 + 0.5) * size.width;
      const yy = (-_v.y * 0.5 + 0.5) * size.height;
      // Narrow canvases (phones) let labels shrink further so 36 plates stay legible as a crowd.
      const s = Math.min(1.1, Math.max(size.width < 640 ? 0.42 : 0.62, 34 / dist));
      el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${yy.toFixed(1)}px) scale(${s.toFixed(3)})`;
      el.style.zIndex = String(Math.round((1 - Math.min(1, Math.max(0, _v.z))) * 100000));
      el.style.visibility = behind ? "hidden" : "visible";
    }
  });
  return null;
}

/** Outside the Canvas: the DOM for one label, positioned by the Projector. */
export function Label({ id, children, interactive = false }: { id: string; children: ReactNode; interactive?: boolean }) {
  const reg = useContext(Ctx);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!reg) return;
    if (el) reg.els.set(id, el);
    else reg.els.delete(id);
  }, [reg, id]);
  return (
    <div ref={ref} className="office3d-label" style={{ pointerEvents: interactive ? "auto" : "none", visibility: "hidden" }}>
      {children}
    </div>
  );
}

export function LabelLayer({ children }: { children: ReactNode }) {
  return <div aria-hidden={false} className="office3d-labels pointer-events-none absolute inset-0 overflow-hidden">{children}</div>;
}
