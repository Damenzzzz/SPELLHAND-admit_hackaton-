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
    // идеальный жест: 35 × 1.0 × PERFECT 1.2
    expect(strong.damage).toBe(42);
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

describe('PvP-режим', () => {
  it('входящий каст соперника бьёт меня, мой каст не меняет его HP локально', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded(), true);
    b.remoteCast({ spell: 'fireball', damage: 30, quality: 1, pierce: 0, shieldDamage: null, slowFactor: null, slowMs: null, interrupt: false, travelMs: 300 });
    step(b, 400);
    expect(b.player.hp).toBe(70);
    b.playerCast('fireball', 1, 1, 1);
    step(b, 800);
    expect(b.enemy.hp).toBe(b.enemy.maxHp);
    b.applyRemoteState({ hp: 42, maxHp: 100, shieldUp: true, durability: 80, shieldMax: 100 });
    expect(b.enemy.hp).toBe(42);
    expect(b.enemy.shield.up).toBe(true);
  });

  it('бот в PvP не колдует, конец боя — по сигналу соперника', () => {
    const b = new Battle(LEVEL_BY_ID[9], loadout, seeded(), true);
    step(b, 6000);
    expect(b.player.hp).toBe(100);
    b.forceEnd('player');
    expect(b.winner).toBe('player');
  });
});

describe('оценки и комбо', () => {
  it('серия удачных кастов растит урон, «слабо» её обрывает', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    const events: string[] = [];
    b.on((e) => e.type === 'comboBreak' && events.push('break'));
    const cast = (q: number) => {
      b.player.mana = 100;
      b.player.cooldowns = {};
      b.playerCast('fireball', q, 1, 1);
      return b.projectiles.at(-1)!.damage;
    };
    const first = cast(0.95);
    cast(0.95);
    const third = cast(0.95);
    expect(third).toBeGreaterThan(first);
    expect(b.combo).toBe(3);
    cast(0.6);
    expect(b.combo).toBe(0);
    expect(events).toEqual(['break']);
  });

  it('ошибка жеста (near-miss) обрывает серию', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    b.playerCast('fireball', 0.95, 1, 1);
    expect(b.combo).toBe(1);
    b.breakCombo();
    expect(b.combo).toBe(0);
  });
});
