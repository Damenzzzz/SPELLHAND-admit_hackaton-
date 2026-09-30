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

describe('парирование щитом', () => {
  const fire = (b: Battle) => b.enemyCast('fireball'); // летит 650 мс

  it('щит в последние 200 мс до попадания — снаряд отражается во врага', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    const ev: string[] = [];
    b.on((e) => (e.type === 'parry' || e.type === 'parryMiss') && ev.push(e.type));
    fire(b);
    step(b, 520);
    b.setPlayerHolds(true, false);
    step(b, 300);
    expect(ev).toEqual(['parry']);
    expect(b.player.hp).toBe(100);
    expect(b.player.shield.durability).toBe(100);
    step(b, 900);
    expect(b.enemy.hp).toBeLessThan(b.enemy.maxHp);
  });

  it('щит заранее — обычный блок с подсказкой «рано»', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    const miss: number[] = [];
    b.on((e) => e.type === 'parryMiss' && miss.push(e.deltaMs));
    fire(b);
    step(b, 250);
    b.setPlayerHolds(true, false);
    step(b, 600);
    expect(miss.length).toBe(1);
    expect(miss[0]).toBeLessThan(0);
    expect(b.player.shield.durability).toBeLessThan(100);
  });

  it('щит сразу после попадания — «поздно на X мс»', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    const miss: number[] = [];
    b.on((e) => e.type === 'parryMiss' && miss.push(e.deltaMs));
    fire(b);
    step(b, 700);
    b.setPlayerHolds(true, false);
    expect(miss.length).toBe(1);
    expect(miss[0]).toBeGreaterThan(0);
    expect(b.player.hp).toBeLessThan(100);
  });
});

describe('руны в бою', () => {
  it('метеор бьёт сильнее огненного шара, руны делят кулдаун и стоят 60 маны', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    const reasons: string[] = [];
    b.on((e) => e.type === 'reject' && reasons.push(e.reason));
    expect(b.playerRune('meteor', 0.9)).toBe(true);
    expect(b.projectiles.at(-1)!.damage).toBeGreaterThan(35);
    expect(b.player.mana).toBe(40);
    expect(b.playerRune('chain', 0.9)).toBe(false);
    expect(reasons[0]).toContain('Перезарядка рун');
  });

  it('ледяная тюрьма замораживает врага сквозь щит — бот молчит 4 с', () => {
    const b = new Battle(LEVEL_BY_ID[9], loadout, seeded());
    b.setShield('enemy', true);
    b.playerRune('prison', 0.9);
    step(b, 500);
    expect(b.enemy.frozenUntil).toBeGreaterThan(b.t);
    const hp = b.player.hp;
    step(b, 3400);
    expect(b.player.hp).toBe(hp);
    expect(b.projectiles.filter((p) => p.from === 'enemy')).toHaveLength(0);
  });

  it('цепная молния пробивает щит полностью; сфера чинит сломанный щит', () => {
    const b = new Battle(LEVEL_BY_ID[9], loadout, seeded());
    b.setShield('enemy', true);
    const hp = b.enemy.hp;
    b.playerRune('chain', 0.9);
    step(b, 200);
    expect(hp - b.enemy.hp).toBeGreaterThan(25);

    const c = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    c.player.shield.brokenUntil = 5000;
    c.player.shield.durability = 0;
    c.playerRune('sphere', 0.9);
    expect(c.player.shield.brokenUntil).toBe(0);
    expect(c.player.shield.durability).toBe(c.player.shield.max);
  });
});

describe('стихии и комбо', () => {
  const fresh = (b: Battle) => {
    b.player.mana = 100;
    b.player.cooldowns = {};
  };

  it('огненный шар поджигает врага: урон идёт и после попадания', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    b.playerCast('fireball', 0.9, 0, 1);
    step(b, 700);
    const after = b.enemy.hp;
    expect(b.enemy.burningUntil).toBeGreaterThan(b.t);
    step(b, 1500);
    expect(b.enemy.hp).toBeLessThan(after);
  });

  it('лёд гасит горение игрока', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    b.player.burningUntil = 5000;
    b.playerCast('ice', 0.9, 1, 1);
    expect(b.player.burningUntil).toBe(0);
  });

  it('ветер сдувает вражеские снаряды в полёте и слабеет', () => {
    const b = new Battle(LEVEL_BY_ID[7], loadout, seeded());
    b.enemyCast('fireball');
    b.enemyCast('lightning');
    step(b, 50);
    const blown: number[] = [];
    b.on((e) => e.type === 'blownAway' && blown.push(e.count));
    b.playerCast('wind', 0.9, 1, 1);
    expect(blown).toEqual([2]);
    expect(b.projectiles.filter((p) => p.to === 'player')).toHaveLength(0);
    step(b, 1000);
    expect(b.player.hp).toBe(100);
  });

  it('лёд → молния в окне = «Шторм» с бонусом', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    const combos: string[] = [];
    b.on((e) => e.type === 'comboCast' && combos.push(e.name));
    b.playerCast('lightning', 0.85, 1, 1);
    const plain = b.projectiles.at(-1)!.damage;
    fresh(b);
    b.playerCast('ice', 0.85, 1, 1);
    step(b, 300);
    fresh(b);
    b.playerCast('lightning', 0.85, 1, 1);
    expect(combos).toEqual(['Шторм']);
    expect(b.projectiles.at(-1)!.damage).toBeGreaterThan(plain);
  });
});

describe('жесты телом в бою', () => {
  it('уклонение перед попаданием — снаряд мимо; сразу повторить нельзя', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    b.enemyCast('fireball');
    step(b, 500);
    expect(b.dodge()).toBe(true);
    step(b, 300);
    expect(b.player.hp).toBe(100);
    expect(b.dodge()).toBe(false);
  });

  it('супер-щит изнашивается вдвое меньше и отражает часть урона', () => {
    const plain = new Battle(LEVEL_BY_ID[6], loadout, seeded());
    plain.setPlayerHolds(true, false);
    step(plain, 600); // щит заранее — не парирование
    plain.enemyCast('lightning');
    step(plain, 300);
    const sup = new Battle(LEVEL_BY_ID[6], loadout, seeded());
    sup.setPlayerHolds(false, false, true);
    step(sup, 600);
    const enemyHp = sup.enemy.hp;
    sup.enemyCast('lightning');
    step(sup, 300);
    expect(sup.player.shield.durability).toBeGreaterThan(plain.player.shield.durability);
    expect(sup.enemy.hp).toBeLessThan(enemyHp);
  });

  it('медитация даёт ману раз в 20 с', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    b.player.mana = 10;
    expect(b.meditate()).toBe(true);
    expect(b.player.mana).toBe(50);
    expect(b.meditate()).toBe(false);
  });
});

describe('бот уклоняется', () => {
  it('на поздних уровнях бот может уклониться от огненного шара, но не от молнии', () => {
    const always = () => 0; // rng = 0 → шанс всегда срабатывает
    const b = new Battle(LEVEL_BY_ID[10], loadout, always);
    const ev: string[] = [];
    b.on((e) => e.type === 'enemyDodged' && ev.push(e.spell));
    b.playerCast('fireball', 0.9, 1, 1);
    step(b, 700);
    expect(ev).toEqual(['fireball']);
    expect(b.enemy.hp).toBe(b.enemy.maxHp);
    b.player.mana = 100;
    b.playerCast('lightning', 0.9, 1, 1);
    step(b, 200);
    expect(b.enemy.hp).toBeLessThan(b.enemy.maxHp);
  });
});
