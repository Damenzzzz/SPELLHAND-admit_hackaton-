import { describe, expect, it } from 'vitest';
import { Battle, type BattleEvent } from './combat';
import { COMBO_BY_ID, COMBO_CONFIG } from './data/combos';
import { SHIELDS, STAFFS } from './data/items';
import { LEVEL_BY_ID } from './data/levels';
import { SPELLS } from './data/spells';

const loadout = { staff: STAFFS[0], shield: SHIELDS[0] };
/** Манекен: много HP, не уклоняется, не ставит щит (rng 0.99), бот выключен. */
const DUMMY = { ...LEVEL_BY_ID[1], hp: 5000 };

function setup(opts: { remote?: boolean; staff?: (typeof STAFFS)[number] } = {}) {
  const b = new Battle(DUMMY, { ...loadout, staff: opts.staff ?? loadout.staff }, () => 0.99, opts.remote ?? false);
  b.botEnabled = false;
  const events: BattleEvent[] = [];
  b.on((e) => events.push(e));
  const combos = () => events.filter((e) => e.type === 'comboCast').map((e) => (e.type === 'comboCast' ? e.id : ''));
  const of = <T extends BattleEvent['type']>(type: T) => events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
  return { b, events, combos, of };
}
const step = (b: Battle, ms: number) => {
  for (let t = 0; t < ms; t += 10) b.tick(10, false);
};
const refill = (b: Battle) => {
  b.player.mana = b.player.maxMana;
};
const cast = (b: Battle, spell: 'fireball' | 'ice' | 'lightning' | 'wind', shard = 1) => {
  refill(b);
  if (shard === 1) b.combo = 0; // серия качества — отдельная механика, в сравнениях урона не участвует
  return b.playerCast(spell, 0.85, 1, shard);
};

describe('порядок и окно', () => {
  it('огонь → молния = «Плазма», обратный порядок — ничего', () => {
    const a = setup();
    cast(a.b, 'fireball');
    step(a.b, 500);
    cast(a.b, 'lightning');
    expect(a.combos()).toEqual(['plasma']);

    const r = setup();
    cast(r.b, 'lightning');
    step(r.b, 500);
    cast(r.b, 'fireball');
    expect(r.combos()).toEqual([]);
  });

  it(`граница окна ${COMBO_CONFIG.windowMs} мс: ровно на границе — да, позже — нет`, () => {
    const on = setup();
    cast(on.b, 'fireball');
    step(on.b, COMBO_CONFIG.windowMs);
    expect(on.b.t).toBe(COMBO_CONFIG.windowMs);
    cast(on.b, 'wind');
    expect(on.combos()).toEqual(['firestorm']);

    const off = setup();
    cast(off.b, 'fireball');
    step(off.b, COMBO_CONFIG.windowMs + 10);
    const plain = setup();
    cast(plain.b, 'wind');
    cast(off.b, 'wind');
    expect(off.combos()).toEqual([]);
    // по истечении окна заклинание работает как обычно
    expect(off.b.projectiles.at(-1)!.damage).toBe(plain.b.projectiles.at(-1)!.damage);
    expect(off.b.projectiles.at(-1)!.burn).toBe(false);
  });

  it('окно идёт по игровому времени: пауза (нет тиков) его не тратит', () => {
    const { b, combos } = setup();
    cast(b, 'fireball');
    step(b, 2000);
    // реального времени может пройти сколько угодно — бой стоит на паузе
    cast(b, 'lightning');
    expect(combos()).toEqual(['plasma']);
  });
});

describe('засчитываются только принятые касты', () => {
  it('нехватка маны и перезарядка не создают комбинацию и не сбивают пару', () => {
    const { b, combos, of } = setup();
    cast(b, 'fireball');
    step(b, 100);
    b.player.mana = 0;
    expect(b.playerCast('lightning', 0.85, 1, 1)).toBe(false);
    expect(of('reject').at(-1)?.kind).toBe('mana');
    // повтор огня на перезарядке (400 мс) отклонён — начало пары не переносится
    refill(b);
    expect(b.playerCast('fireball', 0.85, 1, 1)).toBe(false);
    expect(b.comboChain?.t).toBe(0);
    expect(combos()).toEqual([]);
    step(b, 500);
    cast(b, 'lightning');
    expect(combos()).toEqual(['plasma']);
  });

  it('запрещённое модификатором заклинание не завершает комбинацию; панель это показывает', () => {
    const { b, combos } = setup();
    b.applyModifiers({ allowed: ['fireball', 'ice', 'wind'], playerDmgMul: 1, noShield: false });
    cast(b, 'fireball');
    const hint = b.comboHint()!;
    expect(hint.options.find((o) => o.def.id === 'plasma')?.status).toBe('banned');
    expect(cast(b, 'lightning')).toBe(false);
    expect(combos()).toEqual([]);
  });

  it('качество жеста (серия) и комбинация стихий — разные механики', () => {
    const { b, combos } = setup();
    cast(b, 'fireball');
    b.breakCombo(); // осечка обрывает серию качества…
    expect(b.combo).toBe(0);
    step(b, 300);
    b.player.mana = 100;
    expect(b.playerCast('lightning', 0.5, 1, 1)).toBe(true); // …и «слабый» каст всё равно завершает пару
    expect(combos()).toEqual(['plasma']);
  });
});

