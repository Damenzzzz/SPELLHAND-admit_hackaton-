import { describe, expect, it } from 'vitest';
import { BattleStats } from './stats';

describe('точность: щит', () => {
  it('мигающий щит не накручивает удачные касты', () => {
    const s = new BattleStats();
    for (let t = 0; t < 3000; t += 200) {
      s.shieldUp(t);
      s.shieldTick(t + 100, 0.9);
      s.shieldDown();
    }
    expect(s.summary().casts).toBe(0);
  });

  it('удержание ≥0.5 с — один зачёт за подъём', () => {
    const s = new BattleStats();
    s.shieldUp(0);
    for (let t = 0; t <= 3000; t += 16) s.shieldTick(t, 0.9);
    expect(s.summary().perSpell.shield?.count).toBe(1);
  });

  it('короткий щит, заблокировавший удар, засчитывается', () => {
    const s = new BattleStats();
    s.shieldUp(0);
    s.shieldBlocked(0.8);
    s.shieldBlocked(0.8);
    expect(s.summary().perSpell.shield?.count).toBe(1);
  });
});
