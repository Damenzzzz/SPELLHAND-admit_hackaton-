import { angleAt, dist, FINGER_JOINTS, FINGERS, type HandFeatures } from '../vision/features';
import type { GestureId, TemplateScore } from './types';

/**
 * Персональная калибровка (few-shot): игрок показывает жест 3 раза, мы запоминаем
 * вектор формы его руки и смешиваем близость к своим образцам с rule-based оценкой.
 * Классификатор — kNN с радиусом отказа из leave-one-out; обучения нет, всё в браузере.
 */
export type PersonalModel = Partial<Record<GestureId, number[][]>>;

/** Жесты одной руки — для двуручных хватает правил. */
export const PERSONAL_GESTURES: GestureId[] = ['fireball', 'ice', 'lightning', 'shield'];

/** С какой уверенности личные образцы становятся арбитром. */
const CONFIDENT = 0.75;
/** Вклад личной оценки в score узнанного жеста. */
const WEIGHT = 0.65;
/** Насколько подавлять остальные откалиброванные жесты на той же руке. */
const SUPPRESS = 0.6;
const K = 3;
const MIN_RADIUS = 0.12;

/**
 * 22 признака, инвариантных к положению и масштабу: 15 углов суставов (/180),
 * 5 расстояний кончик–запястье и большой–указательный (/palmSize), ориентация ладони.
 */
export function shapeVector(h: HandFeatures): number[] {
  const p = h.pts;
  const v: number[] = [];
  for (const f of FINGERS) {
    const [a, b, c, d] = FINGER_JOINTS[f];
    v.push(angleAt(p[0], p[a], p[b]) / 180, angleAt(p[a], p[b], p[c]) / 180, angleAt(p[b], p[c], p[d]) / 180);
  }
  for (const f of FINGERS) v.push(dist(p[FINGER_JOINTS[f][3]], p[0]) / h.palmSize / 2);
  v.push(dist(p[4], p[8]) / h.palmSize / 2);
  v.push((h.palmFacing + 1) / 2);
  return v;
}

const d2 = (a: number[], b: number[]) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);

/** Средняя дистанция до k ближайших образцов. */
function knnDist(samples: number[][], v: number[], skip = -1): number {
  const ds = samples
    .map((s, i) => (i === skip ? Infinity : Math.sqrt(d2(s, v))))
    .sort((a, b) => a - b)
    .slice(0, K)
    .filter(Number.isFinite);
  return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : Infinity;
}

interface Compiled {
  samples: number[][];
  radius: number;
}

let compiled: Partial<Record<GestureId, Compiled>> = {};

/** Радиус отказа = средняя leave-one-out дистанция + 2σ (не меньше MIN_RADIUS). */
export function setPersonalModel(model: PersonalModel | undefined) {
  compiled = {};
  for (const [g, samples] of Object.entries(model ?? {}) as [GestureId, number[][]][]) {
    if (!samples || samples.length < 2) continue;
    const loo = samples.map((s, i) => knnDist(samples, s, i));
    const mean = loo.reduce((a, b) => a + b, 0) / loo.length;
    const sd = Math.sqrt(loo.reduce((a, b) => a + (b - mean) ** 2, 0) / loo.length);
    compiled[g] = { samples, radius: Math.max(MIN_RADIUS, mean + 2 * sd) };
  }
}

export const hasPersonal = (g: GestureId) => !!compiled[g];

/** 0..1 — насколько рука похожа на личные образцы жеста; null, если калибровки нет. */
export function personalScore(g: GestureId, h: HandFeatures): number | null {
  const c = compiled[g];
  if (!c) return null;
  const d = knnDist(c.samples, shapeVector(h));
  return Math.exp(-(d * d) / (c.radius * c.radius));
}

/**
 * Калибровка как арбитр: если рука уверенно похожа на личный образец жеста X
 * (и игрок явно пытается его показать — intent), X поднимается, а остальные
 * откалиброванные жесты на той же руке подавляются. Иначе решают правила —
 * эталонная поза из академии распознаётся как и раньше.
 */
export function applyPersonal(scores: Record<GestureId, TemplateScore>, hands: HandFeatures[]) {
  let top: { g: GestureId; p: number; hand: number } | null = null;
  for (const g of PERSONAL_GESTURES) {
    const s = scores[g];
    if (!s || !s.intent || s.handIdx < 0 || !hands[s.handIdx]) continue;
    const p = personalScore(g, hands[s.handIdx]);
    if (p !== null && (!top || p > top.p)) top = { g, p, hand: s.handIdx };
  }
  if (!top || top.p < CONFIDENT) return;
  for (const g of PERSONAL_GESTURES) {
    const s = scores[g];
    if (!s || !hasPersonal(g) || s.handIdx !== top.hand) continue;
    s.score =
      g === top.g ? Math.max(s.score, (1 - WEIGHT) * s.score + WEIGHT * top.p) : s.score * (1 - SUPPRESS * top.p);
  }
}

/** Округление для компактного хранения в localStorage. */
export const quantize = (v: number[]) => v.map((x) => Math.round(x * 1000) / 1000);
