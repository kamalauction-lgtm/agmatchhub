"use client";

import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { Worker } from "@/lib/ai/office-state";
import { STATE_COLOR } from "../office/types";
import { useAnchor } from "./label-layer";

/**
 * Holographic identity stand for a specialist whose 3D body is not built yet.
 *
 * It is NOT a generic replacement: the stand carries that specialist's own
 * portrait from `ai_role_personas`, their name and their live state, sits at
 * their own workstation in their own department and opens their inspector.
 * Once the body system is extended (after prototype acceptance) each stand is
 * swapped for a Character3D with that specialist's identity sheet.
 */
export function HoloStand({
  w, position, motion, selected, onOpen, index, scale = 1,
}: {
  w: Worker;
  position: [number, number, number];
  motion: boolean;
  selected: boolean;
  onOpen: () => void;
  index: number;
  scale?: number;
}) {
  const src = w.portrait ?? w.avatar ?? "";
  const loaded = useLoader(THREE.TextureLoader, src || "/ai/characters/ai_manager-avatar.webp");
  // Portraits are sRGB images; a fresh copy carries the colour space so the
  // shared loader cache is never mutated.
  const tex = useMemo(() => { const t = loaded.clone(); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; }, [loaded]);
  const card = useRef<THREE.Group>(null);
  const color = STATE_COLOR[w.state];
  const dim = w.state === "planned" || w.state === "offline";
  const anchor = useAnchor(w.key, 2.0);

  useFrame(({ clock }) => {
    if (!motion || !card.current) return;
    const t = clock.elapsedTime + index * 0.9;
    card.current.position.y = 1.25 + Math.sin(t * 1.4) * 0.04;
    card.current.rotation.y = Math.sin(t * 0.5) * 0.08;
  });

  return (
    <group
      ref={anchor}
      position={position}
      scale={scale}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
    >
      {/* Emitter base */}
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.4, 0.12, 24]} />
        <meshStandardMaterial color="#17264a" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.125, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.3, 32]} />
        <meshBasicMaterial color={selected ? "#ffffff" : color} transparent opacity={dim ? 0.35 : 0.9} />
      </mesh>
      {/* Light cone */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.42, 0.18, 1.1, 24, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={dim ? 0.05 : 0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Portrait card */}
      <group ref={card} position={[0, 1.25, 0]}>
        <mesh>
          <planeGeometry args={[0.78, 0.98]} />
          <meshBasicMaterial map={tex} transparent opacity={dim ? 0.55 : 0.96} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[0.86, 1.06]} />
          <meshBasicMaterial color={selected ? "#ffffff" : color} transparent opacity={selected ? 0.9 : 0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
