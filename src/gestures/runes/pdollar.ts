/**
 * Point-cloud распознаватель росчерков по статье $P (Vatavu, Anthony, Wobbrock, 2012,
 * «Gestures as Point Clouds»). Реализация своя, по псевдокоду из статьи.
 * Облако точек не зависит от направления и порядка обхода — подходит для
 * небрежных рун, нарисованных пальцем в воздухе.
 */
export interface Pt {
  x: number;
  y: number;
}

export const N = 32;

function pathLength(pts: Pt[]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

/** Равномерная передискретизация пути в n точек. */
export function resample(input: Pt[], n = N): Pt[] {
  const pts = input.map((p) => ({ ...p }));
  const I = pathLength(pts) / (n - 1);
  if (!Number.isFinite(I) || I === 0) return Array.from({ length: n }, () => ({ ...input[0] }));
  let D = 0;
  const out: Pt[] = [{ ...pts[0] }];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (D + d >= I && d > 0) {
      const t = (I - D) / d;
      const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) };
      out.push(q);
      pts.splice(i, 0, q);
      D = 0;
    } else {
      D += d;
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out.slice(0, n);
}

/** Равномерное масштабирование в единичный квадрат (пропорции сохраняются) и центрирование. */
export function normalize(pts: Pt[]): Pt[] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return pts.map((p) => ({ x: (p.x - cx) / size, y: (p.y - cy) / size }));
}

export const prepare = (pts: Pt[]) => normalize(resample(pts));

/** Жадное сопоставление облаков с весами (раньше сопоставленные точки весят больше). */
function cloudDistance(a: Pt[], b: Pt[], start: number): number {
  const matched = new Array<boolean>(a.length).fill(false);
  let sum = 0;
  let i = start;
  do {
    let min = Infinity;
    let index = -1;
    for (let j = 0; j < b.length; j++) {
      if (matched[j]) continue;
      const d = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
      if (d < min) {
        min = d;
        index = j;
      }
    }
    matched[index] = true;
    const weight = 1 - ((i - start + a.length) % a.length) / a.length;
    sum += weight * min;
    i = (i + 1) % a.length;
  } while (i !== start);
  return sum;
}

export function greedyCloudMatch(a: Pt[], b: Pt[]): number {
  const step = Math.floor(Math.sqrt(a.length));
  let min = Infinity;
  for (let i = 0; i < a.length; i += step) {
    min = Math.min(min, cloudDistance(a, b, i), cloudDistance(b, a, i));
  }
  return min;
}

export interface RuneTemplate<Id extends string = string> {
  id: Id;
  points: Pt[];
}

export interface RecognizeResult<Id extends string = string> {
  id: Id;
  /** 0..1 — чем больше, тем ближе. */
  score: number;
  /** Отрыв от второго по близости шаблона другой руны. */
  margin: number;
}

/** Расстояние → оценка 0..1 (как в $P: max((2 − d) / 2, 0)). */
const toScore = (d: number) => Math.max(0, (2 - d) / 2);

export function recognize<Id extends string>(
  stroke: Pt[],
  templates: RuneTemplate<Id>[],
): RecognizeResult<Id> | null {
  if (stroke.length < 2 || !templates.length) return null;
  const cand = prepare(stroke);
  const bestById = new Map<Id, number>();
  for (const t of templates) {
    const d = greedyCloudMatch(cand, t.points);
    bestById.set(t.id, Math.min(bestById.get(t.id) ?? Infinity, d));
  }
  const ranked = [...bestById.entries()].sort((a, b) => a[1] - b[1]);
  const [bestId, bestD] = ranked[0];
  const second = ranked[1] ? toScore(ranked[1][1]) : 0;
  return { id: bestId, score: toScore(bestD), margin: toScore(bestD) - second };
}
