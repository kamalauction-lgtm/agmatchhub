"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Worker } from "@/lib/ai/office-state";
import { STATE_COLOR } from "../office/types";
import type { Identity3D } from "./identity";
import { useAnchor } from "./label-layer";

/**
 * A procedurally built, procedurally rigged specialist.
 *
 * Rig: root → hips → torso → head; shoulder pivots → elbow pivots; hip
 * pivots → knee pivots. Every clip below is written against those pivots in
 * code (no baked animation files), so the same body plays idle / walk / sit /
 * type / stand / notify for any identity sheet.
 *
 * TRUTH RULE. The clip is chosen from the worker state the server decided:
 *   finished  → "type"   (a job ran in the last five minutes)
 *   active    → "sit"    (worked today)
 *   attention → "notify" (a proposal waits for the agent)
 *   error     → "notify" in red
 *   idle      → "idle" at the desk, with an occasional decorative stroll to
 *               the plaza — a stroll is ambience, never a claim of work.
 *   planned / offline → "stand", dimmed.
 * Nothing in this file infers a state; it only draws the one it is given.
 */
export type Clip = "idle" | "walk" | "sit" | "type" | "stand" | "notify";

export function clipFor(state: Worker["state"]): Clip {
  switch (state) {
    case "finished": return "type";
    case "active": return "sit";
    case "attention":
    case "error": return "notify";
    case "idle": return "idle";
    default: return "stand";
  }
}

type Pivots = {
  root: THREE.Group | null;
  hips: THREE.Group | null;
  torso: THREE.Group | null;
  head: THREE.Group | null;
  shoulderL: THREE.Group | null; shoulderR: THREE.Group | null;
  elbowL: THREE.Group | null; elbowR: THREE.Group | null;
  hipL: THREE.Group | null; hipR: THREE.Group | null;
  kneeL: THREE.Group | null; kneeR: THREE.Group | null;
  badge: THREE.Group | null;
  screenGlow: THREE.Mesh | null;
};

const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();

