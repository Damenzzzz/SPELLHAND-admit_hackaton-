import type { FingerId, Vec3 } from '../vision/features';

/**
 * Процедурная модель руки: по степени выпрямления пальцев строит 21 точку
 * в формате MediaPipe. Нужна для призрачной руки-шаблона и для тестов распознавателя.
 */
export interface SynthOptions {
  ext: Record<FingerId, number>;
  /** 1 — ладонью к камере, -1 — тыльной стороной. */
  facing?: 1 | -1;
  /** Настоящая правая рука игрока. */
  right?: boolean;
  /** Центр запястья в нормированных координатах кадра. */
  wrist?: { x: number; y: number };
  /** dist(запястье, MCP среднего) в долях высоты кадра. */
  palm?: number;
  /** Поворот в плоскости кадра, градусы (+ по часовой). */
  roll?: number;
  /** Сведение указательного и среднего (0 — обычный разворот, 1 — вместе). */
  together?: number;
  aspect?: number;
}

type V = [number, number, number];

// Локальная система: x вправо, y вниз, z от камеры; палец — правая рука ладонью к камере.
const MCP: Record<Exclude<FingerId, 'thumb'>, [number, number]> = {
  index: [0.32, -0.93],
  middle: [0, -1],
  ring: [-0.27, -0.93],
  pinky: [-0.5, -0.8],
};
const SEGMENTS: Record<FingerId, [number, number, number]> = {
  thumb: [0.38, 0.32, 0.26],
  index: [0.45, 0.27, 0.22],
  middle: [0.5, 0.3, 0.24],
  ring: [0.46, 0.28, 0.22],
  pinky: [0.36, 0.2, 0.18],
};
/** Сгиб суставов при полностью согнутом пальце, градусы. */
const CURL: [number, number, number] = [80, 100, 70];

const rad = (d: number) => (d * Math.PI) / 180;

function norm2(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

function buildFinger(base: V, dir: [number, number], lengths: number[], ext: number): V[] {
  const pts: V[] = [];
  let cum = 0;
  let p = base;
  for (let i = 0; i < 3; i++) {
    cum += (1 - ext) * CURL[i];
    const c = Math.cos(rad(cum));
    const s = Math.sin(rad(cum));
    // сгиб к ладони = к камере (−z)
    p = [p[0] + lengths[i] * c * dir[0], p[1] + lengths[i] * c * dir[1], p[2] - lengths[i] * s];
    pts.push(p);
  }
  return pts;
}

export function synthHand(o: SynthOptions): Vec3[] {
  const facing = o.facing ?? 1;
  const right = o.right ?? true;
  const aspect = o.aspect ?? 16 / 9;
  const palm = o.palm ?? 0.2;
  const wrist = o.wrist ?? { x: 0.5, y: 0.75 };
  const together = o.together ?? 0;

  const local: V[] = new Array(21);
  local[0] = [0, 0, 0];

  // большой палец: от CMC вверх-вправо, при сгибе уходит поперёк ладони
  const te = o.ext.thumb;
  const tDir = norm2(0.85 * te - 0.3 * (1 - te), -0.55 * te - 0.75 * (1 - te));
  local[1] = [0.28, -0.22, -0.05];
  const thumbPts = buildFinger(local[1], tDir, SEGMENTS.thumb, 0.8 + 0.2 * te);
  thumbPts.forEach((p, i) => (local[2 + i] = [p[0], p[1], p[2] - (1 - te) * 0.1 * (i + 1)]));

  (['index', 'middle', 'ring', 'pinky'] as const).forEach((f, k) => {
    const [mx, my] = MCP[f];
    const baseIdx = 5 + k * 4;
    local[baseIdx] = [mx, my, 0];
    let dir = norm2(mx * 0.55, my + 0.35);
    if (together && (f === 'index' || f === 'middle')) {
      dir = norm2(dir[0] + (f === 'index' ? -0.12 : 0.06) * together, dir[1]);
    }
    buildFinger(local[baseIdx], dir, SEGMENTS[f], o.ext[f]).forEach(
      (p, i) => (local[baseIdx + 1 + i] = p),
    );
  });

  const roll = rad(o.roll ?? 0);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  return local.map(([x, y, z]) => {
    // тыльная сторона = поворот на 180° вокруг вертикали; левая рука = зеркало по x
    let lx = x * facing * (right ? 1 : -1);
    const lz = z * facing;
    const rx = lx * cr - y * sr;
    const ry = lx * sr + y * cr;
    lx = rx;
    return {
      x: wrist.x + (lx * palm) / aspect,
      y: wrist.y + ry * palm,
      z: (lz * palm) / aspect,
    };
  });
}

export const OPEN: Record<FingerId, number> = { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 };
export const FIST: Record<FingerId, number> = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
