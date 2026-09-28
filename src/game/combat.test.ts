import { describe, expect, it } from 'vitest';
import { Battle } from './combat';
import { LEVEL_BY_ID } from './data/levels';
import { SHIELDS, STAFFS } from './data/items';

const loadout = { staff: STAFFS[0], shield: SHIELDS[0] };
const seeded = () => {
  let s = 42;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

function step(b: Battle, ms: number, charging = false) {
  for (let i = 0; i < ms / 16; i++) b.tick(16, charging);
}

describe('бой', () => {
  it('точный жест бьёт сильнее неточного', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    b.playerCast('fireball', 1, 1, 1);
    b.player.cooldowns = {};
    b.playerCast('fireball', 0.5, 1, 1);
    const [strong, weak] = b.projectiles;
    expect(strong.damage).toBe(35);
    expect(weak.damage).toBeLessThan(strong.damage);
  });

  it('без маны каст отклоняется с причиной', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    const reasons: string[] = [];
    b.on((e) => e.type === 'reject' && reasons.push(e.reason));
    b.player.mana = 10;
    expect(b.playerCast('lightning', 1, 1, 1)).toBe(false);
    expect(reasons).toEqual(['Мало маны']);
  });

  it('щит гасит огонь, молния пробивает 50%', () => {
    const b = new Battle(LEVEL_BY_ID[6], loadout, seeded());
    b.setPlayerHolds(true, false);
    b.enemyCast('fireball');
    step(b, 800);
    expect(b.player.hp).toBe(100);
    const hpBefore = b.player.hp;
    b.enemyCast('lightning');
    step(b, 200);
    expect(b.player.hp).toBeLessThan(hpBefore);
    expect(b.player.shield.durability).toBeLessThan(100);
  });

  it('щит ломается и восстанавливается после кулдауна', () => {
    const b = new Battle(LEVEL_BY_ID[7], loadout, seeded());
    const events: string[] = [];
    b.on((e) => events.push(e.type));
    b.setPlayerHolds(true, false);
    b.player.shield.durability = 5;
    b.enemyCast('fireball');
    step(b, 800);
    expect(events).toContain('shieldBreak');
    expect(b.player.shield.up).toBe(false);
    b.setPlayerHolds(true, false);
    expect(b.player.shield.up).toBe(false);
    step(b, 6100);
    expect(events).toContain('shieldRestored');
  });

  it('уровень 1 проходится огненными шарами', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    let guard = 0;
    while (!b.over && guard++ < 2000) {
      b.playerCast('fireball', 0.9, 1, 1);
      step(b, 480);
    }
    expect(b.winner).toBe('player');
  });

  it('финальный босс лечится и ускоряется на 50% HP', () => {
    const b = new Battle(LEVEL_BY_ID[10], loadout, seeded());
    const events: string[] = [];
    b.on((e) => events.push(e.type));
    b.enemy.hp = 99;
    step(b, 32);
    expect(events).toContain('enrage');
    expect(b.enemy.hp).toBe(139);
  });
});