export function Character3D({
  w, id, position, facing = 0, seat, route, motion, selected, onOpen, index, scale = 1,
}: {
  w: Worker;
  id: Identity3D;
  /** Standing spot (desk chair) in world units; feet at y = 0. */
  position: [number, number, number];
  /** Yaw in radians the character faces while at the desk. */
  facing?: number;
  /** Whether a desk/chair exists here (sit/type clips need one). */
  seat: boolean;
  /** Round-trip waypoints for the decorative idle stroll (world coordinates). */
  route?: Array<[number, number, number]>;
  /** False under prefers-reduced-motion: static pose, no per-frame updates. */
  motion: boolean;
  selected: boolean;
  onOpen: () => void;
  index: number;
  /** Uniform body scale (stylised office: figures are larger than life). */
  scale?: number;
}) {
  const p = useRef<Pivots>({
    root: null, hips: null, torso: null, head: null,
    shoulderL: null, shoulderR: null, elbowL: null, elbowR: null,
    hipL: null, hipR: null, kneeL: null, kneeR: null, badge: null, screenGlow: null,
  });
  const clip = clipFor(w.state);
  const color = STATE_COLOR[w.state];
  const anchor = useAnchor(w.key, 2.1);
  const dim = w.state === "planned" || w.state === "offline";

  // Stroll bookkeeping (idle only). Deterministic per character so the office
  // never looks synchronised; nothing here is random at render time.
  const STROLL_EVERY = 26 + (index % 7) * 3; // seconds between strolls
  // First stroll comes early (6–14 s in) so the office is alive on arrival.
  const stroll = useRef({ t: STROLL_EVERY - 6 - (index % 5) * 2, active: false, seg: 0, u: 0 });
  const STROLL_SPEED = 1.35;                   // units per second

  const mats = useMemo(() => ({
    skin: new THREE.MeshStandardMaterial({ color: id.skin, roughness: 0.65 }),
    hair: new THREE.MeshStandardMaterial({ color: id.hair, roughness: 0.55, metalness: 0.05 }),
    suit: new THREE.MeshStandardMaterial({ color: id.suit, roughness: 0.4, metalness: 0.08, transparent: dim, opacity: dim ? 0.55 : 1 }),
    suitDark: new THREE.MeshStandardMaterial({ color: "#2b3447", roughness: 0.5, transparent: dim, opacity: dim ? 0.55 : 1 }),
    accent: new THREE.MeshStandardMaterial({ color: id.accent, emissive: id.accent, emissiveIntensity: dim ? 0.2 : 1.4, roughness: 0.3 }),
    eyeWhite: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.2 }),
    eye: new THREE.MeshStandardMaterial({ color: id.eyes, roughness: 0.2 }),
    mouth: new THREE.MeshStandardMaterial({ color: "#c0607a", roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: "#e3c66f", metalness: 0.9, roughness: 0.25 }),
    glass: new THREE.MeshStandardMaterial({ color: "#1b2233", metalness: 0.8, roughness: 0.3 }),
    shoe: new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.6 }),
    status: new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6 }),
  }), [id, dim, color]);

  const shoulderW = id.build === "slim" ? 0.26 : 0.3;

  useFrame((_, dt) => {
    if (!motion) return;
    const r = p.current;
    if (!r.root) return;
    const t = (r.root.userData.t = (r.root.userData.t ?? index * 1.7) + dt);

    // Reset to neutral each frame, then apply the clip.
    const set = (g: THREE.Group | null, x = 0, y = 0, z = 0) => { if (g) g.rotation.set(x, y, z); };
    set(r.hipL); set(r.hipR); set(r.kneeL); set(r.kneeR);
    set(r.shoulderL); set(r.shoulderR); set(r.elbowL); set(r.elbowR);
    set(r.head); if (r.torso) r.torso.scale.set(1, 1, 1);
    if (r.hips) r.hips.position.y = 0;
    const breathe = Math.sin(t * 1.6) * 0.012;

    // --- Decorative stroll scheduling (idle + a route) -----------------------
    const s = stroll.current;
    if (clip === "idle" && route && route.length > 1) {
      s.t += dt;
      if (!s.active && s.t > STROLL_EVERY) { s.active = true; s.seg = 0; s.u = 0; }
    } else {
      s.active = false; s.t = 0;
    }

    let playing: Clip = clip;
    if (s.active && route) {
      playing = "walk";
      const a = route[s.seg];
      const b = route[s.seg + 1];
      if (!a || !b) {
        s.active = false; s.t = 0;
      } else {
        const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 0.001;
        s.u += (dt * STROLL_SPEED) / len;
        if (s.u >= 1) { s.u = 0; s.seg += 1; if (s.seg >= route.length - 1) { s.active = false; s.t = 0; } }
        const k = Math.min(1, s.u);
        r.root.position.set(a[0] + (b[0] - a[0]) * k, 0, a[2] + (b[2] - a[2]) * k);
        _dir.set(b[0] - a[0], 0, b[2] - a[2]);
        if (_dir.lengthSq() > 0.0001) {
          _target.copy(r.root.position).add(_dir);
          r.root.lookAt(_target);
        }
      }
    }
    if (!s.active) {
      r.root.position.set(position[0], 0, position[2]);
      r.root.rotation.set(0, facing, 0);
    }

    switch (playing) {
      case "walk": {
        const ph = t * 7.5;
        const sw = Math.sin(ph);
        set(r.hipL, sw * 0.6); set(r.hipR, -sw * 0.6);
        set(r.kneeL, Math.max(0, -Math.sin(ph - 0.6)) * 0.9); set(r.kneeR, Math.max(0, Math.sin(ph - 0.6)) * 0.9);
        set(r.shoulderL, -sw * 0.5); set(r.shoulderR, sw * 0.5);
        set(r.elbowL, -0.35); set(r.elbowR, -0.35);
        if (r.hips) r.hips.position.y = Math.abs(Math.cos(ph)) * 0.05;
        set(r.head, 0, Math.sin(t * 0.9) * 0.08, 0);
        break;
      }
      case "sit":
      case "type": {
        if (seat) {
          if (r.hips) r.hips.position.y = -0.42;
          set(r.hipL, -Math.PI / 2); set(r.hipR, -Math.PI / 2);
          set(r.kneeL, Math.PI / 2); set(r.kneeR, Math.PI / 2);
          set(r.shoulderL, -0.9); set(r.shoulderR, -0.9);
          const ty = playing === "type" ? Math.sin(t * 14) * 0.12 : 0;
          set(r.elbowL, -0.9 + ty); set(r.elbowR, -0.9 - ty);
          set(r.head, 0.12 + (playing === "type" ? Math.sin(t * 0.7) * 0.05 : 0), Math.sin(t * 0.5) * 0.06, 0);
        } else if (playing === "type") {
          // Standing at the hub: gesture at the displays, head turned toward them.
          set(r.shoulderR, -1.9 + Math.sin(t * 2.4) * 0.15, 0, -0.5);
          set(r.elbowR, -0.6 + Math.sin(t * 4.8) * 0.2);
          set(r.shoulderL, -0.4, 0, 0.25);
          set(r.elbowL, -1.2);
          set(r.head, -0.08, -0.55 + Math.sin(t * 0.9) * 0.15, 0);
        } else {
          set(r.head, 0, Math.sin(t * 0.7) * 0.1, 0);
        }
        if (r.torso) r.torso.scale.set(1, 1 + breathe, 1);
        break;
      }
      case "notify": {
        const bounce = Math.max(0, Math.sin(t * 5)) * 0.06;
        if (r.hips) r.hips.position.y = bounce;
        set(r.shoulderR, Math.PI - 0.35 + Math.sin(t * 9) * 0.25, 0, -0.3);
        set(r.elbowR, -0.4);
        set(r.shoulderL, 0.1);
        set(r.head, -0.1, Math.sin(t * 2.2) * 0.12, 0);
        if (r.badge) { r.badge.position.y = 2.25 + Math.sin(t * 4) * 0.06; r.badge.rotation.y = t * 1.5; }
        if (r.torso) r.torso.scale.set(1, 1 + breathe, 1);
        break;
      }
      case "stand": {
        set(r.shoulderL, 0.05); set(r.shoulderR, 0.05);
        break;
      }
      default: {
        // idle: breathe, look around, weight shift
        if (r.torso) r.torso.scale.set(1, 1 + breathe, 1);
        set(r.head, Math.sin(t * 0.6) * 0.04, Math.sin(t * 0.45) * 0.25, 0);
        set(r.shoulderL, 0.08 + Math.sin(t * 1.6) * 0.03); set(r.shoulderR, 0.08 - Math.sin(t * 1.6) * 0.03);
        if (r.hips) r.hips.position.y = Math.sin(t * 1.6) * 0.008;
      }
    }
    if (r.screenGlow) {
      const m = r.screenGlow.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = playing === "type" ? 1.2 + Math.sin(t * 6) * 0.5 : playing === "sit" ? 0.9 : 0.35;
    }
  });

  // Static pose for reduced motion: seated clips sit, everything else stands.
  const staticSeated = !motion && seat && (clip === "sit" || clip === "type");

  return (
    <group
      ref={(g) => { p.current.root = g; anchor(g); }}
      position={position}
      rotation={[0, facing, 0]}
      scale={scale}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
    >
      {/* Selection / status ring on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.42, selected ? 0.6 : 0.5, 40]} />
        <meshBasicMaterial color={selected ? "#ffffff" : color} transparent opacity={selected ? 0.9 : 0.45} />
      </mesh>

      <group ref={(g) => { p.current.hips = g; }} position={[0, staticSeated ? -0.42 : 0, 0]}>
        {/* Legs */}
        {([-1, 1] as const).map((side) => (
          <group key={side} ref={(g) => { if (side < 0) p.current.hipL = g; else p.current.hipR = g; }} position={[side * 0.12, 0.95, 0]} rotation={[staticSeated ? -Math.PI / 2 : 0, 0, 0]}>
            <Capsule r={0.095} h={0.3} mat={mats.suitDark} pos={[0, -0.22, 0]} />
            <group ref={(g) => { if (side < 0) p.current.kneeL = g; else p.current.kneeR = g; }} position={[0, -0.46, 0]} rotation={[staticSeated ? Math.PI / 2 : 0, 0, 0]}>
              <Capsule r={0.08} h={0.3} mat={mats.suit} pos={[0, -0.22, 0]} />
              <mesh castShadow position={[0, -0.44, 0.05]} material={mats.shoe}>
                <boxGeometry args={[0.16, 0.08, 0.28]} />
              </mesh>
            </group>
          </group>
        ))}

        {/* Pelvis + torso */}
        <mesh castShadow position={[0, 1.0, 0]} material={mats.suitDark}>
          <boxGeometry args={[0.36, 0.16, 0.24]} />
        </mesh>
        <group ref={(g) => { p.current.torso = g; }} position={[0, 1.05, 0]}>
          <Capsule r={shoulderW * 0.78} h={0.42} mat={mats.suit} pos={[0, 0.3, 0]} />
          {/* Collar + chest emblem (accent) */}
          <mesh position={[0, 0.58, 0]} material={mats.suitDark}>
            <torusGeometry args={[0.13, 0.03, 8, 20]} />
          </mesh>
          <mesh position={[0.12, 0.36, 0.2]} material={mats.accent}>
            <boxGeometry args={[0.07, 0.07, 0.02]} />
          </mesh>
          {/* Shoulder plates */}
          {([-1, 1] as const).map((side) => (
            <mesh key={side} position={[side * shoulderW, 0.5, 0]} material={mats.suitDark}>
              <sphereGeometry args={[0.09, 12, 10]} />
            </mesh>
          ))}

          {/* Arms */}
          {([-1, 1] as const).map((side) => (
            <group key={side} ref={(g) => { if (side < 0) p.current.shoulderL = g; else p.current.shoulderR = g; }} position={[side * (shoulderW + 0.04), 0.48, 0]} rotation={[staticSeated ? -0.9 : 0, 0, 0]}>
              <Capsule r={0.065} h={0.22} mat={mats.suit} pos={[0, -0.17, 0]} />
              <group ref={(g) => { if (side < 0) p.current.elbowL = g; else p.current.elbowR = g; }} position={[0, -0.34, 0]} rotation={[staticSeated ? -0.9 : 0, 0, 0]}>
                <Capsule r={0.055} h={0.2} mat={mats.suit} pos={[0, -0.15, 0]} />
                <mesh position={[0, -0.3, 0]} material={mats.skin}>
                  <sphereGeometry args={[0.07, 12, 10]} />
                </mesh>
                {/* Wrist band accent */}
                <mesh position={[0, -0.24, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.accent}>
                  <torusGeometry args={[0.058, 0.012, 6, 16]} />
                </mesh>
              </group>
            </group>
          ))}

          {/* Neck + head */}
          <mesh position={[0, 0.66, 0]} material={mats.skin}>
            <cylinderGeometry args={[0.06, 0.07, 0.1, 10]} />
          </mesh>
          <group ref={(g) => { p.current.head = g; }} position={[0, 0.72, 0]}>
            <Head id={id} mats={mats} />
          </group>
        </group>
      </group>

      {/* Attention / error badge */}
      {(clip === "notify") && (
        <group ref={(g) => { p.current.badge = g; }} position={[0, 2.25, 0]}>
          <mesh material={mats.status}>
            <octahedronGeometry args={[0.13, 0]} />
          </mesh>
        </group>
      )}

    </group>
  );
}

