import { describe, expect, it } from 'vitest';
import { Battle, type BattleEvent } from './combat';
import { dailyChallenge } from './data/daily';
import { GHOST_LEVEL, LEVEL_BY_ID, LEVELS, type LevelDef } from './data/levels';
import { SHIELDS, STAFFS } from './data/items';
import { survivalLevel } from './data/survival';
import type { EnemyTrait } from './data/traits';

const loadout = { staff: STAFFS[0], shield: SHIELDS[0] };
/** rng 0.99: бот не уклоняется и не ставит щиты — результат детерминирован. */
const noLuck = () => 0.99;

function setup(level: LevelDef) {
  const b = new Battle(level, loadout, noLuck);
  const events: BattleEvent[] = [];
  b.on((e) => events.push(e));
  return { b, events, types: () => events.map((e) => e.type) };
}

function step(b: Battle, ms: number, until?: () => boolean) {
  for (let t = 0; t < ms; t += 10) {
    b.tick(10, false);
    if (until?.()) return;
  }
}

const trait = <K extends EnemyTrait['kind']>(l: LevelDef, kind: K) => {
  expect(l.trait?.kind).toBe(kind);
  return l.trait as Extract<EnemyTrait, { kind: K }>;
};

/** Урон по врагу от молнии игрока (мгновенная, щит врага не мешает при noLuck). */
function lightningDamage(b: Battle) {
  b.player.mana = b.player.maxMana;
  b.player.cooldowns = {};
  b.combo = 0; // бонус серии удачных кастов не должен влиять на сравнение
  b.comboChain = null; // и незавершённая пара стихий (огонь → молния = «Плазма»)
  b.enemy.burningUntil = 0;
  const before = b.enemy.hp;
  expect(b.playerCast('lightning', 1, 1, 1)).toBe(true);
  step(b, 200);
  return before - b.enemy.hp;
}

describe('маг с прерываемой атакой (ур. 6)', () => {
  const L = LEVEL_BY_ID[6];
  const T = trait(L, 'channeler');

  it('подготовка начинается по игровому времени и держит обычного бота', () => {
    const { b, types } = setup(L);
    step(b, T.firstMs - 20);
    expect(b.trait!.channel).toBeNull();
    step(b, 3000, () => !!b.trait!.channel);
    expect(types()).toContain('channelStart');
    const telegraphs = types().filter((t) => t === 'telegraph').length;
    step(b, T.channelMs - 200);
    expect(types().filter((t) => t === 'telegraph').length).toBe(telegraphs);
    expect(b.bot.state).toBe('idle');
  });

  it('без прерывания — усиленная атака по окончании подготовки', () => {
    const { b, events } = setup(L);
    step(b, T.firstMs + T.channelMs + 3000, () => events.some((e) => e.type === 'channelRelease'));
    const cast = events.find((e) => e.type === 'cast' && e.side === 'enemy' && e.projectile?.tag === 'channel');
    expect(cast).toBeDefined();
    if (cast?.type !== 'cast') throw new Error();
    expect(cast.spell).toBe(T.spell);
    // обычная молния врага: 28 × dmgMul × (0.6 + 0.4·q), q ≤ 1
    expect(cast.damage).toBeGreaterThan(Math.round(28 * L.dmgMul) * 1.3);
    expect(b.trait!.channel).toBeNull();
  });

  it('ветер во время подготовки срывает её и оглушает; отменённая атака не происходит позже', () => {
    const { b, events, types } = setup(L);
    step(b, T.firstMs + 3000, () => !!b.trait!.channel);
    const end = b.trait!.channel!.end;
    expect(b.playerCast('wind', 1, 1, 1)).toBe(true);
    step(b, 600, () => types().includes('channelBroken'));
    expect(b.trait!.channel).toBeNull();
    expect(b.trait!.stunned).toBe(true);
    expect(b.trait!.holdsBot).toBe(true);
    // дожидаемся бывшего конца подготовки и дальше — усиленного удара нет
    step(b, end - b.t + 3000);
    expect(types()).not.toContain('channelRelease');
    expect(events.some((e) => e.type === 'cast' && e.projectile?.tag === 'channel')).toBe(false);
    // оглушение закончилось по игровому времени, бот снова колдует
    expect(b.trait!.stunned).toBe(false);
    step(b, 4000);
    expect(types()).toContain('telegraph');
  });

  it('во время подготовки маг не уклоняется от ветра (иначе контрприём зависел бы от удачи)', () => {
    const b = new Battle(L, loadout, () => 0.01); // rng 0.01 — обычно уклонился бы всегда
    const types: string[] = [];
    b.on((e) => types.push(e.type));
    step(b, T.firstMs + 3000, () => !!b.trait!.channel);
    b.playerCast('wind', 1, 1, 1);
    step(b, 600);
    expect(types).not.toContain('enemyDodged');
    expect(types).toContain('channelBroken');
  });

  it('ветер вне фазы подготовки не срывает ничего', () => {
    const { b, types } = setup(L);
    // попадает до начала подготовки
    step(b, T.firstMs - 1000);
    b.playerCast('wind', 1, 1, 1);
    step(b, 600);
    expect(types()).not.toContain('channelBroken');
    // подготовка всё равно начнётся по расписанию
    step(b, 4000, () => !!b.trait!.channel);
    expect(b.trait!.channel).not.toBeNull();
    // ветер, долетевший уже после удара, тоже не срывает
    step(b, T.channelMs + 50, () => types().includes('channelRelease'));
    b.player.cooldowns = {};
    b.player.mana = 100;
    b.playerCast('wind', 1, 1, 1);
    step(b, 600);
    expect(types()).not.toContain('channelBroken');
  });

  it('комбо «Огненный вихрь» — тоже ветер и срывает подготовку', () => {
    const { b, types } = setup(L);
    step(b, T.firstMs + 3000, () => !!b.trait!.channel);
    b.playerCast('fireball', 1, 1, 1);
    b.playerCast('wind', 1, 1, 1);
    expect(types()).toContain('comboCast');
    step(b, 700, () => types().includes('channelBroken'));
    expect(types()).toContain('channelBroken');
  });

  it('заморозка сдвигает подготовку, а не отменяет и не ускоряет её', () => {
    const { b } = setup(L);
    step(b, T.firstMs + 3000, () => !!b.trait!.channel);
    const left = b.trait!.channel!.end - b.t;
    b.enemy.frozenUntil = b.t + 1000;
    step(b, 1000);
    expect(b.trait!.channel).not.toBeNull();
    expect(b.trait!.channel!.end - b.t).toBeGreaterThanOrEqual(left - 20);
  });

  it('смерть во время подготовки — удара нет', () => {
    const { b, types } = setup(L);
    step(b, T.firstMs + 3000, () => !!b.trait!.channel);
    b.enemy.hp = 1;
    b.playerCast('lightning', 1, 1, 1);
    step(b, T.channelMs + 500);
    expect(b.winner).toBe('player');
    expect(types()).not.toContain('channelRelease');
  });
});