describe('осколки льда — одно действие', () => {
  it('огонь → лёд: «Паровой взрыв» несёт только первый осколок, один раз', () => {
    const { b, combos } = setup();
    cast(b, 'fireball');
    step(b, 300);
    cast(b, 'ice', 1);
    step(b, 150);
    b.playerCast('ice', 0.85, 1, 2);
    step(b, 150);
    b.playerCast('ice', 0.85, 1, 3);
    expect(combos()).toEqual(['steam']);
    const shards = b.projectiles.filter((p) => p.spell === 'ice');
    expect(shards).toHaveLength(3);
    expect(shards.filter((p) => p.steam)).toHaveLength(1);
  });

  it('окно «Шторма» отсчитывается от первого осколка, осколки 2–3 его не продлевают', () => {
    const late = setup();
    cast(late.b, 'ice', 1);
    step(late.b, 300);
    late.b.playerCast('ice', 0.85, 1, 2);
    step(late.b, 300);
    late.b.playerCast('ice', 0.85, 1, 3);
    step(late.b, COMBO_CONFIG.windowMs - 600 + 50);
    cast(late.b, 'lightning');
    expect(late.combos()).toEqual([]);
  });
});

describe('расход пары и отдельные перезарядки', () => {
  it('одна атака завершает одну комбинацию: огонь → лёд → молния даёт только «Паровой взрыв»', () => {
    const { b, combos } = setup();
    cast(b, 'fireball');
    step(b, 300);
    cast(b, 'ice');
    step(b, 300);
    cast(b, 'lightning');
    expect(combos()).toEqual(['steam']);
  });

  it('у каждой комбинации своя перезарядка; на перезарядке атака обычная', () => {
    const { b, combos } = setup();
    cast(b, 'fireball');
    step(b, 500);
    cast(b, 'lightning');
    expect(combos()).toEqual(['plasma']);
    const plasmaReady = b.comboReadyAt.plasma!;
    expect(plasmaReady - b.t).toBe(COMBO_BY_ID.plasma.cooldownMs);

    step(b, SPELLS.lightning.cooldownMs); // молния снова готова, «Плазма» — ещё нет
    cast(b, 'fireball');
    const hint = b.comboHint()!;
    expect(hint.options.find((o) => o.def.id === 'plasma')?.status).toBe('cooldown');
    expect(hint.options.find((o) => o.def.id === 'firestorm')?.status).toBe('ready');
    step(b, 300);
    cast(b, 'lightning');
    expect(combos()).toEqual(['plasma']); // вторая «Плазма» не сработала
    expect(b.projectiles.at(-1)!.pierce).toBe(SPELLS.lightning.shieldPierce);

    step(b, 500);
    cast(b, 'fireball');
    step(b, 300);
    cast(b, 'wind');
    expect(combos()).toEqual(['plasma', 'firestorm']); // другая комбинация доступна
  });
});

