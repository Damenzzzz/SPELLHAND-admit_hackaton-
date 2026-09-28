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

describe('баги из ревью', () => {
  it('низкая уверенность handedness на кулаке не даёт «мало света» и не мешает щиту', () => {
    const fist = { ...hand({ ext: FIST }), score: 0.3 };
    const snap = run(new GestureEngine(), hold([fist]));
    expect(snap.active).toBe('shield');
    expect(snap.hint).toBeNull();
  });

  it('чуть согнутый указательный ниже головы — подсказка молнии, а не щита', () => {
    const engine = new GestureEngine();
    const snap = run(engine, hold([hand({ ext: { thumb: 0.1, index: 0.65, middle: 0, ring: 0, pinky: 0 }, wrist: { x: 0.5, y: 0.75 } })]));
    expect(snap.hint?.gesture).toBe('lightning');
    expect(snap.hint?.lines).toContain('Подними руку выше головы');
  });

  it('без явного намерения подсказок near-miss нет', () => {
    // полусжатая «клешня»: ни кулак, ни ладонь, ни указательный
    const claw = { thumb: 0.5, index: 0.55, middle: 0.55, ring: 0.55, pinky: 0.55 };
    const snap = run(new GestureEngine(), hold([hand({ ext: claw })]));
    expect(snap.hint?.kind === 'pose' ? snap.hint.gesture : null).not.toBe('shield');
  });

  it('перепутанная на кадр метка руки не снимает щит', () => {
    const engine = new GestureEngine();
    const fist = hand({ ext: FIST });
    const frames = Array.from({ length: 40 }, (_, i) => [
      { ...fist, handedness: (i % 3 === 2 ? 'Right' : 'Left') as 'Left' | 'Right' },
    ]);
    let armedFrames = 0;
    frames.forEach((f, i) => {
      const s = engine.update(f, ASPECT, 120, i * FRAME_MS);
      if (i >= 10 && s.active === 'shield') armedFrames++;
    });
    expect(armedFrames).toBe(30);
  });

  it('две руки сохраняют свои треки, даже если метки меняются местами', () => {
    const engine = new GestureEngine();
    const left = hand({ ext: OPEN, right: false, wrist: { x: 0.7, y: 0.7 } });
    const right = hand({ ext: FIST, wrist: { x: 0.3, y: 0.7 } });
    let s = engine.update([right, left], ASPECT, 120, 0);
    for (let i = 1; i < 20; i++) {
      const swap = i % 4 === 0;
      const a = swap ? { ...right, handedness: left.handedness } : right;
      const b = swap ? { ...left, handedness: right.handedness } : left;
      s = engine.update(i % 2 ? [a, b] : [b, a], ASPECT, 120, i * FRAME_MS);
    }
    const fistHand = s.hands.find((h) => h.extension.index < 0.3)!;
    expect(fistHand.isRealRight).toBe(true);
  });

  it('рука ушла из кадра посреди взмаха молнии — каст, а не потеря', () => {
    const engine = new GestureEngine();
    const events: GestureEvent[] = [];
    engine.on((e) => events.push(e));
    // умеренный взмах (между weak и full порогами), затем рука пропадает
    const swipe = [0.34, 0.41, 0.48].map((y) => [hand({ ext: POINT, wrist: { x: 0.5, y } })]);
    run(engine, [...hold([hand({ ext: POINT, wrist: { x: 0.5, y: 0.28 } })]), ...swipe, [], []]);
    expect(events.find((e) => e.type === 'cast')).toMatchObject({ gesture: 'lightning' });
  });

  it('«мало света» — только по яркости кадра', () => {
    const engine = new GestureEngine();
    let snap = engine.update([hand({ ext: { ...OPEN, ring: 0 } })], ASPECT, 30, 0);
    for (let i = 1; i < 10; i++) snap = engine.update([hand({ ext: { ...OPEN, ring: 0 } })], ASPECT, 30, i * FRAME_MS);
    expect(snap.hint?.lines[0]).toBe('Мало света — повернись к окну или лампе');
  });
});

describe('перезаряд', () => {
  it('огненный шар дольше 2.3 с — взрыв в руке, поза снимается', () => {
    const engine = new GestureEngine();
    const events: GestureEvent[] = [];
    engine.on((e) => events.push(e));
    const snap = run(engine, hold([hand({ ext: OPEN })], 90));
    expect(events.some((e) => e.type === 'overcharge')).toBe(true);
    expect(events.some((e) => e.type === 'cast')).toBe(false);
    expect(snap.hint?.lines[0]).toContain('Перезаряд');
  });
});
