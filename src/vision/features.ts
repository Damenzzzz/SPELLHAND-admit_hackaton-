import type { Handedness } from '../store/visionStore';

export type FingerId = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export const FINGERS: FingerId[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** Индексы landmarks MediaPipe по пальцам: MCP/CMC → TIP. */
export const FINGER_JOINTS: Record<FingerId, [number, number, number, number]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface HandFeatures {
  /** Точки в «квадратных» единицах: x и z умножены на aspect кадра, y как есть (0 — верх). */
  pts: Vec3[];
  /** Исходные нормированные landmarks (для отрисовки). */
  raw: Vec3[];
  handedness: Handedness;
  /** Настоящая рука игрока (MediaPipe метит для зеркального кадра, мы подаём незеркальный). */
  isRealRight: boolean;
  confidence: number;
  /** dist(0, 9) — нормализатор всех расстояний. */
  palmSize: number;
  /** 0 — согнут, 1 — выпрямлен. */
  extension: Record<FingerId, number>;
  /** -1 — тыльной стороной к камере, +1 — ладонью к камере. */
  palmFacing: number;
  /** Нормированная высота запястья в кадре (0 — верх). */
  wristY: number;
  /** Центр ладони в квадратных единицах. */
  center: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const dist = (a: Vec3, b: Vec3) => len(sub(a, b));

/** Угол в вершине b треугольника a-b-c, градусы. */
export function angleAt(a: Vec3, b: Vec3, c: Vec3): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const cos = dot(u, v) / (len(u) * len(v) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Линейная «мягкая» ступенька: 0 при x ≤ lo, 1 при x ≥ hi (lo > hi — обратная). */
export function ramp(x: number, lo: number, hi: number): number {
  const t = (x - lo) / (hi - lo);
  return Math.max(0, Math.min(1, t));
}

export const FEATURE_CONFIG = {
  /** Угол в PIP: ≥ straight → выпрямлен, ≤ bent → согнут. */
  straightDeg: 160,
  bentDeg: 110,
  /** Большой палец: угол в MCP (2-3-4) и отвод кончика от указательного. */
  thumbStraightDeg: 160,
  thumbBentDeg: 125,
  thumbFarRatio: 0.75,
  thumbNearRatio: 0.4,
};

/**
 * Знак нормали ладони. Выведен из геометрии (незеркальный кадр + метки MediaPipe
 * для селфи), а калибровка «покажи ладонь» переворачивает его, если камера ведёт себя иначе.
 */
let palmSign = 1;
export const setPalmSign = (sign: 1 | -1) => {
  palmSign = sign;
};
export const getPalmSign = () => palmSign;

function fingerExtension(p: Vec3[], finger: FingerId): number {
  const c = FEATURE_CONFIG;
  const [mcp, pip, dip, tip] = FINGER_JOINTS[finger];
  if (finger === 'thumb') {
    // для большого пальца индексы 1-2-3-4 = CMC, MCP, IP, TIP; угол в IP-суставе 2-3-4
    const ang = angleAt(p[pip], p[dip], p[tip]);
    const angScore = ramp(ang, c.thumbBentDeg, c.thumbStraightDeg);
    const palm = dist(p[0], p[9]) || 1;
    const spread = dist(p[tip], p[5]) / palm;
    const spreadScore = ramp(spread, c.thumbNearRatio, c.thumbFarRatio);
    return 0.4 * angScore + 0.6 * spreadScore;
  }
  // Угол в PIP (MCP–PIP–TIP) + сгиб в MCP (запястье–MCP–PIP): кулак гнётся в обоих суставах
  const pipAng = angleAt(p[mcp], p[pip], p[tip]);
  const mcpAng = angleAt(p[0], p[mcp], p[pip]);
  const pipScore = ramp(pipAng, c.bentDeg, c.straightDeg);
  const mcpScore = ramp(mcpAng, 100, 150);
  return Math.min(pipScore, 0.3 + 0.7 * mcpScore);
}

export function computeFeatures(
  raw: Vec3[],
  handedness: Handedness,
  confidence: number,
  aspect: number,
): HandFeatures {
  const pts = raw.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z * aspect }));
  const palmSize = dist(pts[0], pts[9]) || 1e-3;

  const extension = {} as Record<FingerId, number>;
  for (const f of FINGERS) extension[f] = fingerExtension(pts, f);

  // Нормаль ладони: cross(0→5, 0→17). Для правой руки ладонью к камере n.z < 0 (к камере).
  const isRealRight = handedness === 'Left';
  const n = cross(sub(pts[5], pts[0]), sub(pts[17], pts[0]));
  const nLen = len(n) || 1;
  const palmFacing = ((-n.z / nLen) * (isRealRight ? 1 : -1)) * palmSign;

  const center = {
    x: (pts[0].x + pts[5].x + pts[9].x + pts[17].x) / 4,
    y: (pts[0].y + pts[5].y + pts[9].y + pts[17].y) / 4,
    z: (pts[0].z + pts[5].z + pts[9].z + pts[17].z) / 4,
  };

  return {
    pts,
    raw,
    handedness,
    isRealRight,
    confidence,
    palmSize,
    extension,
    palmFacing,
    wristY: raw[0].y,
    center,
  };
}