describe('«Паровой взрыв»', () => {
  /** Огонь попадает (цель горит), затем лёд в окне. */
  function steamOnBurning() {
    const s = setup();
    cast(s.b, 'fireball');
    step(s.b, SPELLS.fireball.travelMs + 20);
    expect(s.b.enemy.burningUntil).toBeGreaterThan(s.b.t);
    cast(s.b, 'ice');
    return s;
  }

  it('снимает горение, наносит разовый бонус и оглушает', () => {
    const { b, of } = steamOnBurning();
    const hpBefore = b.enemy.hp;
    step(b, SPELLS.ice.travelMs + 20);
    const eff = of('comboEffect');
    expect(eff).toHaveLength(1);
    expect(eff[0]).toMatchObject({ id: 'steam', by: 'player', bonus: COMBO_BY_ID.steam.steam!.bonusDamage });
    expect(b.enemy.burningUntil).toBe(0);
    expect(b.enemy.stunnedUntil).toBeGreaterThan(b.t);
    const iceHit = of('hit').filter((h) => h.spell === 'ice').at(-1)!;
    const plain = setup();
    cast(plain.b, 'ice');
    step(plain.b, SPELLS.ice.travelMs + 20);
    const plainHit = plain.of('hit').filter((h) => h.spell === 'ice')[0];
    expect(iceHit.hpDamage - plainHit.hpDamage).toBe(COMBO_BY_ID.steam.steam!.bonusDamage);
    expect(hpBefore - b.enemy.hp).toBeGreaterThanOrEqual(iceHit.hpDamage);
    // оглушение кончается по игровому времени
    step(b, COMBO_BY_ID.steam.steam!.stunMs);
    expect(b.enemy.stunnedUntil).toBeLessThanOrEqual(b.t);
  });

  it('оглушённый бот не колдует и теряет телеграф', () => {
    const b = new Battle({ ...LEVEL_BY_ID[4], hp: 5000 }, loadout, () => 0.99);
    const types: string[] = [];
    b.on((e) => types.push(e.type));
    for (let i = 0; i < 400 && !b.bot.telegraph; i++) b.tick(10, false);
    expect(b.bot.telegraph).not.toBeNull();
    b.stun('enemy', 1200);
    expect(b.bot.telegraph).toBeNull();
    const casts = types.filter((t) => t === 'telegraph').length;
    step(b, 1100);
    expect(types.filter((t) => t === 'telegraph').length).toBe(casts);
  });

  it('если цель не горит — обычный лёд, без бонуса и без сообщения об успехе', () => {
    const { b, of } = setup();
    cast(b, 'fireball');
    b.setShield('enemy', true); // шар гасит щит — поджога нет
    b.bot['shieldUntil'] = Infinity;
    step(b, SPELLS.fireball.travelMs + 20);
    b.setShield('enemy', false);
    expect(b.enemy.burningUntil).toBe(0);
    expect(b.comboHint()!.options.find((o) => o.def.id === 'steam')?.status).toBe('noTarget');
    cast(b, 'ice');
    expect(of('comboCast')[0]).toMatchObject({ id: 'steam', conditional: true });
    step(b, SPELLS.ice.travelMs + 20);
    expect(of('comboEffect')).toEqual([]);
    expect(of('comboFizzle')).toEqual([expect.objectContaining({ id: 'steam', reason: 'notBurning' })]);
    expect(b.enemy.stunnedUntil).toBe(0);
  });

  it('лёд в щит: эффекта нет, горение остаётся', () => {
    const { b, of } = steamOnBurning();
    b.setShield('enemy', true);
    b.bot['shieldUntil'] = Infinity;
    step(b, SPELLS.ice.travelMs + 20);
    expect(of('comboFizzle')[0]).toMatchObject({ reason: 'blocked' });
    expect(b.enemy.burningUntil).toBeGreaterThan(b.t);
  });

  it('шар и лёд в одном кадре: по порядку выпуска — сначала поджог, потом пар', () => {
    const { b, of } = setup();
    cast(b, 'fireball');
    step(b, SPELLS.fireball.travelMs - SPELLS.ice.travelMs);
    cast(b, 'ice');
    const [fire, ice] = b.projectiles.filter((p) => p.to === 'enemy');
    expect(Math.abs(fire.hitT - ice.hitT)).toBeLessThan(10);
    step(b, SPELLS.ice.travelMs + 20);
    expect(of('comboEffect')).toHaveLength(1);
  });
});

describe('«Плазма»', () => {
  it('пробитие и урон повышены только у этой атаки', () => {
    const { b } = setup();
    cast(b, 'fireball');
    step(b, 300);
    cast(b, 'lightning');
    const plasma = b.projectiles.at(-1)!;
    expect(plasma.pierce).toBeCloseTo(SPELLS.lightning.shieldPierce + COMBO_BY_ID.plasma.pierceBonus!);
    step(b, SPELLS.lightning.cooldownMs + 100);
    b.comboChain = null;
    cast(b, 'lightning');
    expect(b.projectiles.at(-1)!.pierce).toBe(SPELLS.lightning.shieldPierce);
    expect(plasma.damage - b.projectiles.at(-1)!.damage).toBeGreaterThanOrEqual(COMBO_BY_ID.plasma.bonusDamage);
  });

  it('с громовым посохом пробитие не превышает 100%', () => {
    const staff = { ...STAFFS.find((s) => s.id === 'staff_thunder')!, lightningPierce: 0.9 };
    const { b } = setup({ staff });
    cast(b, 'fireball');
    step(b, 300);
    cast(b, 'lightning');
    expect(b.projectiles.at(-1)!.pierce).toBe(1);
  });
});

