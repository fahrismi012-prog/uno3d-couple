import { Canvas } from '@react-three/fiber';
import type { Card, PlayerView } from '@uno3d/shared';
import Card3D, { CardPose } from './Card3D';

interface Props {
  view: PlayerView;
  myTurn: boolean;
  onPlay: (card: Card) => void;
  onDraw: () => void;
}

/** pose kipas kartu: index i dari n kartu, di sisi pemain (dir=1) atau lawan (dir=-1) */
function fanPose(i: number, n: number, dir: 1 | -1, raised = false): CardPose {
  const spread = Math.min(0.62, 5.4 / Math.max(n, 1));
  const x = (i - (n - 1) / 2) * spread * dir;
  const arc = Math.abs(i - (n - 1) / 2) * 0.03;
  return {
    pos: [x, 0.55 + (raised ? 0.35 : 0) - arc, dir === 1 ? 3.05 : -2.55],
    rot: [dir === 1 ? -1.05 : 1.25, dir === 1 ? 0 : Math.PI, (i - (n - 1) / 2) * -0.06 * dir],
  };
}

const DISCARD: CardPose = { pos: [0.75, 0.06, 0], rot: [-Math.PI / 2, 0, -0.15] };
const DRAW_BASE: [number, number, number] = [-0.85, 0.03, 0];

export default function GameScene({ view, myTurn, onPlay, onDraw }: Props) {
  const n = view.hand.length;
  const oppN = view.opponentCount;
  const drawStack = Math.max(1, Math.min(6, Math.ceil(view.drawPileCount / 15)));
  const canDraw = myTurn && view.drawnCardId === null && view.phase === 'playing';

  return (
    <Canvas
      camera={{ position: [0, 8.4, 5.6], fov: 45 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0.35)}
      dpr={[1, 2]}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 8, 4]} intensity={1.2} />

      {/* meja */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[16, 12]} />
        <meshStandardMaterial color="#175e2e" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[2.6, 48]} />
        <meshStandardMaterial color="#1e7a3c" />
      </mesh>

      {/* draw pile */}
      {Array.from({ length: drawStack }, (_, i) => (
        <Card3D
          key={`draw-${i}`}
          card={null}
          instant
          pose={{
            pos: [DRAW_BASE[0], DRAW_BASE[1] + i * 0.016, DRAW_BASE[2]],
            rot: [Math.PI / 2, 0, 0.1],
          }}
          onClick={i === drawStack - 1 && canDraw ? onDraw : undefined}
          highlight={i === drawStack - 1 && canDraw}
          highlightSide={1}
        />
      ))}

      {/* discard: kartu teratas — key = id kartu supaya animasi 'terbang' dari tangan */}
      {view.topCard && <Card3D key={view.topCard.id} card={view.topCard} pose={DISCARD} />}

      {/* tangan lawan (punggung saja) */}
      {Array.from({ length: oppN }, (_, i) => (
        <Card3D key={`opp-${i}`} card={null} pose={fanPose(i, oppN, -1)} />
      ))}

      {/* tanganku */}
      {view.hand.map((c, i) => (
        <Card3D
          key={c.id}
          card={c}
          pose={fanPose(i, n, 1, view.drawnCardId === c.id)}
          highlight={view.drawnCardId === c.id}
          onClick={myTurn && view.phase === 'playing' ? () => onPlay(c) : undefined}
        />
      ))}
    </Canvas>
  );
}
