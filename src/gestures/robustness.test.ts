import { describe, expect, it } from 'vitest';
import type { TrackedHand } from '../store/visionStore';
import type { FingerId } from '../vision/features';
import { GestureEngine, type GestureEvent } from './matcher';
import { FIST, OPEN, synthHand, type SynthOptions } from './synthHand';

/**
 * Регрессии надёжности распознавания. Синтетические руки (synthHand) через весь конвейер
 * GestureEngine — это проверка логики на граничных случаях, а не качества на живой камере.
 */
const ASPECT = 16 / 9;
const POINT = { thumb: 0.1, index: 1, middle: 0, ring: 0, pinky: 0 };

function hand(o: Partial<SynthOptions> & { ext: Record<FingerId, number> }): TrackedHand {
  const right = o.right ?? true;
  return { landmarks: synthHand({ aspect: ASPECT, right, ...o }), handedness: right ? 'Left' : 'Right', score: 0.95 };
}

/** Прогон кадров с заданным шагом времени; возвращает события и снимки. */
function feed(engine: GestureEngine, frames: TrackedHand[][], frameMs: number, start = 0) {
  const events: GestureEvent[] = [];
  const off = engine.on((e) => events.push(e));
  const snaps = frames.map((f, i) => engine.update(f, ASPECT, 120, start + i * frameMs));
  off();
  return { events, snaps, end: start + (frames.length - 1) * frameMs };
}
const repeat = <T,>(x: T, n: number) => Array.from({ length: n }, () => x);
/** Нейтральная рука: ни один шаблон не распознан. */
const NEUTRAL = hand({ ext: { thumb: 0.5, index: 0.55, middle: 0.55, ring: 0.55, pinky: 0.55 } });

describe('FPS: подтверждение позы по времени, а не по числу кадров', () => {
  it('60 FPS: мимолётная ладонь (~80 мс) при смене жестов не взводит огненный шар', () => {
    const e = new GestureEngine();
    const { snaps } = feed(e, [...repeat([NEUTRAL], 5), ...repeat([hand({ ext: OPEN })], 6), ...repeat([NEUTRAL], 5)], 16);
    expect(snaps.some((s) => s.active === 'fireball')).toBe(false);
  });

  it('60 FPS: удержанная ладонь взводится', () => {
    const { snaps } = feed(new GestureEngine(), repeat([hand({ ext: OPEN })], 12), 16);
    expect(snaps.at(-1)!.active).toBe('fireball');
  });

  it('8 FPS: поза взводится за то же время, что и на 30 FPS, — толчок не пропадает', () => {
    const e = new GestureEngine();
    const push = [0.21, 0.24, 0.27].map((palm) => [hand({ ext: OPEN, palm })]);
    const { events, snaps } = feed(e, [...repeat([hand({ ext: OPEN, palm: 0.2 })], 3), ...push], 125);
    expect(snaps[2].active).toBe('fireball'); // 3 кадра = 250 мс
    expect(events.some((ev) => ev.type === 'cast' && ev.gesture === 'fireball')).toBe(true);
  });

  it('30 FPS: поведение прежнее — взвод на 5-м кадре', () => {
    const { snaps } = feed(new GestureEngine(), repeat([hand({ ext: OPEN })], 6), 33);
    expect(snaps[3].active).toBeNull();
    expect(snaps[4].active).toBe('fireball');
  });
});

describe('FPS: пропуски кадров не обнуляют скорость движения', () => {
  const up = { x: 0.5, y: 0.28 };
  it('быстрый взмах молнии с провалом кадра (200 мс) и уходом руки вниз засчитывается', () => {
    const e = new GestureEngine();
    const armed = feed(e, repeat([hand({ ext: POINT, wrist: up })], 12), 33);
    expect(armed.snaps.at(-1)!.active).toBe('lightning');
    // следующий кадр пришёл через 200 мс (рука уже ниже), дальше рука ушла за нижний край
    const { events } = feed(e, [[hand({ ext: POINT, wrist: { x: 0.5, y: 0.55 } })], [], []], 33, armed.end + 200);
    expect(events.find((ev) => ev.type === 'cast')).toMatchObject({ gesture: 'lightning' });
  });

  it('медленный дрейф через тот же провал не кастует', () => {
    const e = new GestureEngine();
    const armed = feed(e, repeat([hand({ ext: POINT, wrist: up })], 12), 33);
    const { events } = feed(e, [[hand({ ext: POINT, wrist: { x: 0.5, y: 0.3 } })], [], []], 33, armed.end + 200);
    expect(events.some((ev) => ev.type === 'cast')).toBe(false);
  });
});

