import type { GestureId, SpellId } from '../gestures/types';
import { BotAI } from './ai';
import type { LevelDef } from './data/levels';
import { COMBO_WINDOW_MS, COMBOS, STATUS } from './data/combos';
import { COMBO, gradeOf, type GradeId } from './data/grades';
import { COMBAT, RUNE_COMBAT, SPELLS } from './data/spells';
import { RUNES, type RuneId } from '../gestures/runes/runes';
import type { Loadout } from './economy';

export type Side = 'player' | 'enemy';

/** Жест распознан, но заклинание не готово: перезарядка / мана / заряд сбит. */
export type RejectKind = 'cooldown' | 'mana' | 'interrupted';

export interface ShieldState {
  up: boolean;
  durability: number;
  max: number;
  /** Время (часы боя), когда сломанный щит восстановится; 0 — не сломан. */
  brokenUntil: number;
  cooldownMs: number;
  reflect: number;
  /** Когда щит подняли в последний раз (часы боя) — для парирования. */
  upAt: number;
}

export interface Fighter {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shield: ShieldState;
  /** Время готовности спелла. */
  cooldowns: Partial<Record<SpellId, number>>;
  slowedUntil: number;
  slowFactor: number;
  healing: { until: number; perMs: number } | null;
  interruptedUntil: number;
  /** Заморожен (не может колдовать) до этого момента. */
  frozenUntil: number;
  /** Горение: до какого момента (огонь, снимается льдом или лечением). */
  burningUntil: number;
}

export interface Projectile {
  id: number;
  spell: SpellId;
  from: Side;
  to: Side;
  damage: number;
  quality: number;
  spawnT: number;
  hitT: number;
  pierce: number;
  shieldDamage?: number;
  slow?: { factor: number; ms: number };
  interrupt?: boolean;
  /** Большой снаряд (руна «Метеор») — для VFX. */
  big?: boolean;
  /** Поджигает цель при попадании (огонь, «Огненный вихрь»). */
  burn?: boolean;
  /** Заморозка цели (руна «Ледяная тюрьма»), действует сквозь щит. */
  freezeMs?: number;
}

export type BattleEvent =
  | {
      type: 'cast';
      side: Side;
      spell: SpellId;
      quality: number;
      damage: number;
      projectile?: Projectile;
      /** Оценка жеста и длина серии (только для игрока). */
      grade?: GradeId;
      combo?: number;
    }
  | { type: 'comboBreak'; combo: number }
  /** Отражение щитом в тайминг: leadMs — насколько раньше попадания поднят щит. */
  | { type: 'parry'; side: Side; leadMs: number; projectile: Projectile }
  /** Почти парирование: deltaMs < 0 — рано, > 0 — поздно. */
  | { type: 'parryMiss'; side: Side; deltaMs: number }
  | { type: 'reject'; name: string; spell?: GestureId; reason: string; kind: RejectKind }
  | { type: 'runeCast'; rune: RuneId; score: number; damage: number; projectile?: Projectile }
  | { type: 'frozen'; side: Side; ms: number }
  | { type: 'comboCast'; name: string; bonus: number }
  | { type: 'burn'; side: Side; on: boolean }
  | { type: 'blownAway'; count: number }
  | { type: 'hit'; target: Side; spell: SpellId; hpDamage: number; shieldDamage: number; blocked: boolean }
  | { type: 'shieldUp' | 'shieldDown' | 'shieldBreak' | 'shieldRestored'; side: Side }
  | { type: 'heal'; side: Side; amount: number }
  | { type: 'telegraph'; spell: SpellId; ms: number }
  | { type: 'interrupt'; side: Side }
  | { type: 'reflect'; side: Side; amount: number }
  | { type: 'enrage' }
  | { type: 'end'; winner: Side };

type Listener = (e: BattleEvent) => void;

function makeFighter(hp: number, shield: Omit<ShieldState, 'up' | 'brokenUntil' | 'durability' | 'upAt'>): Fighter {
  return {
    hp,
    maxHp: hp,
    mana: COMBAT.mana,
    maxMana: COMBAT.mana,
    shield: { ...shield, up: false, durability: shield.max, brokenUntil: 0, upAt: -Infinity },
    cooldowns: {},
    slowedUntil: 0,
    slowFactor: 0,
    healing: null,
    interruptedUntil: 0,
    frozenUntil: 0,
    burningUntil: 0,
  };
}

