"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { Worker } from "@/lib/ai/office-state";
import { STATE_COLOR } from "../office/types";
import { IDENTITY_3D, type Identity3D } from "./identity";

/** Only reachable if a role is added to the database without an identity sheet; the roster test guards this. */
const FALLBACK_ID: Identity3D = { persona: "?", sheet: 1, skin: "#e9c0a2", hair: "#2a2230", hairStyle: "short", suit: "#f2f5fb", accent: "#64748b", eyes: "#2e2a36", build: "regular" };
import { Character3D } from "./character3d";
import { useAnchor } from "./label-layer";

/** World size of one grid cell; the floor is a 4 × 4 grid of cells. */
export const CELL3 = 10;
export const PLAZA_C: [number, number] = [2 * CELL3, 2 * CELL3];

export type RoomProps = {
  deptKey: string; u0: number; v0: number; workers: Worker[]; selected: boolean;
  motion: boolean; onOpenWorker: (key: string) => void; onOpenRoom: () => void;
  selectedKey: string | null; index: number;
};

const glassMat = new THREE.MeshPhysicalMaterial({ color: "#9fc3ff", transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
const railMat = new THREE.MeshStandardMaterial({ color: "#2563eb", emissive: "#3b82f6", emissiveIntensity: 1.2 });
const railHotMat = new THREE.MeshStandardMaterial({ color: "#60a5fa", emissive: "#93c5fd", emissiveIntensity: 2.2 });
const carpetMat = new THREE.MeshStandardMaterial({ color: "#16305e", roughness: 0.9 });
const carpetSelMat = new THREE.MeshStandardMaterial({ color: "#1d3f7c", roughness: 0.9, emissive: "#1d4ed8", emissiveIntensity: 0.25 });
const plinthMat = new THREE.MeshStandardMaterial({ color: "#0b1a36", roughness: 0.7 });
const deskMat = new THREE.MeshStandardMaterial({ color: "#1b2b4e", roughness: 0.45, metalness: 0.2 });
const deskEdgeMat = new THREE.MeshStandardMaterial({ color: "#5b7bb5", metalness: 0.7, roughness: 0.3 });
const chairMat = new THREE.MeshStandardMaterial({ color: "#2c3c63", roughness: 0.6 });
const monitorMat = new THREE.MeshStandardMaterial({ color: "#0a1220", roughness: 0.4, metalness: 0.5 });
const potMat = new THREE.MeshStandardMaterial({ color: "#5d6c70", roughness: 0.8 });
const leafMat = new THREE.MeshStandardMaterial({ color: "#1f9d7a", roughness: 0.7 });
const leafMat2 = new THREE.MeshStandardMaterial({ color: "#35aa8a", roughness: 0.7 });

export function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.22, 0]} material={potMat}><cylinderGeometry args={[0.22, 0.17, 0.44, 12]} /></mesh>
      <mesh castShadow position={[0, 0.72, 0]} material={leafMat}><sphereGeometry args={[0.34, 12, 10]} /></mesh>
      <mesh castShadow position={[0.18, 0.95, 0.05]} material={leafMat2}><sphereGeometry args={[0.22, 10, 8]} /></mesh>
      <mesh castShadow position={[-0.16, 0.92, -0.08]} material={leafMat2}><sphereGeometry args={[0.2, 10, 8]} /></mesh>
    </group>
  );
}

