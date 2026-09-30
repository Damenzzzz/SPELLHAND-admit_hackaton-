import { describe, expect, it } from 'vitest';
import { GestureEngine, type GestureEvent, type GestureSnapshot } from '../gestures/matcher';
import { FIST, synthHand } from '../gestures/synthHand';
import type { GestureId } from '../gestures/types';
import type { TrackedHand } from '../store/visionStore';
import { ACADEMY, AcademyCounter } from './academyProgress';

const ASPECT = 16 / 9;
const hand = (ext: typeof FIST): TrackedHand[] => [{ landmarks: synthHand({ aspect: ASPECT, right: true, ext }), handedness: 'Left', score: 0.95 }];
/** Ослабленный кулак: щит отпускается (score < release), но это не «опустил руку». */
const LOOSE = { thumb: 0.5, index: 0.75, middle: 0.75, ring: 0.7, pinky: 0.7 };

/** Прежнее правило из Academy.tsx: засчитать, если поза держится ≥ 1 с и это новый activeSince. */
function legacyHoldCount(snaps: GestureSnapshot[], gesture: GestureId) {
  let counted = -1;
  let n = 0;
  for (const s of snaps) {
    if (s.active === gesture && s.t - s.activeSince >= ACADEMY.holdMs && counted !== s.activeSince) {
      counted = s.activeSince;
      n++;
    }
  }
  return n;
}

function snapsOf(frames: TrackedHand[][], frameMs = 33) {
  const e = new GestureEngine();
  return frames.map((f, i) => e.update(f, ASPECT, 120, i * frameMs));
}
const repeat = <T,>(x: T, n: number) => Array.from({ length: n }, () => x);

describe('удержание щита/лечения', () => {
  it('воспроизведение: кулак на мгновение ослаб (поза мигнула) — прежний подсчёт давал 2 попытки, теперь 1', () => {
    const snaps = snapsOf([...repeat(hand(FIST), 40), ...repeat(hand(LOOSE), 4), ...repeat(hand(FIST), 40)]);
    // поза действительно мигнула: была отпущена и взведена снова
    const actives = snaps.map((s) => s.active);
    expect(actives.slice(40, 46)).toContain(null);
    expect(actives.at(-1)).toBe('shield');
    expect(legacyHoldCount(snaps, 'shield')).toBe(2);

    const c = new AcademyCounter('shield', 'hold');
    snaps.forEach((s) => c.onSnapshot(s));
    expect(c.count).toBe(1);
  });

  it('одно долгое удержание — одна попытка', () => {
    const c = new AcademyCounter('shield', 'hold');
    for (let t = 0; t <= 6000; t += 33) c.onSnapshot({ t, active: 'shield', quality: 0.9 });
    expect(c.count).toBe(1);
    expect(c.holdState(6000, 'shield').phase).toBe('counted');
  });

  it('опустил руку (≥ 0,3 с) и поднял снова — следующая попытка', () => {
    const c = new AcademyCounter('heal', 'hold');
    let t = 0;
    const hold = (ms: number, active: GestureId | null) => {
      for (const end = t + ms; t < end; t += 33) c.onSnapshot({ t, active, quality: 0.9 });
    };
    hold(1200, 'heal');
    hold(400, null);
    hold(1200, 'heal');
    hold(400, null);
    hold(900, 'heal'); // меньше секунды — не засчитано
    expect(c.count).toBe(2);
  });

  it('прогресс удержания растёт до 1 и сбрасывается после отпускания', () => {
    const c = new AcademyCounter('shield', 'hold');
    c.onSnapshot({ t: 0, active: 'shield', quality: 1 });
    expect(c.holdState(500, 'shield')).toEqual({ phase: 'holding', progress: 0.5 });
    c.onSnapshot({ t: 1000, active: 'shield', quality: 1 });
    expect(c.holdState(1000, 'shield').phase).toBe('counted');
    c.onSnapshot({ t: 1100, active: null, quality: 0 });
    c.onSnapshot({ t: 1500, active: null, quality: 0 });
    expect(c.holdState(1500, null)).toEqual({ phase: 'idle', progress: 0 });
  });
});

describe('движения', () => {
  const cast = (gesture: GestureId, shard = 1): GestureEvent => ({ type: 'cast', gesture, quality: 0.9, charge: 1, shard, handIdx: 0, t: 0 });

  it('три осколка одного ледяного каста — одна попытка; новая серия — ещё одна', () => {
    const c = new AcademyCounter('ice', 'motion');
    [1, 2, 3].forEach((s) => c.onEvent(cast('ice', s)));
    expect(c.count).toBe(1);
    [1, 2].forEach((s) => c.onEvent(cast('ice', s)));
    expect(c.count).toBe(2);
  });

  it('чужой жест, осечка и near-miss не засчитываются и не стирают успехи', () => {
    const c = new AcademyCounter('fireball', 'motion');
    c.onEvent(cast('fireball'));
    c.onEvent(cast('lightning'));
    c.onEvent({ type: 'misfire', gesture: 'fireball', id: 'fireball_motion_weak', text: '', t: 0 });
    c.onEvent({ type: 'nearMiss', gesture: 'fireball', constraints: [], t: 0 });
    c.onEvent({ type: 'overcharge', gesture: 'fireball', t: 0 });
    expect(c.count).toBe(1);
    c.onEvent(cast('fireball'));
    c.onEvent(cast('fireball'));
    expect(c.done).toBe(true);
  });

  it('счётчик удержания игнорирует касты, счётчик движения — снимки', () => {
    const hold = new AcademyCounter('shield', 'hold');
    hold.onEvent(cast('shield'));
    expect(hold.count).toBe(0);
    const move = new AcademyCounter('fireball', 'motion');
    for (let t = 0; t < 3000; t += 33) move.onSnapshot({ t, active: 'fireball', quality: 1 });
    expect(move.count).toBe(0);
  });
});

describe('переход между упражнениями', () => {
  it('смена упражнения в Академии сбрасывает взведённую позу и заряд распознавателя', async () => {
    const { useGame } = await import('../store/gameStore');
    const { startIntentReset } = await import('../store/intentReset');
    const { OPEN } = await import('../gestures/synthHand');
    const e = new GestureEngine();
    const stop = startIntentReset(e);
    try {
      useGame.getState().openAcademy('fireball');
      const palm = hand(OPEN as typeof FIST);
      let s: GestureSnapshot | null = null;
      for (let i = 0; i < 30; i++) s = e.update(palm, ASPECT, 120, i * 33);
      expect(s!.active).toBe('fireball');
      useGame.getState().openAcademy('ice'); // «Дальше» — экран тот же, упражнение другое
      expect(e.update(palm, ASPECT, 120, 31 * 33).active).toBeNull();
    } finally {
      stop();
      useGame.setState({ screen: 'calibration', academyGesture: null });
    }
  });
});