/** Состояние одного боя. Время — собственные «часы боя» в мс (t), тикаются из rAF. */
export class Battle {
  t = 0;
  player: Fighter;
  enemy: Fighter;
  projectiles: Projectile[] = [];
  over = false;
  winner: Side | null = null;
  enraged = false;
  readonly bot: BotAI;

  private nextId = 1;
  private listeners = new Set<Listener>();
  private iceSeries = { until: 0, shots: 0 };
  private healRejected = false;

  constructor(
    readonly level: LevelDef,
    readonly loadout: Loadout,
    readonly rng: () => number = Math.random,
    /** PvP: враг — живой игрок, его HP приходит по сети, бот выключен. */
    readonly remote = false,
  ) {
    this.player = makeFighter(COMBAT.hp, {
      max: loadout.shield.durability,
      cooldownMs: loadout.shield.brokenCooldownMs,
      reflect: loadout.shield.reflect,
    });
    this.enemy = makeFighter(level.hp, {
      max: 50 + 10 * level.id,
      cooldownMs: 6000,
      reflect: level.boss?.reflect ?? 0,
    });
    this.bot = new BotAI(this);
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: BattleEvent) {
    this.listeners.forEach((fn) => fn(e));
  }

  fighter(side: Side) {
    return side === 'player' ? this.player : this.enemy;
  }

  /** Итоговый урон игрока: база × качество жеста × посох. */
  private lastPlayerHitAt = -Infinity;

  /** Испытание дня может ограничить заклинания игрока. */
  allowedSpells: SpellId[] | null = null;

  /** Серия удачных кастов подряд (обрывается «слабым» кастом или ошибкой жеста). */
  combo = 0;

  /** Итоговый урон: база × (0.6 + 0.4·качество) × оценка × комбо × посох. */
  private playerDamage(spell: SpellId, quality: number, charge: number) {
    const def = SPELLS[spell];
    const base = def.damage[0] + (def.damage[1] - def.damage[0]) * charge;
    const staff = this.loadout.staff;
    const mul = (staff.spellMul?.[spell] ?? 1) * (staff.allMul ?? 1);
    const combo = 1 + COMBO.stepBonus * Math.min(this.combo, COMBO.maxSteps);
    return Math.round(base * (COMBAT.qualityBase + COMBAT.qualityK * quality) * gradeOf(quality).mul * combo * mul);
  }

  /** Последнее заклинание игрока — для комбо. */
  private lastCast: { spell: SpellId; t: number } | null = null;

  /** Руны делят один кулдаун. */
  runeReadyAt = 0;

  /**
   * Руна-ультимейт, нарисованная в воздухе. score — точность росчерка ($P), влияет на силу,
   * как качество жеста на обычные заклинания.
   */
  playerRune(rune: RuneId, score: number): boolean {
    if (this.over) return false;
    const def = RUNES[rune];
    if (this.t < this.runeReadyAt) {
      const reason = `Перезарядка рун ${((this.runeReadyAt - this.t) / 1000).toFixed(1)} с`;
      this.emit({ type: 'reject', name: def.name, kind: 'cooldown', reason });
      return false;
    }
    const cost = RUNE_COMBAT.mana * (this.loadout.staff.manaMul ?? 1);
    if (this.player.mana < cost) {
      this.emit({ type: 'reject', name: def.name, kind: 'mana', reason: `Нужно ${Math.round(cost)} маны` });
      return false;
    }
    this.player.mana -= cost;
    this.runeReadyAt = this.t + RUNE_COMBAT.cooldownMs;
    const power = COMBAT.qualityBase + COMBAT.qualityK * Math.min(1, score / 0.8);
    const shoot = (spell: SpellId, damage: number, travelMs: number, extra: Partial<Projectile> = {}) =>
      this.spawn({
        spell,
        from: 'player',
        to: 'enemy',
        damage: Math.round(damage * power),
        quality: score,
        spawnT: this.t,
        hitT: this.t + travelMs,
        pierce: 0,
        ...extra,
      });

    let projectile: Projectile | undefined;
    if (rune === 'meteor') projectile = shoot('fireball', RUNE_COMBAT.meteor, 900, { big: true });
    if (rune === 'chain') projectile = shoot('lightning', RUNE_COMBAT.chain, 120, { pierce: 1 });
    if (rune === 'prison') projectile = shoot('ice', 4, 450, { freezeMs: RUNE_COMBAT.prisonMs, big: true });
    if (rune === 'sphere') {
      const sh = this.player.shield;
      sh.brokenUntil = 0;
      sh.durability = sh.max;
      this.emit({ type: 'shieldRestored', side: 'player' });
    }
    if (rune === 'mend') {
      this.player.healing = { until: this.t + RUNE_COMBAT.mendMs, perMs: RUNE_COMBAT.mendHp / RUNE_COMBAT.mendMs };
    }
    this.emit({ type: 'runeCast', rune, score, damage: projectile?.damage ?? 0, projectile });
    return true;
  }

