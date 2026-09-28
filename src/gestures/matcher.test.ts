import { describe, expect, it } from 'vitest';
import type { TrackedHand } from '../store/visionStore';
import type { FingerId } from '../vision/features';
import { GestureEngine, type GestureEvent } from './matcher';
import { FIST, OPEN, synthHand, type SynthOptions } from './synthHand';

const ASPECT = 16 / 9;
const FRAME_MS = 33;

/** Рука игрока в формате MediaPipe (метка handedness — для зеркального кадра). */
function hand(o: Partial<SynthOptions> & { ext: Record<FingerId, number> }): TrackedHand {
  const right = o.right ?? true;
  return {
    landmarks: synthHand({ aspect: ASPECT, right, ...o }),
    handedness: right ? 'Left' : 'Right',
    score: 0.95,
  };
}

function run(engine: GestureEngine, frames: TrackedHand[][], start = 0) {
  let snap = engine.update(frames[0], ASPECT, 120, start);
  frames.slice(1).forEach((f, i) => (snap = engine.update(f, ASPECT, 120, start + (i + 1) * FRAME_MS)));
  return snap;
}

const hold = (h: TrackedHand[], n = 20) => Array.from({ length: n }, () => h);

const ICE = { thumb: 0.2, index: 1, middle: 1, ring: 0, pinky: 0 };
const POINT = { thumb: 0.1, index: 1, middle: 0, ring: 0, pinky: 0 };

describe('распознавание поз', () => {
  it('открытая ладонь к камере — огненный шар', () => {
    const snap = run(new GestureEngine(), hold([hand({ ext: OPEN })]));
    expect(snap.scores.fireball.score).toBeGreaterThanOrEqual(0.85);
    expect(snap.active).toBe('fireball');
  });

  it('кулак — щит', () => {
    const snap = run(new GestureEngine(), hold([hand({ ext: FIST })]));
    expect(snap.active).toBe('shield');
  });

  it('два пальца вместе — лёд', () => {
    const snap = run(new GestureEngine(), hold([hand({ ext: ICE, together: 1 })]));
    expect(snap.active).toBe('ice');
  });

  it('указательный вверх над головой — молния', () => {
    const snap = run(new GestureEngine(), hold([hand({ ext: POINT, wrist: { x: 0.5, y: 0.28 } })]));
    expect(snap.active).toBe('lightning');
  });

  it('левая рука распознаётся так же', () => {
    const snap = run(new GestureEngine(), hold([hand({ ext: OPEN, right: false })]));
    expect(snap.active).toBe('fireball');
  });

  it('две ладони врозь — ветер, вместе — лечение', () => {
    const apart = [
      hand({ ext: OPEN, wrist: { x: 0.3, y: 0.7 } }),
      hand({ ext: OPEN, right: false, wrist: { x: 0.7, y: 0.7 } }),
    ];
    expect(run(new GestureEngine(), hold(apart)).active).toBe('wind');

    const together = [
      hand({ ext: OPEN, wrist: { x: 0.45, y: 0.7 } }),
      hand({ ext: OPEN, right: false, wrist: { x: 0.55, y: 0.7 } }),
    ];
    expect(run(new GestureEngine(), hold(together)).active).toBe('heal');
  });
});

describe('режим «ошибка»: near-miss', () => {
  it('согнутый безымянный — подсказка про безымянный палец', () => {
    const snap = run(new GestureEngine(), hold([hand({ ext: { ...OPEN, ring: 0 } })]));
    expect(snap.active).toBeNull();
    expect(snap.hint?.kind).toBe('pose');
    expect(snap.hint?.lines).toContain('Выпрями безымянный палец');
    expect(snap.hint?.fingers).toContain('ring');
  });

  it('тыльная сторона — подсказка развернуть ладонь', () => {
    const snap = run(new GestureEngine(), hold([hand({ ext: OPEN, facing: -1 })]));
    expect(snap.hint?.lines).toContain('Разверни ладонь к камере');
  });

  it('молния внизу — подсказка поднять руку', () => {
    const snap = run(new GestureEngine(), hold([hand({ ext: POINT, wrist: { x: 0.5, y: 0.75 } })]));
    expect(snap.hint?.lines).toContain('Подними руку выше головы');
  });

  it('near-miss не показывается раньше 400 мс', () => {
    const snap = run(new GestureEngine(), hold([hand({ ext: { ...OPEN, ring: 0 } })], 8));
    expect(snap.hint).toBeNull();
  });

  it('нет рук — контекстная подсказка', () => {
    const snap = run(new GestureEngine(), [[]]);
    expect(snap.hint?.lines[0]).toBe('Покажи руку камере');
  });
});

describe('движение', () => {
  const pushFrames = (from: number, to: number, steps: number) =>
    Array.from({ length: steps }, (_, i) => [hand({ ext: OPEN, palm: from + ((to - from) * (i + 1)) / steps })]);

  it('резкий толчок ладонью — выстрел огненным шаром с зарядом', () => {
    const engine = new GestureEngine();
    const events: GestureEvent[] = [];
    engine.on((e) => events.push(e));
    run(engine, [...hold([hand({ ext: OPEN, palm: 0.2 })], 40), ...pushFrames(0.2, 0.26, 4)]);
    const cast = events.find((e) => e.type === 'cast');
    expect(cast).toMatchObject({ gesture: 'fireball' });
    expect(cast && cast.type === 'cast' && cast.charge).toBeGreaterThan(0.5);
  });

  it('медленное приближение — осечка с подсказкой', () => {
    const engine = new GestureEngine();
    const events: GestureEvent[] = [];
    engine.on((e) => events.push(e));
    run(engine, [...hold([hand({ ext: OPEN, palm: 0.2 })], 10), ...pushFrames(0.2, 0.26, 24)]);
    expect(events.some((e) => e.type === 'cast')).toBe(false);
    const misfire = events.find((e) => e.type === 'misfire');
    expect(misfire && misfire.type === 'misfire' && misfire.text).toBe('Толкни ладонь вперёд резче');
  });

  it('свайп вниз из позы молнии — каст', () => {
    const engine = new GestureEngine();
    const events: GestureEvent[] = [];
    engine.on((e) => events.push(e));
    const swipe = Array.from({ length: 5 }, (_, i) => [
      hand({ ext: POINT, wrist: { x: 0.5, y: 0.28 + 0.12 * (i + 1) } }),
    ]);
    run(engine, [...hold([hand({ ext: POINT, wrist: { x: 0.5, y: 0.28 } })]), ...swipe]);
    expect(events.find((e) => e.type === 'cast')).toMatchObject({ gesture: 'lightning' });
  });
});