describe('потеря руки на несколько кадров', () => {
  it('щит не мигает при провале детекции на 3 кадра', () => {
    const e = new GestureEngine();
    const fist = [hand({ ext: FIST })];
    const { snaps } = feed(e, [...repeat(fist, 10), [], [], [], ...repeat(fist, 5)], 33);
    const after = snaps.slice(5);
    expect(after.every((s) => s.active === 'shield')).toBe(true);
  });

  it('заряд огненного шара переживает короткий провал', () => {
    const e = new GestureEngine();
    const palm = [hand({ ext: OPEN })];
    const { snaps } = feed(e, [...repeat(palm, 25), [], [], ...repeat(palm, 3)], 33);
    expect(snaps.at(-1)!.active).toBe('fireball');
    expect(snaps.at(-1)!.charge).toBeGreaterThan(snaps[24].charge);
  });

  it('рука ушла надолго — поза отпускается (трек умер)', () => {
    const e = new GestureEngine();
    const { snaps } = feed(e, [...repeat([hand({ ext: FIST })], 10), ...repeat([], 10)], 33);
    expect(snaps.at(-1)!.active).toBeNull();
  });

  it('вторая рука пропала на кадр-другой — лечение держится', () => {
    const e = new GestureEngine();
    const a = hand({ ext: OPEN, wrist: { x: 0.45, y: 0.7 } });
    const b = hand({ ext: OPEN, right: false, wrist: { x: 0.55, y: 0.7 } });
    const { snaps } = feed(e, [...repeat([a, b], 10), [a], [a], ...repeat([a, b], 4)], 33);
    expect(snaps.slice(6).every((s) => s.active === 'heal')).toBe(true);
  });

  it('порядок двух рук в кадре меняется — ветер остаётся ветром и срабатывает', () => {
    const e = new GestureEngine();
    const at = (x: number, right: boolean) => hand({ ext: OPEN, right, wrist: { x, y: 0.7 } });
    const frames: TrackedHand[][] = [];
    for (let i = 0; i < 12; i++) frames.push(i % 2 ? [at(0.3, true), at(0.7, false)] : [at(0.7, false), at(0.3, true)]);
    for (let i = 1; i <= 4; i++) frames.push(i % 2 ? [at(0.3 + 0.07 * i, true), at(0.7 + 0.07 * i, false)] : [at(0.7 + 0.07 * i, false), at(0.3 + 0.07 * i, true)]);
    const { events, snaps } = feed(e, frames, 33);
    expect(snaps[11].active).toBe('wind');
    expect(events.find((ev) => ev.type === 'cast')).toMatchObject({ gesture: 'wind' });
  });
});

describe('смена экрана и пауза не переносят позу и заряд', () => {
  it('resetIntent: взведённый шар и перо руны сбрасываются, трекинг для меню остаётся', () => {
    const e = new GestureEngine();
    const { snaps } = feed(e, repeat([hand({ ext: OPEN })], 30), 33);
    expect(snaps.at(-1)!.active).toBe('fireball');
    e.resetIntent();
    const next = e.update([hand({ ext: OPEN })], ASPECT, 120, 30 * 33);
    expect(next.active).toBeNull();
    expect(next.charge).toBe(0);
    expect(next.hands).toHaveLength(1);
  });

  it('смена экрана сама вызывает resetIntent (заряд из меню не попадает в разминку)', async () => {
    const { useGame } = await import('../store/gameStore');
    const { startIntentReset } = await import('../store/intentReset');
    const e = new GestureEngine();
    const stop = startIntentReset(e);
    try {
      feed(e, repeat([hand({ ext: OPEN })], 30), 33);
      useGame.getState().go('rush');
      expect(e.update([hand({ ext: OPEN })], ASPECT, 120, 1000).active).toBeNull();
    } finally {
      stop();
      useGame.setState({ screen: 'calibration' });
    }
  });
});

