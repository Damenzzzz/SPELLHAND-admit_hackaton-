import { describe, expect, it } from 'vitest';
import { PoseTracker, type PoseEvent, type PosePoint } from './pose';

/** Синтетическая поза: плечи шириной 0.3, центр cx; запястья задаются. */
function body(cx: number, wrists: { l: [number, number]; r: [number, number] } | null = null): PosePoint[] {
  const lm: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.1 }));
  lm[0] = { x: cx, y: 0.3, z: 0, visibility: 0.99 };
  lm[11] = { x: cx + 0.15, y: 0.5, z: 0, visibility: 0.99 }; // левое плечо человека — справа в незеркальном кадре
  lm[12] = { x: cx - 0.15, y: 0.5, z: 0, visibility: 0.99 };
  const w = wrists ?? { l: [cx + 0.2, 0.85], r: [cx - 0.2, 0.85] };
  lm[15] = { x: w.l[0], y: w.l[1], z: 0, visibility: 0.9 };
  lm[16] = { x: w.r[0], y: w.r[1], z: 0, visibility: 0.9 };
  return lm;
}

function run(frames: PosePoint[][]) {
  const tr = new PoseTracker();
  const events: PoseEvent[] = [];
  frames.forEach((f, i) => events.push(...tr.update(f, i * 50).events));
  return events;
}

const neutral = (n: number) => Array.from({ length: n }, () => body(0.5));

describe('поза', () => {
  it('резкий наклон после калибровки — уклонение; повтор требует возврата в нейтраль', () => {
    const lean = (n: number) => Array.from({ length: n }, () => body(0.64));
    const ev = run([...neutral(25), ...lean(10), ...lean(10), ...neutral(5), ...lean(5)]);
    const dodges = ev.filter((e) => e.type === 'dodge');
    expect(dodges).toHaveLength(2);
    expect(dodges[0]).toMatchObject({ dir: 'left' });
  });

  it('медленный дрейф в кадре не считается уклонением', () => {
    const drift = Array.from({ length: 200 }, (_, i) => body(0.5 + i * 0.0006));
    expect(run([...neutral(25), ...drift]).filter((e) => e.type === 'dodge')).toHaveLength(0);
  });

  it('скрещённые на груди руки — супер-щит, пока держишь', () => {
    const cross = Array.from({ length: 10 }, () => body(0.5, { l: [0.42, 0.62], r: [0.58, 0.62] }));
    const ev = run([...neutral(25), ...cross, ...neutral(3)]).map((e) => e.type);
    expect(ev).toEqual(['crossStart', 'crossEnd']);
  });

  it('обе руки над головой — медитация', () => {
    const up = Array.from({ length: 15 }, () => body(0.5, { l: [0.62, 0.1], r: [0.38, 0.1] }));
    expect(run([...neutral(25), ...up]).filter((e) => e.type === 'armsUp')).toHaveLength(1);
  });
});