  /** Перезаряд огненного шара: взрыв в руке игрока. */
  backfire(damage: number) {
    if (this.over) return;
    this.player.hp = Math.max(0, this.player.hp - damage);
    this.lastPlayerHitAt = this.t;
    this.emit({ type: 'hit', target: 'player', spell: 'fireball', hpDamage: damage, shieldDamage: 0, blocked: false });
    this.breakCombo();
    this.checkEnd();
  }

  /** Near-miss или осечка жеста обрывают серию. */
  breakCombo() {
    if (this.combo > 0) this.emit({ type: 'comboBreak', combo: this.combo });
    this.combo = 0;
  }

  private spawn(p: Omit<Projectile, 'id'>): Projectile {
    const proj = { ...p, id: this.nextId++ };
    this.projectiles.push(proj);
    return proj;
  }

  /** Каст игрока по событию распознавателя. Возвращает false, если отклонён. */
  playerCast(spell: SpellId, quality: number, charge: number, shard: number): boolean {
    if (this.over || spell === 'heal') return false;
    if (this.allowedSpells && !this.allowedSpells.includes(spell)) {
      this.emit({ type: 'reject', spell, name: SPELLS[spell].name, kind: 'interrupted', reason: 'Сегодня это заклинание запрещено' });
      return false;
    }
    const def = SPELLS[spell];
    const staff = this.loadout.staff;

    // 2-й и 3-й осколок льда — продолжение серии, без маны и кулдауна
    const iceFollowUp = spell === 'ice' && shard > 1;
    if (iceFollowUp) {
      if (this.t > this.iceSeries.until || this.iceSeries.shots >= (def.hits ?? 1)) return false;
      this.iceSeries.shots++;
    } else {
      const readyAt = this.player.cooldowns[spell] ?? 0;
      if (this.t < readyAt) {
        this.emit({
          type: 'reject',
          spell,
          name: SPELLS[spell].name,
          kind: 'cooldown',
          reason: `Перезарядка ${((readyAt - this.t) / 1000).toFixed(1)} с`,
        });
        return false;
      }
      if (spell === 'fireball' && this.t < this.player.interruptedUntil) {
        this.emit({ type: 'reject', spell, name: SPELLS[spell].name, kind: 'interrupted', reason: 'Заряд сбит ветром!' });
        return false;
      }
      const cost = def.mana * (staff.manaMul ?? 1);
      if (this.player.mana < cost) {
        this.emit({ type: 'reject', spell, name: SPELLS[spell].name, kind: 'mana', reason: 'Мало маны' });
        return false;
      }
      this.player.mana -= cost;
      this.player.cooldowns[spell] = this.t + def.cooldownMs;
      if (spell === 'ice') this.iceSeries = { until: this.t + 2500, shots: 1 };
    }

    const damage = this.playerDamage(spell, quality, charge);
    const grade = gradeOf(quality).id;
    if (!iceFollowUp) {
      if (grade === 'weak') this.breakCombo();
      else this.combo++;
    }
    let pierce = spell === 'lightning' ? (staff.lightningPierce ?? def.shieldPierce) : def.shieldPierce;
    const slow = def.slow ? { ...def.slow, ms: def.slow.ms + (staff.slowBonusMs ?? 0) } : undefined;

    // комбо: второе заклинание связки в окне после первого
    let bonus = 0;
    let comboBurn = false;
    const combo = !iceFollowUp
      ? COMBOS.find((c) => c.then === spell && this.lastCast?.spell === c.first && this.t - this.lastCast.t <= COMBO_WINDOW_MS)
      : undefined;
    if (combo) {
      bonus = combo.bonusDamage;
      pierce = Math.max(pierce, combo.pierce ?? 0);
      comboBurn = !!combo.burn;
      this.emit({ type: 'comboCast', name: combo.name, bonus });
    }
    if (!iceFollowUp) this.lastCast = { spell, t: this.t };

    // ветер сдувает вражеские снаряды в полёте, теряя силу за каждый
    let windMul = 1;
    if (spell === 'wind') {
      const blown = this.projectiles.filter((p) => p.to === 'player' && p.spawnT <= this.t);
      if (blown.length) {
        this.projectiles = this.projectiles.filter((p) => !blown.includes(p));
        windMul = Math.max(0.2, 1 - STATUS.windAbsorbLoss * blown.length);
        this.emit({ type: 'blownAway', count: blown.length });
      }
    }

    // лёд гасит своё горение (лечение — в setPlayerHolds)
    if (spell === 'ice' && this.player.burningUntil > this.t) {
      this.player.burningUntil = 0;
      this.emit({ type: 'burn', side: 'player', on: false });
    }

    const projectile = this.spawn({
      spell,
      from: 'player',
      to: 'enemy',
      damage: Math.round((damage + bonus) * windMul),
      quality,
      spawnT: this.t,
      hitT: this.t + def.travelMs,
      pierce,
      shieldDamage: def.shieldDamage && Math.round(def.shieldDamage * (0.6 + 0.4 * quality) * windMul),
      slow,
      interrupt: def.interrupt,
      burn: spell === 'fireball' || comboBurn,
    });
    this.emit({ type: 'cast', side: 'player', spell, quality, damage, projectile, grade, combo: this.combo });
    return true;
  }