describe('перо руны и обычные жесты', () => {
  it('пока перо опущено, огненный шар не взводится и не стреляет', () => {
    const e = new GestureEngine();
    // «OK»: раскрытая ладонь, кончик большого прижат к кончику указательного
    const base = hand({ ext: OPEN });
    const lm = base.landmarks.map((p) => ({ ...p }));
    lm[4] = { ...lm[8] };
    const pen = { ...base, landmarks: lm };
    const { snaps, events } = feed(e, repeat([pen], 20), 33);
    expect(snaps.at(-1)!.rune.penDown).toBe(true);
    expect(snaps.every((s) => s.active !== 'fireball')).toBe(true);
    expect(events.some((ev) => ev.type === 'cast')).toBe(false);
  });
});

describe('ложные срабатывания: неподвижная рука с шумом, разный FPS и провалы кадров', () => {
  /** Детерминированный шум: одинаковый результат на каждом прогоне. */
  function rng(seed: number) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }
  const jitter = (h: TrackedHand, r: () => number, sigma: number): TrackedHand => ({
    ...h,
    landmarks: h.landmarks.map((p) => ({ x: p.x + (r() + r() + r() - 1.5) * sigma, y: p.y + (r() + r() + r() - 1.5) * sigma, z: p.z })),
  });
  const POSES: Record<string, TrackedHand[]> = {
    open: [hand({ ext: OPEN })],
    fist: [hand({ ext: FIST })],
    ice: [hand({ ext: { thumb: 0.2, index: 1, middle: 1, ring: 0, pinky: 0 }, together: 1 })],
    pointUp: [hand({ ext: POINT, wrist: { x: 0.5, y: 0.28 } })],
    pointLow: [hand({ ext: POINT, wrist: { x: 0.6, y: 0.7 } })],
    twoApart: [hand({ ext: OPEN, wrist: { x: 0.3, y: 0.7 } }), hand({ ext: OPEN, right: false, wrist: { x: 0.7, y: 0.7 } })],
    twoTogether: [hand({ ext: OPEN, wrist: { x: 0.45, y: 0.7 } }), hand({ ext: OPEN, right: false, wrist: { x: 0.55, y: 0.7 } })],
  };

  for (const fps of [8, 15, 30, 60]) {
    it(`${fps} FPS: 6 с неподвижной позы без движения — ноль кастов`, () => {
      const r = rng(fps);
      for (const [name, pose] of Object.entries(POSES)) {
        const e = new GestureEngine();
        const casts: string[] = [];
        e.on((ev) => ev.type === 'cast' && casts.push(`${name}:${ev.gesture}`));
        let t = 0;
        while (t < 6000) {
          e.update(pose.map((h) => jitter(h, r, 0.003)), ASPECT, 120, t);
          t += 1000 / fps + (r() < 0.1 ? 200 : 0); // иногда провал кадра на 200 мс
        }
        expect(casts).toEqual([]);
      }
    });
  }

  it('ладонь медленно водят по экрану (курсор меню) — не толчок и не ветер', () => {
    for (const fps of [8, 30, 60]) {
      const e = new GestureEngine();
      const casts: string[] = [];
      e.on((ev) => ev.type === 'cast' && casts.push(ev.gesture));
      for (let t = 0; t < 5000; t += 1000 / fps) {
        const x = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t / 900));
        const y = 0.55 + 0.15 * Math.sin(t / 1300);
        e.update([hand({ ext: OPEN, wrist: { x, y } })], ASPECT, 120, t);
      }
      expect(casts).toEqual([]);
    }
  });
});

describe('кнопки посреди боя и рука, которая колдует', () => {
  it('кулак щита, ладонь заряда или взведённая поза не нажимают кнопку; указующий жест — нажимает', async () => {
    const { guardedPressAllowed } = await import('../ui/dwell');
    const ext = (index: number, rest: number) => ({ extension: { thumb: 0.2, index, middle: rest, ring: rest, pinky: rest } });
    expect(guardedPressAllowed({ active: null }, ext(0.1, 0.1))).toBe(false); // кулак
    expect(guardedPressAllowed({ active: null }, ext(1, 1))).toBe(false); // открытая ладонь
    expect(guardedPressAllowed({ active: 'shield' }, ext(1, 0.1))).toBe(false); // заклинание взведено
    expect(guardedPressAllowed({ active: 'lightning' }, ext(1, 0.1))).toBe(false);
    expect(guardedPressAllowed({ active: null }, ext(1, 0.1))).toBe(true); // указывает пальцем
    expect(guardedPressAllowed(null, ext(1, 0.1))).toBe(false);
  });
});

