import { TEMPLATES } from '../gestures/templates';
import type { GestureId } from '../gestures/types';
import { updateSave, useSave } from '../store/saveStore';
import type { FingerId } from '../vision/features';
import type { BattleResult } from './stats';

/** Одна сессия (бой, разминка, упражнение) в истории прогресса. */
export interface SessionRecord {
  at: number;
  mode: 'campaign' | 'online' | 'ghost' | 'daily' | 'rush' | 'drill';
  accuracy: number;
  perSpell: Partial<Record<GestureId, { count: number; avgQuality: number }>>;
  errors: Record<string, number>;
}

const MAX_HISTORY = 60;

export function recordSession(r: Pick<BattleResult, 'accuracy' | 'perSpell' | 'errorCounts'> & { mode: SessionRecord['mode'] }) {
  if (!Number.isFinite(r.accuracy)) return;
  const rec: SessionRecord = { at: Date.now(), mode: r.mode, accuracy: r.accuracy, perSpell: r.perSpell, errors: r.errorCounts };
  updateSave((s) => ({ history: [...(s.history ?? []), rec].slice(-MAX_HISTORY) }));
}

/** id ограничения → пальцы (из шаблонов); осечки движения пальцев не касаются. */
const CONSTRAINT_FINGERS: Record<string, FingerId[]> = Object.fromEntries(
  TEMPLATES.flatMap((t) => t.pose.filter((c) => c.fingers?.length).map((c) => [c.id, c.fingers!])),
);

/** Сколько раз каждый палец был причиной ошибки — для тепловой карты. */
export function fingerErrors(history: SessionRecord[]): Record<FingerId, number> {
  const out: Record<FingerId, number> = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
  for (const s of history) {
    for (const [id, n] of Object.entries(s.errors)) for (const f of CONSTRAINT_FINGERS[id] ?? []) out[f] += n;
  }
  return out;
}

/** Суммарные ошибки по id за всю историю, по убыванию. */
export function topErrorIds(history: SessionRecord[]): { id: string; count: number }[] {
  const acc: Record<string, number> = {};
  for (const s of history) for (const [id, n] of Object.entries(s.errors)) acc[id] = (acc[id] ?? 0) + n;
  return Object.entries(acc)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}

/** Средняя точность первых и последних N сессий — «было → стало». */
export function accuracyTrend(history: SessionRecord[], n = 3) {
  if (history.length < 2) return null;
  const avg = (xs: SessionRecord[]) => xs.reduce((a, s) => a + s.accuracy, 0) / xs.length;
  const k = Math.min(n, Math.floor(history.length / 2));
  return { before: avg(history.slice(0, k)), after: avg(history.slice(-k)) };
}

/** Жест, которому принадлежит ограничение (для упражнения). */
export function gestureOfConstraint(id: string): GestureId | null {
  const motion = TEMPLATES.find((t) => id === `${t.id}_motion_weak`);
  if (motion) return motion.id;
  return TEMPLATES.find((t) => t.pose.some((c) => c.id === id))?.id ?? null;
}

export const getHistory = () => useSave.getState().history ?? [];
