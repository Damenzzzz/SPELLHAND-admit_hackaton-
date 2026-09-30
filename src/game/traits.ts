import type { Battle, Projectile } from './combat';
import type { EnemyTrait } from './data/traits';

type Of<K extends EnemyTrait['kind']> = Extract<EnemyTrait, { kind: K }>;

/**
 * Особые механики противника в бою. Всё по часам боя (battle.t): пауза боя останавливает
 * и подготовки, и таймеры брони/уязвимости. Порядок в кадре (Battle.tick):
 *   1) beforeHits — восстановление брони и конец уязвимости;
 *   2) попадания снарядов — onEnemyHit / onParry;
 *   3) afterHits — старт/сдвиг/завершение подготовки и выпада, затем обычный бот.
 */
export class TraitEngine {
  /** Маг: идёт подготовка усиленной атаки. */
  channel: { start: number; end: number } | null = null;
  stunnedUntil = 0;
  /** Броня: поднята ли и когда восстановится. */
  armorUp = true;
  armorBackAt = 0;
  /** Дуэлянт: замах выпада, выпад в полёте (время попадания), уязвимость. */
  windup: { start: number; end: number } | null = null;
  strikeHitT = 0;
  exposedUntil = 0;

  private nextAt: number;

  constructor(
    private readonly b: Battle,
    readonly def: EnemyTrait,
  ) {
    this.nextAt = def.kind === 'iceArmor' ? Infinity : def.firstMs;
  }

  get stunned() {
    return this.b.t < this.stunnedUntil;
  }

  get exposed() {
    return this.b.t < this.exposedUntil;
  }

  /** Бот не колдует сам во время подготовки, замаха и оглушения. */
  get holdsBot() {
    return !!this.channel || !!this.windup || this.stunned;
  }

  /** Шаг 1: до попаданий кадра. Снаряд, попавший в кадр восстановления, уже встречает броню. */
  beforeHits() {
    const t = this.b.t;
    if (this.def.kind === 'iceArmor' && !this.armorUp && t >= this.armorBackAt) {
      this.armorUp = true;
      this.b.emit({ type: 'armorRestored' });
    }
    if (this.def.kind === 'duelist' && this.exposedUntil && t >= this.exposedUntil) {
      this.exposedUntil = 0;
      this.b.emit({ type: 'exposedEnd' });
    }
    if (this.strikeHitT && t > this.strikeHitT) this.strikeHitT = 0;
  }

  /** Шаг 3: расписание особых атак. Заморозка сдвигает подготовку, а не обнуляет её. */
  afterHits(dt: number) {
    const b = this.b;
    const t = b.t;
    // заморозка и оглушение «Паровым взрывом» сдвигают подготовку и замах
    const frozen = t < b.enemy.frozenUntil || t < b.enemy.stunnedUntil;
    const d = this.def;

    if (d.kind === 'channeler') {
      if (this.channel) {
        if (frozen) {
          this.channel.start += dt;
          this.channel.end += dt;
        } else if (t >= this.channel.end) this.release(d);
      } else if (!frozen && !this.stunned && t >= this.nextAt && b.bot.state === 'idle') {
        this.channel = { start: t, end: t + d.channelMs };
        b.emit({ type: 'channelStart', ms: d.channelMs });
      }
    }

    if (d.kind === 'duelist') {
      if (this.windup) {
        if (frozen) {
          this.windup.start += dt;
          this.windup.end += dt;
        } else if (t >= this.windup.end) this.strike(d);
      } else if (!frozen && t >= this.nextAt && b.bot.state === 'idle') {
        this.windup = { start: t, end: t + d.windupMs };
        b.emit({ type: 'duelWindup', ms: d.windupMs });
      }
    }
  }

  private release(d: Of<'channeler'>) {
    const b = this.b;
    this.channel = null;
    this.nextAt = b.t + d.everyMs;
    b.emit({ type: 'channelRelease' });
    b.enemyCast(d.spell, undefined, d.powerMul, { big: true, tag: 'channel' });
    b.bot.delay(1500);
  }

  private strike(d: Of<'duelist'>) {
    const b = this.b;
    this.windup = null;
    this.nextAt = b.t + d.everyMs;
    const p = b.enemyCast('fireball', d.travelMs, d.powerMul, { big: true, tag: 'duelist' });
    this.strikeHitT = p?.hitT ?? 0;
    b.bot.delay(d.travelMs + 800);
  }

  /**
   * Попадание снаряда игрока (враг не уклонился). Возвращает множитель урона по HP.
   * Лёд: огненный шар, дошедший до тела (не в щит), сначала растапливает броню и бьёт в полную силу.
   */
  onEnemyHit(p: Projectile, blocked: boolean): number {
    const b = this.b;
    const d = this.def;
    if (d.kind === 'channeler') {
      // ветер сбивает подготовку и сквозь щит — ветер и создан ломать щиты
      if (this.channel && p.spell === 'wind') {
        this.channel = null;
        this.stunnedUntil = b.t + d.stunMs;
        this.nextAt = b.t + d.everyMs;
        b.bot.interrupt();
        b.emit({ type: 'channelBroken', stunMs: d.stunMs });
      }
      return 1;
    }
    if (d.kind === 'iceArmor') {
      if (p.spell === 'fireball' && !blocked) {
        this.armorUp = false;
        this.armorBackAt = b.t + d.meltMs;
        b.emit({ type: 'armorBreak', ms: d.meltMs });
        return 1;
      }
      return this.armorUp ? 1 - d.reduction : 1;
    }
    return this.exposed ? d.exposedMul : d.guardMul;
  }

  /** Парирование — существующая механика щита. Уязвимость открывает только парированный выпад. */
  onParry(p: Projectile) {
    const d = this.def;
    if (d.kind !== 'duelist' || p.tag !== 'duelist') return;
    this.strikeHitT = 0;
    this.exposedUntil = this.b.t + d.exposedMs;
    this.b.emit({ type: 'exposed', ms: d.exposedMs });
  }
}
