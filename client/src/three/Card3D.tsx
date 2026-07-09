import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Card } from '@uno3d/shared';
import { backTexture, faceTexture } from './cardTexture';

export const CARD_W = 0.63;
export const CARD_H = 0.88;
const CARD_T = 0.015;
const DAMP = 10; // kecepatan animasi (semakin besar semakin cepat)

export interface CardPose {
  pos: [number, number, number];
  rot: [number, number, number];
}

interface Props {
  card: Card | null; // null = hanya punggung (kartu lawan / draw pile)
  pose: CardPose;
  onClick?: () => void;
  highlight?: boolean;
  /** sisi lokal-z tempat outline highlight (-1 = di belakang muka, 1 = sisi punggung) */
  highlightSide?: 1 | -1;
  /** langsung tempatkan tanpa animasi (spawn pertama) */
  instant?: boolean;
}

export default function Card3D({ card, pose, onClick, highlight, highlightSide = -1, instant }: Props) {
  const ref = useRef<THREE.Group>(null);
  const placed = useRef(false);

  const materials = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({ color: '#f5f5f5' });
    const front = new THREE.MeshStandardMaterial({
      map: card ? faceTexture(card.color, card.value) : backTexture(),
      roughness: 0.6,
    });
    const back = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.6 });
    // urutan material BoxGeometry: +x, -x, +y, -y, +z(front), -z(back)
    return [edge, edge, edge, edge, front, back];
  }, [card?.color, card?.value]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (!placed.current) {
      placed.current = true;
      if (instant) {
        g.position.set(...pose.pos);
        g.rotation.set(...pose.rot);
        return;
      }
    }
    const d = Math.min(dt, 0.05);
    g.position.x = THREE.MathUtils.damp(g.position.x, pose.pos[0], DAMP, d);
    g.position.y = THREE.MathUtils.damp(g.position.y, pose.pos[1], DAMP, d);
    g.position.z = THREE.MathUtils.damp(g.position.z, pose.pos[2], DAMP, d);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, pose.rot[0], DAMP, d);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, pose.rot[1], DAMP, d);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, pose.rot[2], DAMP, d);
  });

  return (
    <group ref={ref} position={[pose.pos[0], pose.pos[1] + 3, pose.pos[2]]}>
      <mesh
        material={materials}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      >
        <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
      </mesh>
      {highlight && (
        <mesh position={[0, 0, highlightSide * 0.012]}>
          <boxGeometry args={[CARD_W + 0.08, CARD_H + 0.08, CARD_T / 2]} />
          <meshBasicMaterial color="#ffe957" transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}