describe('противник с ледяной бронёй (ур. 3)', () => {
  const L = LEVEL_BY_ID[3];
  const T = trait(L, 'iceArmor');
  const plain = () => setup({ ...L, hp: 1000, trait: undefined }).b;

  it('броня уменьшает урон, огонь растапливает её и бьёт в полную силу, затем броня возвращается', () => {
    // запас HP, чтобы серия попаданий не убила противника раньше проверок
    const { b, types } = setup({ ...L, hp: 1000 });
    const full = lightningDamage(plain());
    expect(b.trait!.armorUp).toBe(true);
    expect(lightningDamage(b)).toBe(Math.round(full * (1 - T.reduction)));

    // огненный шар: сначала растопить, потом полный урон
    const ref = plain();
    ref.playerCast('fireball', 1, 1, 1);
    step(ref, 660);
    const fireFull = ref.enemy.maxHp - ref.enemy.hp;
    b.combo = 0;
    b.player.mana = b.player.maxMana;
    const before = b.enemy.hp;
    b.playerCast('fireball', 1, 1, 1);
    step(b, 660);
    expect(types()).toContain('armorBreak');
    expect(before - b.enemy.hp).toBeCloseTo(fireFull, 5);
    expect(b.trait!.armorUp).toBe(false);
    expect(lightningDamage(b)).toBe(full);

    // восстановление по игровому времени
    step(b, T.meltMs, () => types().includes('armorRestored'));
    expect(b.trait!.armorUp).toBe(true);
    expect(lightningDamage(b)).toBe(Math.round(full * (1 - T.reduction)));
  });

  it('огненный шар в щит врага броню не растапливает', () => {
    const { b, types } = setup(L);
    b.playerCast('fireball', 1, 1, 1);
    b.setShield('enemy', true);
    b.bot['shieldUntil'] = Infinity; // щит врага держится весь полёт шара
    step(b, 700);
    expect(types()).toContain('hit');
    expect(types()).not.toContain('armorBreak');
    expect(b.trait!.armorUp).toBe(true);
  });

  it('порядок в кадре: сначала восстановление брони, затем огненное попадание снова растапливает её', () => {
    const { b, types } = setup(L);
    b.playerCast('fireball', 1, 1, 1);
    step(b, 700);
    b.player.cooldowns = {};
    b.playerCast('fireball', 1, 1, 1);
    const hitT = b.projectiles.at(-1)!.hitT;
    b.trait!.armorBackAt = hitT; // броня возвращается ровно в кадр попадания
    step(b, 800, () => b.t >= hitT);
    const tail = types().filter((t) => t === 'armorRestored' || t === 'armorBreak');
    expect(tail).toEqual(['armorBreak', 'armorRestored', 'armorBreak']);
    expect(b.trait!.armorUp).toBe(false);
    expect(b.trait!.armorBackAt).toBe(b.t + T.meltMs);
  });
});

