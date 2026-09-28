import { afterEach, describe, expect, it } from 'vitest';
import type { FingerId } from '../vision/features';
import { GestureEngine } from './matcher';
import { setPersonalModel, shapeVector } from './personal';
import { FIST, OPEN, synthHand } from './synthHand';

const ICE: Record<FingerId, number> = { thumb: 0.3, index: 1, middle: 1, ring: 0, pinky: 0 };
const POINT: Record<FingerId, number> = { thumb: 0.1, index: 1, middle: 0, ring: 0, pinky: 0 };

const ASPECT = 16 / 9;
// «родной» огненный шар игрока: безымянный и мизинец от природы полусогнуты
const MY_FIREBALL: Record<FingerId, number> = { thumb: 1, index: 1, middle: 1, ring: 0.55, pinky: 0.5 };

const frame = (ext: Record<FingerId, number>, roll = 0, palm = 0.2) => [
  { landmarks: synthHand({ aspect: ASPECT, ext, roll, palm }), handedness: 'Left' as const, score: 0.9 },
];

function holdSnap(ext: Record<FingerId, number>) {
  const e = new GestureEngine();
  let s = e.update(frame(ext), ASPECT, 120, 0);
  for (let i = 1; i < 20; i++) s = e.update(frame(ext), ASPECT, 120, i * 33);
  return s;
}

/** Образцы калибровки: 3 «записи» с небольшими вариациями поворота и размера. */
function calibrate(ext: Record<FingerId, number>) {
  const e = new GestureEngine();
  const samples: number[][] = [];
  [-6, 0, 6].forEach((roll, k) =>
    [0.18, 0.2, 0.22].forEach((palm, j) => {
      const s = e.update(frame(ext, roll, palm), ASPECT, 120, (k * 3 + j) * 33);
      samples.push(shapeVector(s.hands[0]));
    }),
  );
  return samples;
}

afterEach(() => setPersonalModel(undefined));

describe('персональная калибровка', () => {
  it('без калибровки «родная» ладонь игрока не проходит правила', () => {
    expect(holdSnap(MY_FIREBALL).active).not.toBe('fireball');
  });

  // калибруются все одноручные жесты сразу: иначе «родная» ладонь проигрывает льду по правилам
  const all = () =>
    setPersonalModel({
      fireball: calibrate(MY_FIREBALL),
      ice: calibrate(ICE),
      lightning: calibrate(POINT),
      shield: calibrate(FIST),
    });

  it('после калибровки та же ладонь распознаётся как огненный шар', () => {
    all();
    expect(holdSnap(MY_FIREBALL).active).toBe('fireball');
  });

  it('после калибровки остальные жесты не ломаются', () => {
    all();
    expect(holdSnap(ICE).active).toBe('ice');
    expect(holdSnap(OPEN).active).toBe('fireball');
  });

  it('калибровка не превращает кулак в огненный шар', () => {
    all();
    expect(holdSnap(FIST).active).toBe('shield');
  });
});