function Capsule({ r, h, mat, pos = [0, 0, 0] }: { r: number; h: number; mat: THREE.Material; pos?: [number, number, number] }) {
  return (
    <mesh castShadow position={pos} material={mat}>
      <capsuleGeometry args={[r, h, 4, 10]} />
    </mesh>
  );
}

/** Head with identity: hair style, eyes, brows, mouth, ear devices, extras. */
function Head({ id, mats }: { id: Identity3D; mats: Record<string, THREE.Material> }) {
  const R = 0.245;
  return (
    <group>
      <mesh castShadow material={mats.skin}>
        <sphereGeometry args={[R, 24, 18]} />
      </mesh>
      {/* Hair cap */}
      <mesh position={[0, 0.06, -0.04]} material={mats.hair} scale={[1.14, 1.08, 1.12]}>
        <sphereGeometry args={[R, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
      </mesh>
      {/* Fringe */}
      <mesh position={[0, 0.12, 0.13]} rotation={[0.6, 0, 0]} material={mats.hair}>
        <boxGeometry args={[0.36, 0.12, 0.1]} />
      </mesh>
      {id.hairStyle === "bun" && (
        <>
          <mesh position={[0, 0.24, -0.16]} material={mats.hair}><sphereGeometry args={[0.13, 14, 12]} /></mesh>
          <mesh position={[-0.19, -0.02, 0.04]} rotation={[0, 0, 0.2]} material={mats.hair}><capsuleGeometry args={[0.035, 0.22, 4, 8]} /></mesh>
          <mesh position={[0.19, -0.02, 0.04]} rotation={[0, 0, -0.2]} material={mats.hair}><capsuleGeometry args={[0.035, 0.22, 4, 8]} /></mesh>
        </>
      )}
      {id.hairStyle === "long" && (
        <>
          <mesh position={[0, -0.22, -0.12]} material={mats.hair} scale={[1.15, 1.6, 0.7]}><sphereGeometry args={[R, 20, 16]} /></mesh>
          <mesh position={[-0.2, -0.18, 0.06]} rotation={[0, 0, 0.15]} material={mats.hair}><capsuleGeometry args={[0.05, 0.36, 4, 8]} /></mesh>
          <mesh position={[0.2, -0.18, 0.06]} rotation={[0, 0, -0.15]} material={mats.hair}><capsuleGeometry args={[0.05, 0.36, 4, 8]} /></mesh>
        </>
      )}
      {id.hairStyle === "short" && (
        <mesh position={[0, 0.1, -0.06]} material={mats.hair} scale={[1.02, 0.8, 1.02]}><sphereGeometry args={[R, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} /></mesh>
      )}
      {/* Eyes */}
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[s * 0.09, 0.01, R - 0.035]}>
          <mesh material={mats.eyeWhite} scale={[1, 1.25, 0.6]}><sphereGeometry args={[0.046, 12, 10]} /></mesh>
          <mesh position={[0, -0.002, 0.024]} material={mats.eye} scale={[1, 1.3, 0.6]}><sphereGeometry args={[0.027, 10, 8]} /></mesh>
          <mesh position={[0, 0.06, 0.004]} rotation={[0, 0, s * -0.15]} material={mats.hair}><boxGeometry args={[0.07, 0.012, 0.01]} /></mesh>
        </group>
      ))}
      {/* Mouth */}
      <mesh position={[0, -0.085, R - 0.02]} rotation={[0.2, 0, 0]} material={mats.mouth} scale={[1, 0.5, 0.4]}>
        <sphereGeometry args={[0.035, 10, 8]} />
      </mesh>
      {/* Ear devices (every specialist wears the glowing comms piece) */}
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[s * (R + 0.005), -0.01, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.accent}>
          <torusGeometry args={[0.05, 0.016, 8, 18]} />
        </mesh>
      ))}
      {id.glasses && (
        <group position={[0, 0.012, R - 0.005]}>
          {([-1, 1] as const).map((s) => (
            <mesh key={s} position={[s * 0.075, 0, 0]} material={mats.glass}><torusGeometry args={[0.052, 0.007, 8, 20]} /></mesh>
          ))}
          <mesh material={mats.glass}><boxGeometry args={[0.05, 0.008, 0.008]} /></mesh>
        </group>
      )}
      {id.earrings && ([-1, 1] as const).map((s) => (
        <mesh key={s} position={[s * (R + 0.01), -0.11, 0.01]} rotation={[0, Math.PI / 2, 0]} material={mats.gold}>
          <torusGeometry args={[0.045, 0.008, 8, 18]} />
        </mesh>
      ))}
    </group>
  );
}