describe('PvP: эффекты передаются один раз', () => {
  const msg = (over: object = {}) => ({
    spell: 'ice' as const, damage: 10, quality: 0.9, pierce: 0, shieldDamage: null, slowFactor: null, slowMs: null,
    interrupt: false, travelMs: 400, cid: 7, burn: false, combo: 'steam' as const, steam: { bonusDamage: 18, stunMs: 1200 }, ...over,
  });

  it('повтор сообщения не применяется дважды', () => {
    const { b } = setup({ remote: true });
    expect(b.remoteCast(msg({ combo: null, steam: null }))).toBe(true);
    expect(b.remoteCast(msg({ combo: null, steam: null }))).toBe(false);
    step(b, 500);
    expect(b.player.hp).toBe(100 - 10);
  });

  it('получатель применяет «Паровой взрыв» к себе по своему горению и сообщает результат один раз', () => {
    const { b, of } = setup({ remote: true });
    b.player.burningUntil = 5000;
    b.remoteCast(msg());
    b.remoteCast(msg()); // дубликат
    step(b, 500);
    expect(of('comboEffect')).toEqual([expect.objectContaining({ id: 'steam', by: 'enemy', netId: 7 })]);
    expect(b.player.burningUntil).toBe(0);
    // урон попадания = урон снаряда (бонус комбинаций уже в нём) + бонус пара; повтор не добавил второго
    expect(of('hit').filter((h) => h.target === 'player').map((h) => h.hpDamage)).toEqual([10 + 18]);
    // оглушённый игрок не атакует
    expect(cast(b, 'fireball')).toBe(false);
    step(b, 1300);
    expect(cast(b, 'fireball')).toBe(true);
  });

  it('старый клиент без новых полей — каст как раньше', () => {
    const { b } = setup({ remote: true });
    const { cid: _c, burn: _b, combo: _o, steam: _s, ...old } = msg();
    expect(b.remoteCast(old)).toBe(true);
    expect(b.remoteCast(old)).toBe(true); // без cid дедупликации нет — как раньше
  });

  it('отправитель: эффект у себя не считает, ответ получателя принимает один раз', () => {
    const { b, of } = setup({ remote: true });
    cast(b, 'fireball');
    step(b, 300);
    cast(b, 'ice');
    const p = b.projectiles.at(-1)!;
    expect(p.steam).toBeDefined();
    step(b, 500);
    expect(of('comboEffect')).toEqual([]); // решает получатель
    b.remoteComboResult(p.netId!, true);
    b.remoteComboResult(p.netId!, true);
    b.remoteComboResult(999, true);
    expect(of('comboEffect')).toEqual([expect.objectContaining({ id: 'steam', by: 'player' })]);
  });

  it('парированный «Паровой взрыв» летит обратно обычным снарядом', () => {
    const { b, of } = setup({ remote: true });
    b.remoteCast(msg({ travelMs: 400 }));
    step(b, 250);
    b.setPlayerHolds(true, false);
    step(b, 300);
    expect(of('parry')).toHaveLength(1);
    const back = of('parry')[0].projectile;
    expect(back.steam).toBeUndefined();
    expect(back.netId).toBeUndefined();
  });
});

describe('обычные заклинания без комбинаций не изменились', () => {
  it('«Шторм» и «Огненный вихрь» сохраняют эффекты', () => {
    const s = setup();
    cast(s.b, 'ice');
    step(s.b, 300);
    cast(s.b, 'lightning');
    expect(s.combos()).toEqual(['storm']);
    expect(s.b.projectiles.at(-1)!.pierce).toBe(0.5);

    const f = setup();
    cast(f.b, 'fireball');
    step(f.b, 300);
    cast(f.b, 'wind');
    expect(f.combos()).toEqual(['firestorm']);
    expect(f.b.projectiles.at(-1)!.burn).toBe(true);
  });

  it('одиночные заклинания: без бонусов, пробитие по данным, огонь поджигает', () => {
    for (const spell of ['fireball', 'ice', 'lightning', 'wind'] as const) {
      const { b, combos } = setup();
      cast(b, spell);
      const p = b.projectiles[0];
      expect(combos()).toEqual([]);
      expect(p.combo).toBeUndefined();
      expect(p.steam).toBeUndefined();
      expect(p.pierce).toBe(SPELLS[spell].shieldPierce);
      expect(p.burn).toBe(spell === 'fireball');
    }
  });
});