  /** Каст врага (из BotAI). */
  enemyCast(spell: SpellId) {
    if (spell === 'ice' && this.enemy.burningUntil > this.t) {
      this.enemy.burningUntil = 0;
      this.emit({ type: 'burn', side: 'enemy', on: false });
    }
    const def = SPELLS[spell];
    const quality = 0.7 + 0.3 * this.rng();
    const charge = spell === 'fireball' ? 0.3 + 0.5 * this.rng() : 1;
    const base = def.damage[0] + (def.damage[1] - def.damage[0]) * charge;
    const damage = Math.round(base * this.level.dmgMul * (COMBAT.qualityBase + COMBAT.qualityK * quality));
    const shots = def.hits ?? 1;
    for (let i = 0; i < shots; i++) {
      const projectile = this.spawn({
        spell,
        from: 'enemy',
        to: 'player',
        damage,
        quality,
        spawnT: this.t + i * 220,
        hitT: this.t + i * 220 + def.travelMs,
        pierce: def.shieldPierce,
        shieldDamage: def.shieldDamage && Math.round(def.shieldDamage * this.level.dmgMul),
        slow: def.slow,
        interrupt: def.interrupt,
      });
      if (i === 0) this.emit({ type: 'cast', side: 'enemy', spell, quality, damage, projectile });
    }
  }

  /** Удерживаемые позы игрока: щит и лечение. */
  setPlayerHolds(shield: boolean, heal: boolean) {
    if (this.over) return;
    const p = this.player;

    if (heal && !p.healing) {
      const def = SPELLS.heal;
      const cost = def.mana * (this.loadout.staff.manaMul ?? 1);
      const readyAt = p.cooldowns.heal ?? 0;
      if (this.t >= readyAt && p.mana >= cost) {
        p.mana -= cost;
        p.cooldowns.heal = this.t + def.cooldownMs;
        p.healing = { until: this.t + def.heal!.durationMs, perMs: def.heal!.amount / def.heal!.durationMs };
        if (p.burningUntil > this.t) {
          p.burningUntil = 0;
          this.emit({ type: 'burn', side: 'player', on: false });
        }
        this.healRejected = false;
        this.emit({ type: 'cast', side: 'player', spell: 'heal', quality: 1, damage: 0 });
      } else if (!this.healRejected) {
        this.healRejected = true;
        const cooldown = this.t < readyAt;
        const reason = cooldown ? `Перезарядка ${((readyAt - this.t) / 1000).toFixed(1)} с` : 'Мало маны';
        this.emit({ type: 'reject', spell: 'heal', name: SPELLS.heal.name, kind: cooldown ? 'cooldown' : 'mana', reason });
      }
    }
    if (!heal) {
      p.healing = null;
      this.healRejected = false;
    }

    const canShield = shield && !p.healing && !p.shield.brokenUntil;
    this.setShield('player', canShield);
  }

