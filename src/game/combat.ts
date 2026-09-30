import type { GestureId, SpellId } from '../gestures/types';
import { BotAI } from './ai';
import type { LevelDef } from './data/levels';
import { COMBO_CONFIG, COMBOS, STATUS, type ComboDef, type ComboId } from './data/combos';
import { COMBO, gradeOf, type GradeId } from './data/grades';
import { COMBAT, RUNE_COMBAT, SPELLS } from './data/spells';
import { RUNES, type RuneId } from '../gestures/runes/runes';
import type { Loadout } from './economy';
import { TraitEngine } from './traits';
import { tr } from '../i18n';

export type Side = 'player' | 'enemy';

/** Жест распознан, но заклинание не готово: перезарядка / мана / заряд сбит. */
/**
 * Причина отказа движка: перезарядка / мана / заряд сбит / запрещено модификатором / оглушение /
 * щит сломан или недоступен. Жест при этом распознан — это не ошибка формы руки.
 */
export type RejectKind = 'cooldown' | 'mana' | 'interrupted' | 'banned' | 'stunned';

/** Почему заклинание сейчас не сработает (или null — готово). Один источник для каста и HUD. */
export interface CastBlock {
  kind: RejectKind;
  reason: string;
}

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
  /** Оглушение («Паровой взрыв»): не атакует до этого момента. */
  stunnedUntil: number;
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
  /** Особая атака противника: усиленная подготовкой или парируемый выпад дуэлянта. */
  tag?: 'channel' | 'duelist';
  /** Завершающая атака комбинации стихий. */
  combo?: ComboId;
  /** «Паровой взрыв»: эффект при попадании в горящую цель. */
  steam?: { bonusDamage: number; stunMs: number };
  /** PvP: id снаряда у отправителя — защита от повторного применения и ответ о результате. */
  netId?: number;
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
  /** Комбинация стихий засчитана при касте. conditional — эффект решится при попадании («Паровой взрыв»). */
  | { type: 'comboCast'; id: ComboId; name: string; bonus: number; conditional: boolean }
  /** Условный эффект комбинации сработал при попадании. by — чья атака. */
  | { type: 'comboEffect'; id: ComboId; by: Side; bonus: number; stunMs: number; netId?: number }
  /** Условие не выполнено: атака сработала как обычная. */
  | { type: 'comboFizzle'; id: ComboId; by: Side; reason: 'notBurning' | 'blocked' | 'dodged'; netId?: number }
  | { type: 'stunned'; side: Side; ms: number }
  | { type: 'burn'; side: Side; on: boolean }
  | { type: 'blownAway'; count: number }
  | { type: 'dodge' }
  | { type: 'enemyDodged'; spell: SpellId }
  | { type: 'dodged'; spell: SpellId }
  | { type: 'meditate'; mana: number }
  | { type: 'hit'; target: Side; spell: SpellId; hpDamage: number; shieldDamage: number; blocked: boolean }
  | { type: 'shieldUp' | 'shieldDown' | 'shieldBreak' | 'shieldRestored'; side: Side }
  | { type: 'heal'; side: Side; amount: number }
  | { type: 'telegraph'; spell: SpellId; ms: number }
  | { type: 'interrupt'; side: Side }
  | { type: 'reflect'; side: Side; amount: number }
  | { type: 'enrage' }
  // особые механики противников (src/game/traits.ts)
  | { type: 'channelStart'; ms: number }
  | { type: 'channelBroken'; stunMs: number }
  | { type: 'channelRelease' }
  | { type: 'armorBreak'; ms: number }
  | { type: 'armorRestored' }
  | { type: 'duelWindup'; ms: number }
  | { type: 'exposed'; ms: number }
  | { type: 'exposedEnd' }
  | { type: 'end'; winner: Side };

type Listener = (e: BattleEvent) => void;

export interface ComboOption {
  def: ComboDef;
  /** ready — можно; cooldown — перезарядка рецепта или заклинания; banned — запрещено модификатором; noTarget — цель не горит. */
  status: 'ready' | 'cooldown' | 'banned' | 'noTarget';
  cooldownMs: number;
}