/** Desk + two monitors + chair. Screen colour follows the worker state. */
export function Workstation({ position, state, lit }: { position: [number, number, number]; state: Worker["state"]; lit: boolean }) {
  const screen = useMemo(() => new THREE.MeshStandardMaterial({ color: STATE_COLOR[state], emissive: STATE_COLOR[state], emissiveIntensity: lit ? 1.4 : 0.35, toneMapped: false }), [state, lit]);
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.72, 0]} material={deskMat}><boxGeometry args={[1.5, 0.06, 0.7]} /></mesh>
      <mesh position={[0, 0.72, 0.35]} material={deskEdgeMat}><boxGeometry args={[1.5, 0.05, 0.02]} /></mesh>
      {([-0.36, 0.36] as const).map((x) => (
        <mesh key={x} castShadow position={[x, 0.36, 0.1]} material={deskMat}><boxGeometry args={[0.08, 0.72, 0.5]} /></mesh>
      ))}
      {/* Monitors facing the specialist (−z), screens glow outward through the edge. */}
      <group position={[-0.3, 1.02, -0.15]}>
        <mesh material={monitorMat}><boxGeometry args={[0.62, 0.4, 0.04]} /></mesh>
        <mesh position={[0, 0, -0.021]} material={screen}><planeGeometry args={[0.56, 0.34]} /></mesh>
        <mesh position={[0, -0.26, 0]} material={monitorMat}><cylinderGeometry args={[0.03, 0.08, 0.14, 8]} /></mesh>
      </group>
      <group position={[0.38, 0.98, -0.12]} rotation={[0, -0.25, 0]}>
        <mesh material={monitorMat}><boxGeometry args={[0.42, 0.3, 0.04]} /></mesh>
        <mesh position={[0, 0, -0.021]} material={screen}><planeGeometry args={[0.38, 0.26]} /></mesh>
        <mesh position={[0, -0.2, 0]} material={monitorMat}><cylinderGeometry args={[0.03, 0.06, 0.1, 8]} /></mesh>
      </group>
      {/* Chair behind the desk */}
      <group position={[0, 0, -1.1]}>
        <mesh castShadow position={[0, 0.5, 0]} material={chairMat}><boxGeometry args={[0.56, 0.08, 0.56]} /></mesh>
        <mesh castShadow position={[0, 0.85, -0.26]} material={chairMat}><boxGeometry args={[0.52, 0.7, 0.07]} /></mesh>
        <mesh position={[0, 0.25, 0]} material={monitorMat}><cylinderGeometry args={[0.04, 0.04, 0.5, 8]} /></mesh>
        <mesh position={[0, 0.02, 0]} material={monitorMat}><cylinderGeometry args={[0.3, 0.3, 0.04, 12]} /></mesh>
      </group>
    </group>
  );
}

/** Where a room's door is and where its stroll heads, from the room's place on the ring. */
function doorFor(u0: number, v0: number) {
  const cx = u0 + CELL3 / 2, cz = v0 + CELL3 / 2;
  const dx = PLAZA_C[0] - cx, dz = PLAZA_C[1] - cz;
  const horizontal = Math.abs(dx) > Math.abs(dz);
  const door: [number, number, number] = horizontal
    ? [dx > 0 ? u0 + CELL3 - 0.6 : u0 + 0.6, 0, cz]
    : [cx, 0, dz > 0 ? v0 + CELL3 - 0.6 : v0 + 0.6];
  const len = Math.hypot(dx, dz) || 1;
  const plaza: [number, number, number] = [PLAZA_C[0] - (dx / len) * 7.6, 0, PLAZA_C[1] - (dz / len) * 7.6];
  return { door, plaza, horizontal };
}

