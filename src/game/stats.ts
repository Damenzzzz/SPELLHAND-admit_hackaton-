import type { GestureEvent } from '../gestures/matcher';
import type { GestureId } from '../gestures/types';
import { adviceFor } from './data/hints';

export interface SpellStat {
  count: number;
  avgQuality: number;
}

export interface ErrorStat {
  id: string;
  text: string;
  count: number;
  gesture: GestureId;
}

export interface BattleResult {
  level: number;
  mode: 'campaign' | 'online' | 'ghost' | 'daily';
  /** Очки испытания дня. */
  dailyScore?: number;
  /** Ник соперника (онлайн) или имя врага. */
  opponent: string;
  won: boolean;
  durationMs: number;
  /** Успешные касты / все попытки (касты + near-miss + осечки). */
  accuracy: number;
  casts: number;
  attempts: number;
  perSpell: Partial<Record<GestureId, SpellStat>>;
  topErrors: ErrorStat[];
  /** Все ошибки за бой: id ограничения/осечки → сколько раз. */
  errorCounts: Record<string, number>;
  advice: string[];
  coins: number;
  firstWin: boolean;
  newRecord: boolean;
}

/** Собирает статистику жестов за бой — для экрана итогов и режима «ошибка». */
/** Щит засчитывается удачным жестом, если продержался столько мс (или заблокировал удар). */
export const SHIELD_COUNT_MS = 500;

export class BattleStats {
  private quality = new Map<GestureId, number[]>();
  private shield: { upAt: number; counted: boolean } | null = null;
  private errors = new Map<string, ErrorStat>();
  private failures = 0;
  private runeCasts = 0;

  /** Удачная руна — удачная попытка (в точность), но не жест из шаблонов. */
  runeSuccess() {
    this.runeCasts++;
  }

  /** Успешный каст/поднятие щита/начало лечения. */
  success(g: GestureId, quality: number) {
    const arr = this.quality.get(g) ?? [];
    arr.push(quality);
    this.quality.set(g, arr);
  }

  // Щит — удерживаемая поза: один зачёт за подъём, если он заблокировал удар или
  // продержался SHIELD_COUNT_MS. Мигающий щит точность и монеты не накручивает.
  shieldUp(t: number) {
    this.shield = { upAt: t, counted: false };
  }

  shieldDown() {
    this.shield = null;
  }

  shieldBlocked(quality: number) {
    this.creditShield(quality);
  }

  shieldTick(t: number, quality: number) {
    if (this.shield && t - this.shield.upAt >= SHIELD_COUNT_MS) this.creditShield(quality);
  }

  private creditShield(quality: number) {
    if (!this.shield || this.shield.counted) return;
    this.shield.counted = true;
    this.success('shield', quality);
  }

  /** События распознавателя: near-miss и осечки — это ошибки. */
  onGesture(e: GestureEvent) {
    if (e.type === 'nearMiss') {
      this.failures++;
      for (const c of e.constraints) this.addError(c.id, c.hint, e.gesture);
    } else if (e.type === 'misfire') {
      this.failures++;
      this.addError(e.id, e.text, e.gesture);
    } else if (e.type === 'overcharge') {
      this.failures++;
      this.addError('fireball_overcharge', 'Перезаряд — шар взорвался в руке', 'fireball');
    } else if (e.type === 'runeFail') {
      this.failures++;
      // руны не жесты из шаблонов — в статистике относим к молнии «рисования» по умолчанию
      this.addError('rune_fail', 'Руна не распознана', 'lightning');
    }
  }

  private addError(id: string, text: string, gesture: GestureId) {
    const cur = this.errors.get(id);
    if (cur) cur.count++;
    else this.errors.set(id, { id, text, count: 1, gesture });
  }

  summary(): Pick<
    BattleResult,
    'accuracy' | 'casts' | 'attempts' | 'perSpell' | 'topErrors' | 'advice' | 'errorCounts'
  > {
    const perSpell: Partial<Record<GestureId, SpellStat>> = {};
    let casts = this.runeCasts;
    for (const [g, arr] of this.quality) {
      casts += arr.length;
      perSpell[g] = { count: arr.length, avgQuality: arr.reduce((a, b) => a + b, 0) / arr.length };
    }
    const attempts = casts + this.failures;
    const topErrors = [...this.errors.values()].sort((a, b) => b.count - a.count).slice(0, 3);
    return {
      casts,
      attempts,
      accuracy: attempts ? casts / attempts : 0,
      perSpell,
      topErrors,
      advice: topErrors.slice(0, 2).map((e) => adviceFor(e.id)),
      errorCounts: Object.fromEntries([...this.errors.values()].map((e) => [e.id, e.count])),
    };
  }
}
