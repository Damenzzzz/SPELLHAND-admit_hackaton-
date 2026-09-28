import { describe, expect, it } from 'vitest';
import { accuracyTrend, fingerErrors, gestureOfConstraint, topErrorIds, type SessionRecord } from './progress';

const s = (accuracy: number, errors: Record<string, number>): SessionRecord => ({
  at: 0,
  mode: 'campaign',
  accuracy,
  perSpell: {},
  errors,
});

describe('прогресс', () => {
  it('ошибки ограничений раскладываются по пальцам', () => {
    const f = fingerErrors([s(0.5, { ring_extended: 4, index_middle_together: 2, fireball_motion_weak: 3 })]);
    expect(f.ring).toBe(4);
    expect(f.index).toBe(2);
    expect(f.middle).toBe(2);
    expect(f.thumb).toBe(0);
  });

  it('тренд «было → стало» по первым и последним сессиям', () => {
    const t = accuracyTrend([s(0.5, {}), s(0.6, {}), s(0.7, {}), s(0.8, {}), s(0.9, {}), s(0.95, {})]);
    expect(t!.before).toBeCloseTo(0.6);
    expect(t!.after).toBeCloseTo(0.883, 2);
  });

  it('топ ошибок суммируется по истории, ошибка ведёт к жесту', () => {
    const top = topErrorIds([s(0.5, { hand_above_head: 2 }), s(0.5, { hand_above_head: 3, ring_extended: 1 })]);
    expect(top[0]).toEqual({ id: 'hand_above_head', count: 5 });
    expect(gestureOfConstraint('hand_above_head')).toBe('lightning');
    expect(gestureOfConstraint('fireball_motion_weak')).toBe('fireball');
  });
});
