import { describe, expect, it } from 'vitest';
import type { Pt } from './pdollar';
import { recognize } from './pdollar';
import { RUNE_TEMPLATES, runeShape, type RuneId } from './runes';

// «нарисовано рукой»: масштаб, сдвиг, неравномерная скорость и дрожание
function drawn(id: RuneId, seed = 1, scale = 0.2, jitter = 0.04): Pt[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  return runeShape(id).flatMap((p, i) =>
    Array.from({ length: 1 + (i % 3) }, () => ({ x: 0.5 + p.x * scale + rnd() * jitter * scale, y: 0.4 + p.y * scale + rnd() * jitter * scale })),
  );
}

describe('$P-распознаватель рун', () => {
  for (const id of ['meteor', 'chain', 'prison', 'sphere', 'mend'] as RuneId[]) {
    it(`узнаёт «${id}», нарисованную с дрожанием`, () => {
      for (const seed of [1, 7, 42]) {
        const r = recognize(drawn(id, seed), RUNE_TEMPLATES)!;
        expect(r.id).toBe(id);
        expect(r.score).toBeGreaterThan(0.75);
      }
    });
  }

  it('устойчив к размеру и направлению обхода', () => {
    const big = drawn('sphere', 3, 0.35);
    const reversed = [...drawn('meteor', 5)].reverse();
    expect(recognize(big, RUNE_TEMPLATES)!.id).toBe('sphere');
    expect(recognize(reversed, RUNE_TEMPLATES)!.id).toBe('meteor');
  });

  it('каракули дают низкую оценку или малый отрыв', () => {
    let s = 9;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const scribble = Array.from({ length: 40 }, () => ({ x: rnd(), y: rnd() }));
    const r = recognize(scribble, RUNE_TEMPLATES)!;
    expect(r.score < 0.75 || r.margin < 0.08).toBe(true);
  });
});
