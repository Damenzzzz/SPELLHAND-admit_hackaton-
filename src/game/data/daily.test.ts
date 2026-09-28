import { describe, expect, it } from 'vitest';
import { dailyChallenge, dailyScore } from './daily';

describe('испытание дня', () => {
  it('детерминировано по дате и различается между днями', () => {
    expect(dailyChallenge('2026-10-01')).toEqual(dailyChallenge('2026-10-01'));
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map(
      (d) => dailyChallenge(d).modifier.id + dailyChallenge(d).level.enemyName,
    );
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('очки растут с точностью и скоростью, поражение — мало очков', () => {
    expect(dailyScore(true, 0.9, 30000)).toBeGreaterThan(dailyScore(true, 0.7, 30000));
    expect(dailyScore(true, 0.9, 30000)).toBeGreaterThan(dailyScore(true, 0.9, 90000));
    expect(dailyScore(false, 0.9, 30000)).toBeLessThan(dailyScore(true, 0.3, 100000));
  });
});
