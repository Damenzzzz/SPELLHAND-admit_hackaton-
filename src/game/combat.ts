import type { GestureId, SpellId } from '../gestures/types';
import { BotAI } from './ai';
import type { LevelDef } from './data/levels';
import { COMBO, gradeOf, type GradeId } from './data/grades';
import { COMBAT, SPELLS } from './data/spells';
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
  | { type: 'reject'; spell: GestureId; reason: string; kind: RejectKind }
  | { type: 'hit'; target: Side; spell: SpellId; hpDamage: number; shieldDamage: number; blocked: boolean }
  | { type: 'shieldUp' | 'shieldDown' | 'shieldBreak' | 'shieldRestored'; side: Side }
  | { type: 'heal'; side: Side; amount: number }
  | { type: 'telegraph'; spell: SpellId; ms: number }
  | { type: 'interrupt'; side: Side }
  | { type: 'reflect'; side: Side; amount: number }
  | { type: 'enrage' }
  | { type: 'end'; winner: Side };

type Listener = (e: BattleEvent) => void;

function makeFighter(hp: number, shield: Omit<ShieldState, 'up' | 'brokenUntil' | 'durability'>): Fighter {
  return {
    hp,
    maxHp: hp,
    mana: COMBAT.mana,
    maxMana: COMBAT.mana,
    shield: { ...shield, up: false, durability: shield.max, brokenUntil: 0 },
    cooldowns: {},
    slowedUntil: 0,
    slowFactor: 0,
    healing: null,
    interruptedUntil: 0,
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
          kind: 'cooldown',
          reason: `Перезарядка ${((readyAt - this.t) / 1000).toFixed(1)} с`,
        });
        return false;
      }
      if (spell === 'fireball' && this.t < this.player.interruptedUntil) {
        this.emit({ type: 'reject', spell, kind: 'interrupted', reason: 'Заряд сбит ветром!' });
        return false;
      }
      const cost = def.mana * (staff.manaMul ?? 1);
      if (this.player.mana < cost) {
        this.emit({ type: 'reject', spell, kind: 'mana', reason: 'Мало маны' });
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
    const pierce = spell === 'lightning' ? (staff.lightningPierce ?? def.shieldPierce) : def.shieldPierce;
    const slow = def.slow ? { ...def.slow, ms: def.slow.ms + (staff.slowBonusMs ?? 0) } : undefined;
    const projectile = this.spawn({
      spell,
      from: 'player',
      to: 'enemy',
      damage,
      quality,
      spawnT: this.t,
      hitT: this.t + def.travelMs,
      pierce,
      shieldDamage: def.shieldDamage && Math.round(def.shieldDamage * (0.6 + 0.4 * quality)),
      slow,
      interrupt: def.interrupt,
    });
    this.emit({ type: 'cast', side: 'player', spell, quality, damage, projectile, grade, combo: this.combo });
    return true;
  }

  /** Каст врага (из BotAI). */
  enemyCast(spell: SpellId) {
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
        this.healRejected = false;
        this.emit({ type: 'cast', side: 'player', spell: 'heal', quality: 1, damage: 0 });
      } else if (!this.healRejected) {
        this.healRejected = true;
        const cooldown = this.t < readyAt;
        const reason = cooldown ? `Перезарядка ${((readyAt - this.t) / 1000).toFixed(1)} с` : 'Мало маны';
        this.emit({ type: 'reject', spell: 'heal', kind: cooldown ? 'cooldown' : 'mana', reason });
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
    this.emit({ type: up ? 'shieldUp' : 'shieldDown', side });
  }

  tick(dt: number, playerCharging: boolean) {
    if (this.over) return;
    this.t += dt;
    const s = dt / 1000;

    for (const side of ['player', 'enemy'] as const) {
      const f = this.fighter(side);
      const slowed = this.t < f.slowedUntil;
      f.mana = Math.min(f.maxMana, f.mana + COMBAT.manaRegen * s * (slowed ? 1 - f.slowFactor : 1));

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