describe('подсказки и двуручные жесты не зависят от порядка рук в кадре', () => {
  // игрок пытается сделать ветер: одна ладонь раскрыта, вторая полусжата
  const open = hand({ ext: OPEN, wrist: { x: 0.3, y: 0.7 } });
  const half = hand({ ext: { thumb: 0.6, index: 0.6, middle: 0.6, ring: 0.55, pinky: 0.55 }, right: false, wrist: { x: 0.7, y: 0.7 } });

  it('порядок [раскрытая, полусжатая] и обратный дают одинаковую оценку и намерение ветра', () => {
    const a = new GestureEngine().update([open, half], ASPECT, 120, 0).scores.wind;
    const b = new GestureEngine().update([half, open], ASPECT, 120, 0).scores.wind;
    expect(b.score).toBeCloseTo(a.score, 5);
    expect(b.intent).toBe(a.intent);
  });

  it('при смене порядка рук каждый кадр оценка и намерение ветра не мигают (таймер подсказки не сбрасывается)', () => {
    const e = new GestureEngine();
    const frames = Array.from({ length: 30 }, (_, i) => (i % 2 ? [open, half] : [half, open]));
    const { snaps } = feed(e, frames, 33);
    const tail = snaps.slice(10).map((s) => s.scores.wind);
    expect(tail.every((w) => w.intent)).toBe(true);
    const spread = Math.max(...tail.map((w) => w.score)) - Math.min(...tail.map((w) => w.score));
    expect(spread).toBeLessThan(0.02);
  });
});

describe('приоритет обратной связи: потеря руки важнее незавершённого движения', () => {
  const ICE = { thumb: 0.2, index: 1, middle: 1, ring: 0, pinky: 0 };
  it('контроль: тот же слабый кивок с рукой в кадре — осечка «кивни резче»', () => {
    const e = new GestureEngine();
    const at = (y: number) => [hand({ ext: ICE, together: 1, wrist: { x: 0.5, y } })];
    const armed = feed(e, repeat(at(0.6), 12), 33);
    const weak = feed(e, [at(0.63), at(0.66), at(0.69)], 33, armed.end + 33);
    const still = feed(e, repeat(at(0.69), 15), 33, weak.end + 33);
    expect([...weak.events, ...still.events].some((ev) => ev.type === 'misfire' && ev.gesture === 'ice')).toBe(true);
  });

  it('слабый кивок льда и рука ушла из кадра — ни осечки «резче», ни устаревшей подсказки', () => {
    const e = new GestureEngine();
    const at = (y: number) => [hand({ ext: ICE, together: 1, wrist: { x: 0.5, y } })];
    const armed = feed(e, repeat(at(0.6), 12), 33);
    expect(armed.snaps.at(-1)!.active).toBe('ice');
    // кончики пошли вниз медленнее полного кивка (слабое движение), затем рука пропала
    // слабый кивок + 2 кадра удержания (фильтр догоняет — движение засчитано как слабое), затем рука пропала
    const weak = feed(e, [at(0.63), at(0.66), at(0.69), at(0.69), at(0.69)], 33, armed.end + 33);
    const lost = feed(e, repeat([], 20), 33, weak.end + 33);
    expect([...weak.events, ...lost.events].some((ev) => ev.type === 'misfire')).toBe(false);
    expect(lost.snaps.at(-1)!.hint?.kind).toBe('context'); // «Покажи руку камере»
    // рука вернулась — старое «кивни резче» не всплывает
    const back = feed(e, repeat([hand({ ext: { thumb: 0.5, index: 0.55, middle: 0.55, ring: 0.55, pinky: 0.55 } })], 3), 33, lost.end + 33);
    expect(back.snaps.at(-1)!.hint?.kind === 'motion').toBe(false);
  });
});
