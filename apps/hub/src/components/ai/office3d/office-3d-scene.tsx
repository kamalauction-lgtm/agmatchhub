"use client";

import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OfficeData, Worker } from "@/lib/ai/office-state";
import type { OfficeLabels } from "../office/types";
import { CELL3, PLAZA_C, Room3D } from "./room3d";
import { Hub3D } from "./hub3d";
import { IDENTITY_3D } from "./identity";
import { Label, LabelLayer, LabelProvider, Projector } from "./label-layer";
import { STATE_COLOR } from "../office/types";

/** Outer ring of the 4 × 4 grid; the inner 2 × 2 is the plaza. */
const RING: Array<[number, number]> = [
  [0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1],
];
const MANAGER_KEY = "ai_manager";

export type Office3DProps = {
  data: OfficeData;
  workers: Worker[];
  labels: OfficeLabels;
  brand: string;
  demo: boolean;
  motion: boolean;
  selectedKey: string | null;
  selectedDept: string | null;
  onOpenWorker: (key: string) => void;
  onOpenRoom: (key: string) => void;
  onClear: () => void;
};

/**
 * Frames the whole floor on mount and whenever the canvas is resized: the
 * camera sits on the same diagonal, at the distance where a sphere around the
 * office just fits the narrower field of view. Zoom afterwards is the user's.
 */
function FitCamera({ target, radius }: { target: [number, number, number]; radius: number }) {
  const { camera, size } = useThree();
  const [tx, ty, tz] = target;
  useEffect(() => {
    const target = [tx, ty, tz] as const;
    const cam = camera as THREE.PerspectiveCamera;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (size.width / size.height));
    const d = radius / Math.sin(Math.min(vFov, hFov) / 2);
    const dir = new THREE.Vector3(1, 0.82, 1).normalize();
    cam.position.set(target[0] + dir.x * d, target[1] + dir.y * d, target[2] + dir.z * d);
    cam.lookAt(target[0], target[1], target[2]);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, tx, ty, tz, radius]);
  return null;
}

/**
 * The 3D office. React Three Fiber scene: a 4 × 4 floor with twelve glass
 * rooms on the ring, Astra's hub in the centre, orbit camera with sensible
 * limits. Transparent canvas so the page's skyline/grid show behind it.
 * Every figure is clickable and reads its state from the server-built data.
 */
export default function Office3DScene({ data, workers, labels, brand, demo, motion, selectedKey, selectedDept, onOpenWorker, onOpenRoom, onClear }: Office3DProps) {
  const byKey = new Map(workers.map((w) => [w.key, w]));
  const manager = byKey.get(MANAGER_KEY) ?? null;
  const stateLabel = (w: Worker) => labels.state[w.state];
  const [cx, cz] = PLAZA_C;
  const target: [number, number, number] = [cx, 0.5, cz];
  const plate = (w: Worker, holo: boolean) => {
    const isDemo = demo && w.access === "open";
    return (
      <Label key={w.key} id={w.key} interactive>
        <button
          type="button"
          onClick={() => onOpenWorker(w.key)}
          aria-label={`${w.persona} · ${w.role} · ${stateLabel(w)}`}
          className={`office3d-plate ${holo ? "office3d-plate-holo" : ""} ${selectedKey === w.key ? "office3d-plate-selected" : ""}`}
          style={{ ["--c" as string]: STATE_COLOR[w.state] } as React.CSSProperties}
        >
          <span className="office3d-plate-row">
            {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized is on; this is a 20px thumbnail in an overlay */}
            {(w.avatar ?? w.portrait) && <img src={w.avatar ?? w.portrait ?? ""} alt="" width={20} height={20} className="office3d-plate-face" />}
            <span className="office3d-plate-name">✦ {w.persona}</span>
          </span>
          <span className="office3d-plate-state"><i aria-hidden />{stateLabel(w)}{isDemo && <b>{labels.demoBadge}</b>}</span>
        </button>
      </Label>
    );
  };

  return (
    <LabelProvider>
    <div className="absolute inset-0">
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ position: [cx + 40, 37, cz + 40], fov: 36, near: 1, far: 300 }}
      frameloop={motion ? "always" : "demand"}
      onPointerMissed={onClear}
      style={{ touchAction: "none" }}
      aria-label={labels.legend}
    >
      <fog attach="fog" args={["#071126", 95, 180]} />
      <ambientLight intensity={0.55} color="#b9cdf5" />
      <hemisphereLight args={["#8fb3ff", "#0a1a3a", 0.5]} />
      <directionalLight
        castShadow position={[cx + 24, 38, cz + 10]} intensity={1.7} color="#eef3ff"
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-near={5} shadow-camera-far={110}
      />
      <pointLight position={[cx, 6, cz]} intensity={40} color="#60a5fa" distance={22} decay={2} />
      <pointLight position={[cx, 3, cz + 7]} intensity={12} color="#e3c66f" distance={14} decay={2} />

      {/* Base plate */}
      <mesh receiveShadow position={[cx, -0.5, cz]}>
        <boxGeometry args={[4 * CELL3 + 3, 0.6, 4 * CELL3 + 3]} />
        <meshStandardMaterial color="#0a162e" roughness={0.9} />
      </mesh>
      <mesh receiveShadow position={[cx, -0.19, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4 * CELL3 + 2, 4 * CELL3 + 2]} />
        <meshStandardMaterial color="#0d1d3d" roughness={0.95} />
      </mesh>

      <Hub3D
        manager={manager} motion={motion} selectedKey={selectedKey} onOpen={onOpenWorker}
      />
      {data.departments.map((d, i) => {
        const [c, r] = RING[i] ?? [i % 4, 3];
        return (
          <Room3D
            key={d.key} deptKey={d.key} u0={c * CELL3} v0={r * CELL3} index={i}
            workers={d.workers.filter((w) => w.key !== MANAGER_KEY).map((w) => byKey.get(w.key) ?? w)}
            selected={selectedDept === d.key} selectedKey={selectedKey} motion={motion}
            onOpenWorker={onOpenWorker} onOpenRoom={() => onOpenRoom(d.key)}
          />
        );
      })}

      <Projector />
      <FitCamera target={target} radius={20} />
      <OrbitControls
        target={target}
        enableDamping dampingFactor={0.08}
        minDistance={16} maxDistance={115}
        minPolarAngle={0.3} maxPolarAngle={1.32}
        screenSpacePanning={false}
        makeDefault
      />
    </Canvas>
    <LabelLayer>
      {workers.map((w) => plate(w, !IDENTITY_3D[w.key]))}
      {data.departments.map((d) => (
        <Label key={d.key} id={`dept:${d.key}`}>
          <span className={`office3d-sign ${selectedDept === d.key ? "office3d-sign-selected" : ""}`}>{labels.departments[d.key] ?? d.key}</span>
        </Label>
      ))}
      <Label id="hq"><span className="office3d-sign office3d-sign-hq">{labels.hq}</span></Label>
      <Label id="brand"><span className="office3d-brand">{brand}</span></Label>
    </LabelLayer>
    </div>
    </LabelProvider>
  );
}