  setShield(side: Side, up: boolean) {
    const sh = this.fighter(side).shield;
    if (sh.up === up) return;
    sh.up = up;
    if (up) sh.upAt = this.t;
    this.emit({ type: up ? 'shieldUp' : 'shieldDown', side });
    // поднял щит сразу после попадания — «поздно на X мс»
    if (up && side === 'player' && this.t - this.lastPlayerHitAt <= COMBAT.parryWindowMs) {
      this.emit({ type: 'parryMiss', side, deltaMs: Math.round(this.t - this.lastPlayerHitAt) });
    }
  }

  tick(dt: number, playerCharging: boolean) {
    if (this.over) return;
    this.t += dt;
    const s = dt / 1000;

    for (const side of ['player', 'enemy'] as const) {
      const f = this.fighter(side);
      const slowed = this.t < f.slowedUntil;
      f.mana = Math.min(f.maxMana, f.mana + COMBAT.manaRegen * s * (slowed ? 1 - f.slowFactor : 1));

      if (f.burningUntil > this.t) {
        f.hp = Math.max(0, f.hp - STATUS.burnDps * s);
      } else if (f.burningUntil) {
        f.burningUntil = 0;
        this.emit({ type: 'burn', side, on: false });
      }

      if (f.healing) {
        const amount = Math.min(f.healing.perMs * dt, f.maxHp - f.hp);
        f.hp += amount;
        if (amount > 0) this.emit({ type: 'heal', side, amount });
        if (this.t >= f.healing.until) f.healing = null;
      }

      const sh = f.shield;
      if (sh.brokenUntil && this.t >= sh.brokenUntil) {
        sh.brokenUntil = 0;
        sh.durability = sh.max;
        this.emit({ type: 'shieldRestored', side });
      } else if (!sh.up && !sh.brokenUntil) {
        sh.durability = Math.min(sh.max, sh.durability + COMBAT.shieldRegen * s);
      }
    }

    const due = this.projectiles.filter((p) => p.hitT <= this.t);
    if (due.length) {
      this.projectiles = this.projectiles.filter((p) => p.hitT > this.t);
      due.forEach((p) => this.resolveHit(p));
    }

    if (!this.remote) {
      this.checkEnrage();
      this.bot.tick(playerCharging);
    }
    this.checkEnd();
  }

  private resolveHit(p: Projectile) {
    if (this.over) return;
    const target = this.fighter(p.to);
    const sh = target.shield;

    // PvP: попадание по сопернику считает его клиент — здесь только визуальная оценка
    if (this.remote && p.to === 'enemy') {
      const blocked = sh.up;
      const hpDamage = Math.round(blocked ? (p.shieldDamage ? 0 : p.damage * p.pierce) : p.damage);
      this.emit({ type: 'hit', target: 'enemy', spell: p.spell, hpDamage, shieldDamage: 0, blocked });
      return;
    }
    let hpDamage = 0;
    let shieldDamage = 0;
    const blocked = sh.up && !sh.brokenUntil;

    // ледяная тюрьма замораживает сквозь щит
    if (p.freezeMs) {
      target.frozenUntil = this.t + p.freezeMs;
      if (p.to === 'enemy') this.bot.interrupt();
      this.emit({ type: 'frozen', side: p.to, ms: p.freezeMs });
    }

    // парирование игрока: щит поднят в последний момент — снаряд летит обратно
    if (blocked && p.to === 'player') {
      const lead = this.t - sh.upAt;
      if (lead <= COMBAT.parryWindowMs) {
        const back = this.spawn({ ...p, from: 'player', to: 'enemy', spawnT: this.t, hitT: this.t + Math.max(150, p.hitT - p.spawnT) });
        this.emit({ type: 'parry', side: 'player', leadMs: Math.round(lead), projectile: back });
        return;
      }
      if (lead <= COMBAT.parryHintMs) this.emit({ type: 'parryMiss', side: 'player', deltaMs: -Math.round(lead) });
    }

    if (blocked) {
      // контр-логика: щит гасит огонь и лёд, молния пробивает часть, ветер бьёт по щиту
      shieldDamage = p.shieldDamage ?? p.damage * (1 - p.pierce);
      hpDamage = p.shieldDamage ? 0 : p.damage * p.pierce;
      sh.durability -= shieldDamage;
      if (sh.durability <= 0) {
        if (!p.shieldDamage) hpDamage += -sh.durability;
        sh.durability = 0;
        sh.up = false;
        sh.brokenUntil = this.t + sh.cooldownMs;
        this.emit({ type: 'shieldBreak', side: p.to });
      }
      if (sh.reflect > 0) {
        const amount = Math.round(shieldDamage * sh.reflect);
        const attacker = this.fighter(p.from);
        attacker.hp = Math.max(0, attacker.hp - amount);
        this.emit({ type: 'reflect', side: p.from, amount });
      }
    } else {
      hpDamage = p.damage;
      if (p.burn) {
        if (target.burningUntil <= this.t) this.emit({ type: 'burn', side: p.to, on: true });
        target.burningUntil = this.t + STATUS.burnMs;
      }
      if (p.slow) {
        target.slowedUntil = this.t + p.slow.ms;
        target.slowFactor = p.slow.factor;
      }
      if (p.interrupt) {
        target.interruptedUntil = this.t + 1000;
        if (p.to === 'enemy') this.bot.interrupt();
        this.emit({ type: 'interrupt', side: p.to });
      }
    }

    hpDamage = Math.round(hpDamage);
    target.hp = Math.max(0, target.hp - hpDamage);
    if (p.to === 'player' && hpDamage > 0) this.lastPlayerHitAt = this.t;
    this.emit({ type: 'hit', target: p.to, spell: p.spell, hpDamage, shieldDamage: Math.round(shieldDamage), blocked });
  }