export function Room3D({ deptKey, u0, v0, workers, selected, motion, onOpenWorker, onOpenRoom, selectedKey, index }: RoomProps) {
  const signAnchor = useAnchor(`dept:${deptKey}`, 0);
  const m = 0.5;
  const hot = workers.some((w) => w.state === "attention" || w.state === "finished");
  const cx = u0 + CELL3 / 2, cz = v0 + CELL3 / 2;
  const { door, plaza, horizontal } = doorFor(u0, v0);
  const rowZ = v0 + 4.0;             // the specialists' row (behind the desks)
  const deskZ = rowZ + 1.55;         // desks in front of them, toward +z
  const aisleX = door[0] < cx ? u0 + 1.0 : u0 + CELL3 - 1.0;

  return (
    <group>
      {/* Plinth + carpet */}
      <mesh receiveShadow position={[cx, -0.08, cz]} material={plinthMat}><boxGeometry args={[CELL3 - 2 * m, 0.16, CELL3 - 2 * m]} /></mesh>
      <mesh
        receiveShadow position={[cx, 0.005, cz]} rotation={[-Math.PI / 2, 0, 0]} material={selected ? carpetSelMat : carpetMat}
        onClick={(e) => { e.stopPropagation(); onOpenRoom(); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}
      >
        <planeGeometry args={[CELL3 - 2 * m - 0.3, CELL3 - 2 * m - 0.3]} />
      </mesh>
      {/* Floor light rails on the two front edges */}
      <mesh position={[cx, 0.02, v0 + CELL3 - m]} material={hot ? railHotMat : railMat}><boxGeometry args={[CELL3 - 2 * m, 0.03, 0.08]} /></mesh>
      <mesh position={[u0 + CELL3 - m, 0.02, cz]} material={hot ? railHotMat : railMat}><boxGeometry args={[0.08, 0.03, CELL3 - 2 * m]} /></mesh>

      {/* Glass partitions on the two back edges, with a lit top rail */}
      <mesh position={[cx, 1.5, v0 + m]} material={glassMat}><planeGeometry args={[CELL3 - 2 * m, 3]} /></mesh>
      <mesh position={[u0 + m, 1.5, cz]} rotation={[0, Math.PI / 2, 0]} material={glassMat}><planeGeometry args={[CELL3 - 2 * m, 3]} /></mesh>
      <mesh position={[cx, 3.0, v0 + m]} material={hot ? railHotMat : railMat}><boxGeometry args={[CELL3 - 2 * m, 0.06, 0.06]} /></mesh>
      <mesh position={[u0 + m, 3.0, cz]} material={hot ? railHotMat : railMat}><boxGeometry args={[0.06, 0.06, CELL3 - 2 * m]} /></mesh>
      {/* Corner posts */}
      {([[u0 + m, v0 + m], [u0 + CELL3 - m, v0 + m], [u0 + m, v0 + CELL3 - m]] as const).map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 1.5, z]} material={deskEdgeMat}><boxGeometry args={[0.08, 3, 0.08]} /></mesh>
      ))}

      {/* Wall display on the back wall */}
      <group position={[cx + 1.2, 2.0, v0 + m + 0.06]}>
        <mesh material={monitorMat}><boxGeometry args={[3.2, 1.5, 0.08]} /></mesh>
        <mesh position={[0, 0, 0.045]}>
          <planeGeometry args={[3.0, 1.32]} />
          <meshStandardMaterial color={hot ? "#1e3a8a" : "#13254a"} emissive={hot ? "#3b82f6" : "#1d4ed8"} emissiveIntensity={hot ? 0.9 : 0.35} />
        </mesh>
      </group>

      <Plant position={[u0 + CELL3 - 1.2, 0, v0 + 1.2]} />
      <Plant position={[u0 + 1.2, 0, v0 + CELL3 - 1.3]} />

      {/* Workstations + specialists */}
      {workers.map((w, i) => {
        const x = u0 + 2.0 + i * 3.0;
        const lit = w.state === "finished" || w.state === "active";
        const pos: [number, number, number] = [x, 0, rowZ];
        const id = IDENTITY_3D[w.key];
        const route: Array<[number, number, number]> = horizontal
          ? [pos, [aisleX, 0, rowZ], door, plaza, door, [aisleX, 0, rowZ], pos]
          : [pos, [aisleX, 0, rowZ], [aisleX, 0, door[2]], door, plaza, door, [aisleX, 0, door[2]], [aisleX, 0, rowZ], pos];
        return (
          <group key={w.key}>
            <group position={[x, 0, deskZ]} scale={1.4}><Workstation position={[0, 0, 0]} state={w.state} lit={lit} /></group>
            <Character3D
              w={w} id={id ?? FALLBACK_ID} position={pos} facing={0} seat route={route} motion={motion} scale={1.45}
              selected={selectedKey === w.key}
              onOpen={() => onOpenWorker(w.key)} index={index * 3 + i}
            />
          </group>
        );
      })}

      {/* Department sign anchor above the back corner (label drawn by the DOM layer) */}
      <group ref={signAnchor} position={[u0 + m + 0.2, 3.55, v0 + m + 0.2]} />
    </group>
  );
}
