import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGesture } from '../../store/gestureStore';
import { useVision } from '../../store/visionStore';
import { FINGER_JOINTS, FINGERS, type HandFeatures } from '../../vision/features';
import { GESTURE_COLOR } from '../colors';
import { coverBox } from '../HandOverlay';
import { GpuParticles } from './particles';

type ToScene = (p: { x: number; y: number }) => THREE.Vector3;

/** Маппинг нормированной точки кадра в сцену орто-камеры (центр = 0, y вверх), как у посоха. */
function useToScene(): () => ToScene | null {
  const { size } = useThree();
  return () => {
    const { videoSize } = useVision.getState();
    if (!videoSize.width) return null;
    const box = coverBox(size.width, size.height, videoSize.width, videoSize.height);
    return (p) => new THREE.Vector3(box.ox + p.x * box.dw - size.width / 2, size.height / 2 - (box.oy + p.y * box.dh), 60);
  };
}

const palmCenter = (h: HandFeatures) =>
  [0, 5, 9, 17].reduce((a, i) => ({ x: a.x + h.raw[i].x / 4, y: a.y + h.raw[i].y / 4 }), { x: 0, y: 0 });

const C = {
  fire: new THREE.Color('#ff7a2f'),
  fireHot: new THREE.Color('#fff1b0'),
  over: new THREE.Color('#ff2d2d'),
  ice: new THREE.Color(GESTURE_COLOR.ice),
  heal: new THREE.Color(GESTURE_COLOR.heal),
  wind: new THREE.Color(GESTURE_COLOR.wind),
  bolt: new THREE.Color('#fffbd0'),
  pen: new THREE.Color('#f2c35b'),
};

/**
 * AR-эффекты прямо на руке: огонь в ладони растёт с зарядом (и краснеет при перезаряде),
 * иней на кончиках пальцев, молния из указательного, зелёные искры лечения, вихрь ветра,
 * искры пера руны.
 */
export function HandVFX() {
  const particles = useMemo(() => new GpuParticles(1800, 20), []);
  const toSceneFn = useToScene();
  const bolt = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3()));
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: C.bolt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    line.frustumCulled = false;
    return line;
  }, []);
  const lastBolt = useRef(0);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    particles.time = t;
    bolt.visible = false;
    const snap = useGesture.getState().snap;
    const toScene = toSceneFn();
    if (!snap || !toScene || !snap.hands.length) return;

    const hand = snap.hands[snap.activeHandIdx] ?? snap.hands[0];
    const palm = toScene(hand.raw[0]).distanceTo(toScene(hand.raw[9]));
    const up = new THREE.Vector3(0, 1, 0);

    // перо руны — золотые искры на кончике
    if (snap.rune.penDown && snap.rune.trail.length) {
      particles.emit(2, toScene(snap.rune.trail[snap.rune.trail.length - 1]), { color: C.pen, speed: 40, life: 0.5 });
    }

    switch (snap.active) {
      case 'fireball': {
        const over = snap.overcharge > 0;
        const n = 2 + Math.round(snap.charge * 6) + (over ? 4 : 0);
        particles.emit(n, toScene(palmCenter(hand)), {
          color: over ? C.over : snap.charge > 0.8 ? C.fireHot : C.fire,
          speed: 60 + snap.charge * 80,
          dir: up.clone().multiplyScalar(1),
          spread: 1.2,
          life: 0.55,
          gravity: 40,
          jitter: palm * (0.25 + snap.charge * 0.3),
        });
        break;
      }
      case 'ice':
        for (const i of [8, 12]) {
          particles.emit(2, toScene(hand.raw[i]), { color: C.ice, speed: 25, life: 0.9, gravity: -30, jitter: 8 });
        }
        break;
      case 'lightning': {
        // ломаная молния из кончика указательного, пересобирается каждые 60 мс
        if (t - lastBolt.current > 0.06) {
          lastBolt.current = t;
          const from = toScene(hand.raw[8]);
          const dir = from.clone().sub(toScene(hand.raw[5])).normalize();
          const to = from.clone().add(dir.multiplyScalar(palm * 2.2));
          const pts = (bolt.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
          for (let k = 0; k < 12; k++) {
            const q = from.clone().lerp(to, k / 11);
            const j = k === 0 || k === 11 ? 0 : (Math.random() - 0.5) * palm * 0.5;
            pts.set([q.x + j, q.y + j * 0.5, 80], k * 3);
          }
          bolt.geometry.getAttribute('position').needsUpdate = true;
          // WebGL рисует линии в 1 px — яркость молнии дают искры вдоль неё
          for (let k = 1; k < 12; k += 2) {
            particles.emit(1, new THREE.Vector3(pts[k * 3], pts[k * 3 + 1], 80), { color: C.bolt, speed: 30, life: 0.12 });
          }
          particles.emit(3, to, { color: C.bolt, speed: 120, life: 0.25 });
        }
        bolt.visible = true;
        break;
      }
      case 'heal':
        for (const h of snap.hands) {
          particles.emit(2, toScene(palmCenter(h)), { color: C.heal, speed: 40, dir: up, life: 1.1, gravity: 10, jitter: palm * 0.6 });
        }
        break;
      case 'wind':
        for (const h of snap.hands) {
          const c = toScene(palmCenter(h));
          const a = t * 8;
          particles.emit(2, c.add(new THREE.Vector3(Math.cos(a) * palm * 0.7, Math.sin(a) * palm * 0.7, 0)), {
            color: C.wind,
            speed: 50,
            life: 0.5,
          });
        }
        break;
    }
  });

  return (
    <>
      <primitive object={particles} />
      <primitive object={bolt} />
    </>
  );
}

/**
 * Окклюзия: невидимые капсулы по костям пальцев пишут только глубину (colorWrite: false)
 * и рендерятся раньше посоха — пальцы оказываются «поверх» древка, как будто держат его.
 */
export function HandOccluders() {
  const toSceneFn = useToScene();
  const bones = useMemo(() => FINGERS.flatMap((f) => {
    const [a, b, c, d] = FINGER_JOINTS[f];
    return [[a, b], [b, c], [c, d]] as [number, number][];
  }), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }), []);
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8), []);
  const group = useRef<THREE.Group>(null);
  const meshes = useMemo(() => {
    const out: THREE.Mesh[] = [];
    for (let h = 0; h < 2; h++)
      for (let i = 0; i < bones.length; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = -1;
        m.frustumCulled = false;
        out.push(m);
      }
    return out;
  }, [bones, geo, mat]);

  useFrame(() => {
    const snap = useGesture.getState().snap;
    const toScene = toSceneFn();
    meshes.forEach((m) => (m.visible = false));
    if (!snap || !toScene) return;
    snap.hands.slice(0, 2).forEach((h, hi) => {
      const r = toScene(h.raw[0]).distanceTo(toScene(h.raw[9])) * 0.09;
      bones.forEach(([a, b], bi) => {
        const m = meshes[hi * bones.length + bi];
        const pa = toScene(h.raw[a]);
        const pb = toScene(h.raw[b]);
        const mid = pa.clone().add(pb).multiplyScalar(0.5);
        const len = pa.distanceTo(pb);
        m.position.set(mid.x, mid.y, 40);
        m.scale.set(r, len + r, r);
        m.rotation.set(0, 0, Math.atan2(pb.y - pa.y, pb.x - pa.x) - Math.PI / 2);
        m.visible = true;
      });
    });
  });

  return (
    <group ref={group}>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