describe('дуэлянт, уязвимый после парирования (ур. 7)', () => {
  const L = LEVEL_BY_ID[7];
  const T = trait(L, 'duelist');

  /** До выпада в полёте; возвращает время попадания. */
  function toStrike(b: Battle) {
    step(b, T.firstMs + T.windupMs + 3000, () => b.trait!.strikeHitT > 0);
    const p = b.projectiles.find((x) => x.tag === 'duelist')!;
    expect(p.hitT - p.spawnT).toBe(T.travelMs);
    expect(p.big).toBe(true);
    return p.hitT;
  }

  it('выпад предупреждается замахом', () => {
    const { b, types } = setup(L);
    step(b, T.firstMs + 3000, () => !!b.trait!.windup);
    expect(types()).toContain('duelWindup');
    expect(b.trait!.holdsBot).toBe(true);
  });

  it('парирование выпада открывает дуэлянта; уязвимость кончается по игровому времени', () => {
    const { b, types } = setup({ ...L, hp: 1000 });
    const base = lightningDamage(setup({ ...L, hp: 1000, trait: undefined }).b);
    const guarded = lightningDamage(b);
    expect(guarded).toBe(Math.round(base * T.guardMul));
    const hitT = toStrike(b);
    step(b, hitT - 150 - b.t); // щит в последние 150 мс — окно парирования (200 мс)
    b.setPlayerHolds(true, false);
    step(b, 300);
    b.setPlayerHolds(false, false);
    expect(types()).toContain('parry');
    expect(types()).toContain('exposed');
    expect(b.trait!.exposed).toBe(true);
    expect(lightningDamage(b)).toBe(Math.round(base * T.exposedMul));

    step(b, T.exposedMs, () => types().includes('exposedEnd'));
    expect(b.trait!.exposed).toBe(false);
    expect(lightningDamage(b)).toBe(guarded);
  });

  it('обычный блок выпада не открывает дуэлянта', () => {
    const { b, events, types } = setup(L);
    const hitT = toStrike(b);
    b.setPlayerHolds(true, false); // щит заранее — блок, но не парирование
    step(b, hitT - b.t + 100);
    expect(types()).not.toContain('parry');
    expect(types()).not.toContain('exposed');
    expect(events.some((e) => e.type === 'hit' && e.target === 'player' && e.blocked)).toBe(true);
  });

  it('парирование обычной атаки не открывает — только выпад', () => {
    const { b, types } = setup(L);
    b.enemyCast('fireball');
    const p = b.projectiles.at(-1)!;
    step(b, p.hitT - 150 - b.t);
    b.setPlayerHolds(true, false);
    step(b, 300);
    expect(types()).toContain('parry');
    expect(types()).not.toContain('exposed');
  });

  it('без парирования он в стойке: урон ниже обычного', () => {
    const plain = setup({ ...L, trait: undefined }).b;
    const { b } = setup(L);
    expect(lightningDamage(b)).toBe(Math.round(lightningDamage(plain) * T.guardMul));
  });
});

describe('изоляция: обычные уровни, PvP, испытание дня, выживание', () => {
  it('механики есть только у уровней 3, 6, 7; боссы сохранили свои особенности', () => {
    expect(LEVELS.filter((l) => l.trait).map((l) => l.id)).toEqual([3, 6, 7]);
    expect(LEVEL_BY_ID[5].boss?.reflect).toBe(0.2);
    expect(LEVEL_BY_ID[10].boss?.enrage).toBeDefined();
    expect(LEVEL_BY_ID[5].trait).toBeUndefined();
    expect(LEVEL_BY_ID[10].trait).toBeUndefined();
  });

  it('обычный уровень: без движка механик, бот колдует как раньше', () => {
    const { b, types } = setup(LEVEL_BY_ID[4]);
    expect(b.trait).toBeNull();
    step(b, 8000);
    expect(types()).toContain('telegraph');
    expect(types().some((t) => ['channelStart', 'armorBreak', 'duelWindup', 'exposed'].includes(t))).toBe(false);
  });

  it('PvP и Призрак: механик нет', () => {
    expect(new Battle(LEVEL_BY_ID[6], loadout, noLuck, true).trait).toBeNull();
    expect(GHOST_LEVEL.trait).toBeUndefined();
  });

  it('испытание дня механики не наследует, выживание — наследует', () => {
    for (let d = 1; d <= 28; d++) expect(dailyChallenge(`2026-10-${String(d).padStart(2, '0')}`).level.trait).toBeUndefined();
    expect(survivalLevel(3).trait?.kind).toBe('iceArmor');
    expect(survivalLevel(16).trait?.kind).toBe('channeler');
    expect(survivalLevel(17).trait?.kind).toBe('duelist');
    expect(survivalLevel(4).trait).toBeUndefined();
  });

  it('без тиков боя (пауза) таймеры механик стоят', () => {
    const { b } = setup(LEVEL_BY_ID[6]);
    step(b, 9000, () => !!b.trait!.channel);
    const ch = { ...b.trait!.channel! };
    // пауза: экран не вызывает tick — никакие реальные миллисекунды не тратят подготовку
    expect(b.trait!.channel).toEqual(ch);
    step(b, 10);
    expect(b.trait!.channel!.end).toBe(ch.end);
  });
});