export interface ComboHint {
  first: SpellId;
  leftMs: number;
  windowMs: number;
  options: ComboOption[];
}

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
    stunnedUntil: 0,
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
  /** Особая механика противника уровня (не в PvP). */
  readonly trait: TraitEngine | null;

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
    this.trait = !remote && level.trait ? new TraitEngine(this, level.trait) : null;
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

  /** Испытание дня и мутаторы могут ограничить заклинания игрока. */
  allowedSpells: SpellId[] | null = null;
  /** Множитель урона игрока (мутатор «стеклянная пушка»). */
  playerDmgMul = 1;
  /** Мутатор «без щита»: игрок не может поднять щит. */
  shieldLocked = false;
  /** Бот атакует сам. Обучение выключает его и управляет снарядами врага вручную. */
  botEnabled = true;

  /** Применяет сводный эффект модификаторов (уровень врага уже изменён при создании). */
  applyModifiers(m: { allowed: SpellId[] | null; playerDmgMul: number; noShield: boolean }) {
    this.allowedSpells = m.allowed;
    this.playerDmgMul = m.playerDmgMul;
    this.shieldLocked = m.noShield;
  }

  /** Серия удачных кастов подряд (обрывается «слабым» кастом или ошибкой жеста). */
  combo = 0;

  /** Итоговый урон: база × (0.6 + 0.4·качество) × оценка × комбо × посох. */
  private playerDamage(spell: SpellId, quality: number, charge: number) {
    const def = SPELLS[spell];
    const base = def.damage[0] + (def.damage[1] - def.damage[0]) * charge;
    const staff = this.loadout.staff;
    const mul = (staff.spellMul?.[spell] ?? 1) * (staff.allMul ?? 1);
    const combo = 1 + COMBO.stepBonus * Math.min(this.combo, COMBO.maxSteps);
    return Math.round(base * (COMBAT.qualityBase + COMBAT.qualityK * quality) * gradeOf(quality).mul * combo * mul * this.playerDmgMul);
  }

  // жесты телом
  private dodgeUntil = -Infinity;
  private dodgeReadyAt = 0;
  private meditateReadyAt = 0;
  /** Скрещённые руки держатся — щит становится супер-щитом. */
  superShield = false;

  /** Наклон корпуса: короткая неуязвимость к снарядам. */
  dodge(): boolean {
    if (this.over) return false;
    if (this.t < this.dodgeReadyAt) {
      const s = ((this.dodgeReadyAt - this.t) / 1000).toFixed(1);
      const reason = tr(`перезарядка ${s} с`, `cooldown ${s} s`);
      this.emit({ type: 'reject', name: tr('Уклонение', 'Dodge'), kind: 'cooldown', reason });
      return false;
    }
    this.dodgeUntil = this.t + COMBAT.dodgeIframesMs;
    this.dodgeReadyAt = this.t + COMBAT.dodgeCooldownMs;
    this.emit({ type: 'dodge' });
    return true;
  }

  /** Руки вверх: восстановление маны. */
  meditate(): boolean {
    if (this.over) return false;
    if (this.t < this.meditateReadyAt) {
      const s = Math.ceil((this.meditateReadyAt - this.t) / 1000);
      const reason = tr(`перезарядка ${s} с`, `cooldown ${s} s`);
      this.emit({ type: 'reject', name: tr('Медитация', 'Meditation'), kind: 'cooldown', reason });
      return false;
    }
    const before = this.player.mana;
    this.player.mana = Math.min(this.player.maxMana, this.player.mana + COMBAT.meditateMana);
    this.meditateReadyAt = this.t + COMBAT.meditateCooldownMs;
    this.emit({ type: 'meditate', mana: Math.round(this.player.mana - before) });
    return true;
  }

  /** Комбинации стихий: первое заклинание пары (принятое движком) и перезарядки рецептов. */
  comboChain: { spell: SpellId; t: number } | null = null;
  comboReadyAt: Partial<Record<ComboId, number>> = {};
  /** PvP: состояние горения соперника (из его state) — для подсказки «Парового взрыва». */
  remoteBurning = false;
  /** PvP: уже применённые входящие касты и ожидающие ответа «Паровые взрывы». */
  private seenCasts = new Set<number>();
  private sentSteam = new Map<number, ComboId>();

  /** Руны делят один кулдаун. */
  runeReadyAt = 0;

  /**
   * Руна-ультимейт, нарисованная в воздухе. score — точность росчерка ($P), влияет на силу,
   * как качество жеста на обычные заклинания.
   */
  playerRune(rune: RuneId, score: number): boolean {
    if (this.over) return false;
    const def = RUNES[rune];
    if (this.t < this.player.stunnedUntil) {
      this.emit({ type: 'reject', name: def.name, kind: 'stunned', reason: tr('Оглушён', 'Stunned') });
      return false;
    }
    if (this.t < this.runeReadyAt) {
      const s = ((this.runeReadyAt - this.t) / 1000).toFixed(1);
      const reason = tr(`Перезарядка рун ${s} с`, `Rune cooldown ${s} s`);
      this.emit({ type: 'reject', name: def.name, kind: 'cooldown', reason });
      return false;
    }
    const cost = RUNE_COMBAT.mana * (this.loadout.staff.manaMul ?? 1);
    if (this.player.mana < cost) {
      this.emit({ type: 'reject', name: def.name, kind: 'mana', reason: tr(`Нужно ${Math.round(cost)} маны`, `Need ${Math.round(cost)} mana`) });
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
        damage: Math.round(damage * power * this.playerDmgMul),
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
  /**
   * Почему атакующее заклинание сейчас не сработает. followUp — 2-й/3-й осколок льда (без маны
   * и перезарядки). Тот же порядок проверок, что и в playerCast: HUD показывает ровно то,
   * что скажет движок при касте.
   */
  castBlocker(spell: SpellId, followUp = false): CastBlock | null {
    if (this.allowedSpells && !this.allowedSpells.includes(spell)) {
      return { kind: 'banned', reason: tr('В этом бою заклинание запрещено', 'This spell is banned in this battle') };
    }
    if (this.t < this.player.stunnedUntil) {
      const s = ((this.player.stunnedUntil - this.t) / 1000).toFixed(1);
      return { kind: 'stunned', reason: tr(`Оглушён ${s} с`, `Stunned ${s} s`) };
    }
    if (followUp) return null;
    const readyAt = this.player.cooldowns[spell] ?? 0;
    if (this.t < readyAt) {
      const s = ((readyAt - this.t) / 1000).toFixed(1);
      return { kind: 'cooldown', reason: tr(`Перезарядка ${s} с`, `Cooldown ${s} s`) };
    }
    if (spell === 'fireball' && this.t < this.player.interruptedUntil) {
      return { kind: 'interrupted', reason: tr('Заряд сбит ветром!', 'Charge knocked out by wind!') };
    }
    if (this.player.mana < SPELLS[spell].mana * (this.loadout.staff.manaMul ?? 1)) {
      return { kind: 'mana', reason: tr('Мало маны', 'Not enough mana') };
    }
    return null;
  }

  /** Сколько осколков льда ещё можно выпустить в открытой серии (без маны и перезарядки). */
  iceShardsLeft(): number {
    if (this.t > this.iceSeries.until) return 0;
    return Math.max(0, (SPELLS.ice.hits ?? 1) - this.iceSeries.shots);
  }

  /** Удерживаемые позы: почему щит или лечение сейчас не держатся (null — работает/готово). */
  holdBlocker(g: 'shield' | 'heal'): CastBlock | null {
    const p = this.player;
    if (g === 'shield') {
      if (this.shieldLocked) return { kind: 'banned', reason: tr('В этом бою без щита', 'No shield in this battle') };
      if (p.shield.brokenUntil) {
        const s = ((p.shield.brokenUntil - this.t) / 1000).toFixed(1);
        return { kind: 'cooldown', reason: tr(`Щит сломан · ${s} с`, `Shield broken · ${s} s`) };
      }
      if (p.healing) return { kind: 'interrupted', reason: tr('Во время лечения щит недоступен', 'No shield while healing') };
      return null;
    }
    if (p.healing) return null; // лечение уже идёт
    const readyAt = p.cooldowns.heal ?? 0;
    if (this.t < readyAt) {
      const s = ((readyAt - this.t) / 1000).toFixed(1);
      return { kind: 'cooldown', reason: tr(`Перезарядка ${s} с`, `Cooldown ${s} s`) };
    }
    if (p.mana < SPELLS.heal.mana * (this.loadout.staff.manaMul ?? 1)) return { kind: 'mana', reason: tr('Мало маны', 'Not enough mana') };
    return null;
  }

  playerCast(spell: SpellId, quality: number, charge: number, shard: number): boolean {
    if (this.over || spell === 'heal') return false;
    const def = SPELLS[spell];
    const staff = this.loadout.staff;

    // 2-й и 3-й осколок льда — продолжение серии, без маны и кулдауна
    const iceFollowUp = spell === 'ice' && shard > 1;
    const block = this.castBlocker(spell, iceFollowUp);
    if (block) {
      this.emit({ type: 'reject', spell, name: def.name, kind: block.kind, reason: block.reason });
      return false;
    }
    if (iceFollowUp) {
      if (this.t > this.iceSeries.until || this.iceSeries.shots >= (def.hits ?? 1)) return false;
      this.iceSeries.shots++;
    } else {
      const cost = def.mana * (staff.manaMul ?? 1);
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

    // комбинация стихий: принятый каст `then` в окне после принятого `first`.
    // Осколки льда 2–3 — то же действие. Сработавшая пара расходуется: одна атака — одна комбинация.
    const combo = iceFollowUp ? undefined : this.takeCombo(spell);
    const bonus = combo?.bonusDamage ?? 0;
    const comboBurn = !!combo?.burn;
    if (combo?.pierce) pierce = Math.max(pierce, combo.pierce);
    if (combo?.pierceBonus) pierce = Math.min(1, pierce + combo.pierceBonus);
    if (combo) this.emit({ type: 'comboCast', id: combo.id, name: combo.name, bonus, conditional: !!combo.steam });

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
      combo: combo?.id,
      steam: combo?.steam,
    });
    projectile.netId = projectile.id;
    if (this.remote && combo?.steam) this.sentSteam.set(projectile.id, combo.id);
    this.emit({ type: 'cast', side: 'player', spell, quality, damage, projectile, grade, combo: this.combo });
    return true;
  }

  /** Рецепт для принятого каста `spell` (или null) и обновление пары. */
  private takeCombo(spell: SpellId): ComboDef | undefined {
    const ch = this.comboChain;
    const inWindow = !!ch && this.t - ch.t <= COMBO_CONFIG.windowMs;
    const combo = inWindow ? COMBOS.find((c) => c.first === ch!.spell && c.then === spell) : undefined;
    if (combo && this.t >= (this.comboReadyAt[combo.id] ?? 0)) {
      this.comboReadyAt[combo.id] = this.t + combo.cooldownMs;
      this.comboChain = null;
      return combo;
    }
    // окно истекло, рецепта нет или он на перезарядке — обычная атака, она же начало новой пары
    this.comboChain = { spell, t: this.t };
    return undefined;
  }

  /** Цель загорится или уже горит — для подсказки «Парового взрыва». */
  private targetBurns() {
    if (this.remote) return this.remoteBurning || this.projectiles.some((p) => p.to === 'enemy' && p.burn);
    return this.enemy.burningUntil > this.t || this.projectiles.some((p) => p.to === 'enemy' && p.burn);
  }

  /** Подсказка продолжения: доступные рецепты после первого заклинания пары и остаток окна. */
  comboHint(): ComboHint | null {
    const ch = this.comboChain;
    if (!ch || this.over) return null;
    const leftMs = COMBO_CONFIG.windowMs - (this.t - ch.t);
    if (leftMs < 0) return null;
    const options = COMBOS.filter((c) => c.first === ch.spell).map((def): ComboOption => {
      const cooldownMs = Math.max(0, Math.max(this.comboReadyAt[def.id] ?? 0, this.player.cooldowns[def.then] ?? 0) - this.t);
      const status: ComboOption['status'] =
        this.allowedSpells && !this.allowedSpells.includes(def.then)
          ? 'banned'
          : cooldownMs > 0
            ? 'cooldown'
            : def.steam && !this.targetBurns()
              ? 'noTarget'
              : 'ready';
      return { def, status, cooldownMs };
    });
    return options.length ? { first: ch.spell, leftMs, windowMs: COMBO_CONFIG.windowMs, options } : null;
  }

  /** Оглушение: бот теряет телеграф и ждёт, игрок не может атаковать. */
  stun(side: Side, ms: number) {
    const f = this.fighter(side);
    f.stunnedUntil = Math.max(f.stunnedUntil, this.t + ms);
    if (side === 'enemy' && !this.remote) this.bot.interrupt();
    this.emit({ type: 'stunned', side, ms });
  }

  /** PvP, отправитель: получатель сообщил, сработал ли «Паровой взрыв» (он авторитетен по своему HP). */
  remoteComboResult(netId: number, ok: boolean) {
    const id = this.sentSteam.get(netId);
    if (!id) return;
    this.sentSteam.delete(netId);
    const def = COMBOS.find((c) => c.id === id)!;
    if (ok) this.emit({ type: 'comboEffect', id, by: 'player', bonus: def.steam!.bonusDamage, stunMs: def.steam!.stunMs });
    else this.emit({ type: 'comboFizzle', id, by: 'player', reason: 'notBurning' });
  }

  /**
   * Каст врага (из BotAI). travelMs — своя скорость снаряда (медленный учебный выстрел),
   * powerMul и extra — особые атаки противников. Возвращает первый снаряд.
   */
  enemyCast(spell: SpellId, travelMs = SPELLS[spell].travelMs, powerMul = 1, extra: Partial<Projectile> = {}): Projectile | undefined {
    if (spell === 'ice' && this.enemy.burningUntil > this.t) {
      this.enemy.burningUntil = 0;
      this.emit({ type: 'burn', side: 'enemy', on: false });
    }
    const def = SPELLS[spell];
    const quality = 0.7 + 0.3 * this.rng();
    const charge = spell === 'fireball' ? 0.3 + 0.5 * this.rng() : 1;
    const base = def.damage[0] + (def.damage[1] - def.damage[0]) * charge;
    const damage = Math.round(base * this.level.dmgMul * (COMBAT.qualityBase + COMBAT.qualityK * quality) * powerMul);
    const shots = def.hits ?? 1;
    let first: Projectile | undefined;
    for (let i = 0; i < shots; i++) {
      const projectile = this.spawn({
        spell,
        from: 'enemy',
        to: 'player',
        damage,
        quality,
        spawnT: this.t + i * 220,
        hitT: this.t + i * 220 + travelMs,
        pierce: def.shieldPierce,
        shieldDamage: def.shieldDamage && Math.round(def.shieldDamage * this.level.dmgMul),
        slow: def.slow,
        interrupt: def.interrupt,
        ...extra,
      });
      if (i === 0) {
        first = projectile;
        this.emit({ type: 'cast', side: 'enemy', spell, quality, damage, projectile });
      }
    }
    return first;
  }

  /** Удерживаемые позы игрока: щит и лечение. */
  setPlayerHolds(shield: boolean, heal: boolean, superShield = false) {
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
        const s = ((readyAt - this.t) / 1000).toFixed(1);
        const reason = cooldown ? tr(`Перезарядка ${s} с`, `Cooldown ${s} s`) : tr('Мало маны', 'Not enough mana');
        this.emit({ type: 'reject', spell: 'heal', name: SPELLS.heal.name, kind: cooldown ? 'cooldown' : 'mana', reason });
      }
    }
    if (!heal) {
      p.healing = null;
      this.healRejected = false;
    }

    const canShield = (shield || superShield) && !this.shieldLocked && !p.healing && !p.shield.brokenUntil;
    this.superShield = superShield && canShield;
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

    this.trait?.beforeHits();
    const due = this.projectiles.filter((p) => p.hitT <= this.t);
    if (due.length) {
      this.projectiles = this.projectiles.filter((p) => p.hitT > this.t);
      due.forEach((p) => this.resolveHit(p));
    }

    if (!this.remote && this.botEnabled) {
      this.checkEnrage();
      // смерть в этом кадре ещё не объявлена (checkEnd ниже) — особая атака мёртвого не стреляет
      if (this.enemy.hp > 0 && this.player.hp > 0) this.trait?.afterHits(dt);
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

    // бот уклоняется от снарядов игрока (кроме мгновенной молнии и рун-тюрьмы);
    // сосредоточенный на подготовке, замахе или оглушённый противник не уклоняется
    if (
      p.to === 'enemy' &&
      !this.remote &&
      !p.freezeMs &&
      p.spell !== 'lightning' &&
      !this.trait?.holdsBot &&
      this.rng() < (this.level.dodgeChance ?? 0)
    ) {
      this.emit({ type: 'enemyDodged', spell: p.spell });
      if (p.steam && p.combo) this.emit({ type: 'comboFizzle', id: p.combo, by: p.from, reason: 'dodged', netId: p.netId });
      return;
    }

    // особая механика противника: снаряд дошёл до него — сорвать подготовку, растопить броню…
    const traitMul = p.to === 'enemy' && this.trait ? this.trait.onEnemyHit(p, blocked) : 1;

    // уклонение: снаряд пролетает мимо
    if (p.to === 'player' && this.t <= this.dodgeUntil) {
      this.emit({ type: 'dodged', spell: p.spell });
      if (p.steam && p.combo) this.emit({ type: 'comboFizzle', id: p.combo, by: p.from, reason: 'dodged', netId: p.netId });
      return;
    }

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
        // отражённый снаряд — обычный: без эффектов чужой комбинации и сетевого id
        const back = this.spawn({ ...p, from: 'player', to: 'enemy', spawnT: this.t, hitT: this.t + Math.max(150, p.hitT - p.spawnT), combo: undefined, steam: undefined, netId: undefined });
        if (p.steam && p.combo) this.emit({ type: 'comboFizzle', id: p.combo, by: p.from, reason: 'blocked', netId: p.netId });
        this.emit({ type: 'parry', side: 'player', leadMs: Math.round(lead), projectile: back });
        this.trait?.onParry(p);
        return;
      }
      if (lead <= COMBAT.parryHintMs) this.emit({ type: 'parryMiss', side: 'player', deltaMs: -Math.round(lead) });
    }

    if (blocked) {
      // контр-логика: щит гасит огонь и лёд, молния пробивает часть, ветер бьёт по щиту
      shieldDamage = p.shieldDamage ?? p.damage * (1 - p.pierce);
      hpDamage = p.shieldDamage ? 0 : p.damage * p.pierce;
      const superHit = p.to === 'player' && this.superShield;
      if (superHit) {
        // супер-щит (скрещённые руки): меньше износа и часть урона летит обратно
        const back = Math.round(shieldDamage * COMBAT.superShieldReflect);
        shieldDamage *= COMBAT.superShieldWear;
        this.enemy.hp = Math.max(0, this.enemy.hp - back);
        if (back > 0) this.emit({ type: 'reflect', side: 'enemy', amount: back });
      }
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

    // «Паровой взрыв»: решается при попадании. Снаряды кадра — по порядку выпуска, поэтому шар,
    // попавший в том же кадре раньше льда, уже поджёг цель. Щит гасит лёд — эффекта нет.
    if (p.steam && p.combo) {
      if (blocked) this.emit({ type: 'comboFizzle', id: p.combo, by: p.from, reason: 'blocked', netId: p.netId });
      else if (target.burningUntil > this.t) {
        target.burningUntil = 0;
        this.emit({ type: 'burn', side: p.to, on: false });
        hpDamage += p.steam.bonusDamage;
        this.stun(p.to, p.steam.stunMs);
        this.emit({ type: 'comboEffect', id: p.combo, by: p.from, bonus: p.steam.bonusDamage, stunMs: p.steam.stunMs, netId: p.netId });
      } else this.emit({ type: 'comboFizzle', id: p.combo, by: p.from, reason: 'notBurning', netId: p.netId });
    }

    hpDamage = Math.round(hpDamage * traitMul);
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
    /** Необязательные поля — совместимость со старыми клиентами. */
    cid?: number;
    burn?: boolean;
    combo?: ComboId | null;
    steam?: { bonusDamage: number; stunMs: number } | null;
  }): boolean {
    if (this.over) return false;
    // повтор того же сообщения не применяется дважды (урон уже включает бонус комбинации)
    if (c.cid !== undefined) {
      if (this.seenCasts.has(c.cid)) return false;
      this.seenCasts.add(c.cid);
    }
    if (c.spell === 'heal') {
      this.emit({ type: 'cast', side: 'enemy', spell: 'heal', quality: c.quality, damage: 0 });
      return true;
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
      burn: c.burn,
      combo: c.combo ?? undefined,
      steam: c.steam ?? undefined,
      netId: c.cid,
    });
    this.emit({ type: 'cast', side: 'enemy', spell: c.spell, quality: c.quality, damage: c.damage, projectile });
    return true;
  }

  /** PvP: состояние соперника (он авторитетен по своему HP). */
  applyRemoteState(s: { hp: number; maxHp: number; shieldUp: boolean; durability: number; shieldMax: number; burning?: boolean }) {
    const e = this.enemy;
    this.remoteBurning = !!s.burning;
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
