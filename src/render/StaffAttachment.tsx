import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ASSETS } from '../game/data/assets';
import { useGesture } from '../store/gestureStore';
import { useSave } from '../store/saveStore';
import { useVision } from '../store/visionStore';
import type { HandFeatures } from '../vision/features';
import { GESTURE_COLOR } from './colors';
import { coverBox } from './HandOverlay';

/** Длина посоха в размерах ладони (wrist → middle MCP). */
const STAFF_PALMS = 2.8;
/** Хват чуть выше запястья — посох «в кулаке». */
const GRIP = 0.35;
const SMOOTH = 0.45;

/** Рука, которая держит посох: кастующая, иначе правая, иначе первая. */
function staffHand(): HandFeatures | null {
  const snap = useGesture.getState().snap;
  if (!snap?.hands.length) return null;
  if (snap.activeHandIdx >= 0 && snap.hands[snap.activeHandIdx]) return snap.hands[snap.activeHandIdx];
  return snap.hands.find((h) => h.isRealRight) ?? snap.hands[0];
}

interface GlowPart {
  material: THREE.MeshStandardMaterial;
  base: THREE.Color;
  baseIntensity: number;
}

function Staff({ id }: { id: string }) {
  // meshopt — как в optimize-models.sh; draco не используем (без CDN-декодера)
  const { scene } = useGLTF(ASSETS.staffModel(id), false, true);
  const { size } = useThree();
  const ref = useRef<THREE.Group>(null);

  const { object, glow } = useMemo(() => {
    const object = scene.clone(true);
    const glow: GlowPart[] = [];
    object.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name.startsWith('glow')) {
        const material = (o.material as THREE.MeshStandardMaterial).clone();
        o.material = material;
        glow.push({ material, base: material.emissive.clone(), baseIntensity: material.emissiveIntensity });
      }
    });
    return { object, glow };
  }, [scene]);

  const tint = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const hand = staffHand();
    const { videoSize } = useVision.getState();
    if (!hand || !videoSize.width) {
      g.visible = false;
      return;
    }

    // экранные координаты в системе орто-камеры (центр канваса = 0, y вверх)
    const box = coverBox(size.width, size.height, videoSize.width, videoSize.height);
    const toScene = (p: { x: number; y: number }) =>
      new THREE.Vector2(box.ox + p.x * box.dw - size.width / 2, size.height / 2 - (box.oy + p.y * box.dh));
    const wrist = toScene(hand.raw[0]);
    const mid = toScene(hand.raw[9]);
    const dir = mid.clone().sub(wrist);
    const palmPx = dir.length();
    const grip = wrist.clone().add(dir.clone().multiplyScalar(GRIP));
    const angle = Math.atan2(dir.y, dir.x) - Math.PI / 2;
    const depthTilt = THREE.MathUtils.clamp((hand.raw[9].z - hand.raw[0].z) * 6, -0.8, 0.8);

    const k = g.visible ? SMOOTH : 1;
    g.visible = true;
    g.position.x += (grip.x - g.position.x) * k;
    g.position.y += (grip.y - g.position.y) * k;
    // кратчайший поворот, без скачка через ±π
    const dz = ((angle - g.rotation.z + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    g.rotation.z += dz * k;
    g.rotation.x += (depthTilt - g.rotation.x) * k;
    g.rotation.y = Math.sin(clock.elapsedTime * 0.8) * 0.35;
    const s = palmPx * STAFF_PALMS;
    g.scale.setScalar(g.scale.x + (s - g.scale.x) * k);

    // навершие светится цветом взведённого заклинания, заряд огня — ярче
    const snap = useGesture.getState().snap;
    const active = snap?.active;
    const pulse = 1 + 0.25 * Math.sin(clock.elapsedTime * 8);
    for (const part of glow) {
      if (active) {
        tint.set(GESTURE_COLOR[active]);
        part.material.emissive.lerp(tint, 0.25);
        part.material.emissiveIntensity = part.baseIntensity * (1.6 + (snap?.charge ?? 0) * 1.5) * pulse;
      } else {
        part.material.emissive.lerp(part.base, 0.15);
        part.material.emissiveIntensity += (part.baseIntensity - part.material.emissiveIntensity) * 0.15;
      }
    }
  });

  return (
    <group ref={ref} visible={false}>
      <primitive object={object} />
    </group>
  );
}

/**
 * AR-посох: 3D-модель экипированного посоха прикреплена к руке на видео.
 * Позиция — запястье, направление — запястье → MCP среднего пальца.
 * Канвас лежит внутри зеркального контейнера камеры, поэтому координаты — как у landmarks.
 */
export default function StaffAttachment() {
  const staffId = useSave((s) => s.equipped.staff);
  return (
    <Canvas
      className="staff-canvas"
      orthographic
      camera={{ zoom: 1, position: [0, 0, 1000], near: 1, far: 3000 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[300, 500, 800]} intensity={2.2} />
      <directionalLight position={[-400, -200, 300]} intensity={0.6} color="#8fb8ff" />
      <Suspense fallback={null}>
        <Staff key={staffId} id={staffId} />
      </Suspense>
    </Canvas>
  );
}
