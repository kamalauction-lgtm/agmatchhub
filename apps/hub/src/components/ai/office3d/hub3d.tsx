"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Worker } from "@/lib/ai/office-state";
import { IDENTITY_3D } from "./identity";
import { Character3D } from "./character3d";
import { Plant, PLAZA_C } from "./room3d";
import { useAnchor } from "./label-layer";

const platMat = new THREE.MeshStandardMaterial({ color: "#13254a", roughness: 0.4, metalness: 0.3 });
const platTopMat = new THREE.MeshStandardMaterial({ color: "#1d4ed8", emissive: "#2563eb", emissiveIntensity: 0.45, roughness: 0.3 });
const goldMat = new THREE.MeshStandardMaterial({ color: "#c9a64b", emissive: "#e3c66f", emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.3 });
const sofaMat = new THREE.MeshStandardMaterial({ color: "#243b63", roughness: 0.8 });
const tableMat = new THREE.MeshStandardMaterial({ color: "#3b4a66", roughness: 0.5, metalness: 0.3 });
const plazaMat = new THREE.MeshStandardMaterial({ color: "#0e1f40", roughness: 0.85 });
const screenMat = new THREE.MeshStandardMaterial({ color: "#1e3a8a", emissive: "#60a5fa", emissiveIntensity: 0.8, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const beamMat = new THREE.MeshBasicMaterial({ color: "#60a5fa", transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });

/**
 * Astra's command hub in the centre of the plaza: a lit circular platform,
 * a curved wall of displays behind her, an orbiting ring and lounge seating.
 * A stage, not a claim — her state comes from the same rows as everyone else's.
 */
export function Hub3D({
  manager, motion, selectedKey, onOpen,
}: {
  manager: Worker | null; motion: boolean; selectedKey: string | null; onOpen: (key: string) => void;
}) {
  const hqAnchor = useAnchor("hq", 0);
  const brandAnchor = useAnchor("brand", 0);
  const [cx, cz] = PLAZA_C;
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!motion) return;
    if (ring.current) ring.current.rotation.z = clock.elapsedTime * 0.25;
    if (ring2.current) ring2.current.rotation.z = -clock.elapsedTime * 0.4;
  });
  const id = manager ? IDENTITY_3D[manager.key] : undefined;

  return (
    <group>
      {/* Plaza floor (2 × 2 cells) with gold border rails */}
      <mesh receiveShadow position={[cx, -0.1, cz]} material={plazaMat}><boxGeometry args={[19, 0.2, 19]} /></mesh>
      {([[cx, cz - 9.5, 19, 0.06], [cx, cz + 9.5, 19, 0.06], [cx - 9.5, cz, 0.06, 19], [cx + 9.5, cz, 0.06, 19]] as const).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.02, z]} material={goldMat}><boxGeometry args={[w, 0.03, d]} /></mesh>
      ))}

      {/* Platform */}
      <mesh receiveShadow castShadow position={[cx, 0.15, cz]} material={platMat}><cylinderGeometry args={[4.4, 4.8, 0.3, 48]} /></mesh>
      <mesh position={[cx, 0.31, cz]} rotation={[-Math.PI / 2, 0, 0]} material={platTopMat}><circleGeometry args={[4.2, 48]} /></mesh>
      <mesh ref={ring} position={[cx, 0.33, cz]} rotation={[-Math.PI / 2, 0, 0]} material={goldMat}><ringGeometry args={[4.5, 4.62, 64, 1, 0, Math.PI * 1.6]} /></mesh>
      <mesh ref={ring2} position={[cx, 0.34, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.2, 3.28, 64, 1, 0, Math.PI * 1.2]} />
        <meshBasicMaterial color="#9fb8ff" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Hologram beam */}
      <mesh position={[cx, 2.6, cz]} material={beamMat}><cylinderGeometry args={[1.0, 2.2, 4.6, 32, 1, true]} /></mesh>

      {/* Curved display wall behind Astra (toward −x −z, away from the camera) */}
      {[-0.55, 0, 0.55].map((a, i) => {
        const ang = Math.PI * 1.25 + a; // facing the camera side
        const r = 3.4;
        return (
          <group key={i} position={[cx + Math.cos(ang) * r, 2.1, cz + Math.sin(ang) * r]} rotation={[0, -ang + Math.PI / 2, 0]}>
            <mesh material={screenMat}><planeGeometry args={[2.3, 1.5]} /></mesh>
            <mesh position={[0, 0.85, 0]} material={goldMat}><boxGeometry args={[2.3, 0.05, 0.05]} /></mesh>
          </group>
        );
      })}

      {/* Lounge on the near side */}
      <group position={[cx, 0, cz + 6.8]}>
        <mesh castShadow position={[-2.6, 0.35, 0]} material={sofaMat}><boxGeometry args={[2.4, 0.7, 0.9]} /></mesh>
        <mesh castShadow position={[-2.6, 0.8, -0.38]} material={sofaMat}><boxGeometry args={[2.4, 0.7, 0.2]} /></mesh>
        <mesh castShadow position={[2.6, 0.35, 0]} material={sofaMat}><boxGeometry args={[2.4, 0.7, 0.9]} /></mesh>
        <mesh castShadow position={[2.6, 0.8, -0.38]} material={sofaMat}><boxGeometry args={[2.4, 0.7, 0.2]} /></mesh>
        <mesh castShadow position={[0, 0.3, 0]} material={tableMat}><cylinderGeometry args={[0.7, 0.7, 0.6, 24]} /></mesh>
        <Plant position={[0, 0.6, 0]} />
      </group>
      <Plant position={[cx - 8.3, 0, cz - 8.3]} />
      <Plant position={[cx + 8.3, 0, cz - 8.3]} />

      {manager && id && (
        <group position={[0, 0.3, 0]}>
          <Character3D
            w={manager} id={id} position={[cx, 0, cz]} facing={Math.PI / 4} seat={false} motion={motion} scale={1.7}
            selected={selectedKey === manager.key}
            onOpen={() => onOpen(manager.key)} index={99}
          />
        </group>
      )}

      <group ref={hqAnchor} position={[cx, 5.6, cz]} />
      <group ref={brandAnchor} position={[cx, 0.9, cz + 8.9]} />
    </group>
  );
}
