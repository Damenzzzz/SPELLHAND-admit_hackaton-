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
  mode: 'campaign' | 'online' | 'ghost';
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
  advice: string[];
  coins: number;
  firstWin: boolean;
  newRecord: boolean;
}

/** Собирает статистику жестов за бой — для экрана итогов и режима «ошибка». */
export class BattleStats {
  private quality = new Map<GestureId, number[]>();
  private errors = new Map<string, ErrorStat>();
  private failures = 0;

  /** Успешный каст/поднятие щита/начало лечения. */
  success(g: GestureId, quality: number) {
    const arr = this.quality.get(g) ?? [];
    arr.push(quality);
    this.quality.set(g, arr);
  }

  /** События распознавателя: near-miss и осечки — это ошибки. */
  onGesture(e: GestureEvent) {
    if (e.type === 'nearMiss') {
      this.failures++;
      for (const c of e.constraints) this.addError(c.id, c.hint, e.gesture);
    } else if (e.type === 'misfire') {
      this.failures++;
      this.addError(e.id, e.text, e.gesture);
    }
  }

  private addError(id: string, text: string, gesture: GestureId) {
    const cur = this.errors.get(id);
    if (cur) cur.count++;
    else this.errors.set(id, { id, text, count: 1, gesture });
  }

  summary(): Pick<BattleResult, 'accuracy' | 'casts' | 'attempts' | 'perSpell' | 'topErrors' | 'advice'> {
    const perSpell: Partial<Record<GestureId, SpellStat>> = {};
    let casts = 0;
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
    };
  }
}
