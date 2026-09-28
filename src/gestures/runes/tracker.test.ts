import { describe, expect, it } from 'vitest';
import type { HandFeatures } from '../../vision/features';
import { runeShape } from './runes';
import { RuneTracker, type RuneEvent } from './tracker';

/** Минимальная «рука» для трекера: кончики большого/указательного и выпрямленный средний. */
function penHand(x: number, y: number, pinch = true): HandFeatures {
  const pts = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  pts[4] = { x: x - 0.005, y, z: 0 };
  pts[8] = { x: x + (pinch ? 0.005 : 0.1), y, z: 0 };
  return {
    pts,
    raw: pts,
    palmSize: 0.1,
    extension: { thumb: 1, index: 0.5, middle: 0.9, ring: 0.9, pinky: 0.9 },
  } as unknown as HandFeatures;
}

function drawRune(shape: { x: number; y: number }[], ms = 1200) {
  const tr = new RuneTracker();
  const events: RuneEvent[] = [];
  const frames = 36;
  let t = 0;
  for (let i = 0; i < 3; i++, t += 33) tr.update([penHand(0.5, 0.5)], t); // перо опускается
  for (let i = 0; i < frames; i++, t += ms / frames) {
    const p = shape[Math.floor((i / frames) * shape.length)];
    const r = tr.update([penHand(0.5 + p.x * 0.25, 0.5 + p.y * 0.25)], t);
    if (r.event) events.push(r.event);
  }
  for (let i = 0; i < 8; i++, t += 33) {
    const r = tr.update([penHand(0.5, 0.5, false)], t); // перо поднято
    if (r.event) events.push(r.event);
  }
  return events;
}

describe('трекер пера', () => {
  it('треугольник пером — руна «метеор»', () => {
    expect(drawRune(runeShape('meteor'))).toMatchObject([{ type: 'rune', rune: 'meteor' }]);
  });

  it('круг пером — руна «сфера»', () => {
    expect(drawRune(runeShape('sphere'))).toMatchObject([{ type: 'rune', rune: 'sphere' }]);
  });

  it('крошечный росчерк — «рисуй крупнее»', () => {
    const tiny = runeShape('meteor').map((p) => ({ x: p.x * 0.04, y: p.y * 0.04 }));
    const ev = drawRune(tiny);
    expect(ev[0]).toMatchObject({ type: 'runeFail' });
    expect(ev[0].type === 'runeFail' && ev[0].reason).toContain('крупнее');
  });

  it('слишком долгий росчерк — отказ с объяснением', () => {
    const ev = drawRune(runeShape('chain'), 4000);
    expect(ev[0].type === 'runeFail' && ev[0].reason).toContain('долго');
  });

  it('кулак не опускает перо', () => {
    const tr = new RuneTracker();
    const fist = penHand(0.5, 0.5);
    fist.extension.middle = 0.1;
    for (let i = 0; i < 5; i++) expect(tr.update([fist], i * 33).penDown).toBe(false);
  });
});