  private checkEnrage() {
    const enrage = this.level.boss?.enrage;
    if (!enrage || this.enraged || this.enemy.hp > this.enemy.maxHp / 2 || this.enemy.hp <= 0) return;
    this.enraged = true;
    this.enemy.hp = Math.min(this.enemy.maxHp, this.enemy.hp + enrage.heal);
    this.bot.speedMul = enrage.speedMul;
    this.emit({ type: 'enrage' });
    this.emit({ type: 'heal', side: 'enemy', amount: enrage.heal });
  }

  /** PvP: каст соперника летит в меня и разрешается моим щитом. */
  remoteCast(c: {
    spell: SpellId;
    damage: number;
    quality: number;
    pierce: number;
    shieldDamage: number | null;
    slowFactor: number | null;
    slowMs: number | null;
    interrupt: boolean;
    travelMs: number;
  }) {
    if (this.over) return;
    if (c.spell === 'heal') {
      this.emit({ type: 'cast', side: 'enemy', spell: 'heal', quality: c.quality, damage: 0 });
      return;
    }
    const projectile = this.spawn({
      spell: c.spell,
      from: 'enemy',
      to: 'player',
      damage: c.damage,
      quality: c.quality,
      spawnT: this.t,
      hitT: this.t + c.travelMs,
      pierce: c.pierce,
      shieldDamage: c.shieldDamage ?? undefined,
      slow: c.slowFactor && c.slowMs ? { factor: c.slowFactor, ms: c.slowMs } : undefined,
      interrupt: c.interrupt,
    });
    this.emit({ type: 'cast', side: 'enemy', spell: c.spell, quality: c.quality, damage: c.damage, projectile });
  }

  /** PvP: состояние соперника (он авторитетен по своему HP). */
  applyRemoteState(s: { hp: number; maxHp: number; shieldUp: boolean; durability: number; shieldMax: number }) {
    const e = this.enemy;
    e.maxHp = s.maxHp;
    e.hp = s.hp;
    e.shield.max = s.shieldMax;
    e.shield.durability = s.durability;
    if (e.shield.up !== s.shieldUp) this.setShield('enemy', s.shieldUp);
  }

  /** Завершение по сигналу извне (соперник проиграл или вышел). */
  forceEnd(winner: Side) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.projectiles = [];
    this.emit({ type: 'end', winner });
  }

  private checkEnd() {
    const enemyDown = !this.remote && this.enemy.hp <= 0;
    if (this.player.hp <= 0 || enemyDown) {
      this.over = true;
      this.winner = enemyDown ? 'player' : 'enemy';
      this.projectiles = [];
      this.emit({ type: 'end', winner: this.winner });
    }
  }
}
