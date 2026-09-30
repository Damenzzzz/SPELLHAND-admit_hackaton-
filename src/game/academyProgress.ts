import type { GestureEvent, GestureSnapshot } from '../gestures/matcher';
import type { GestureId } from '../gestures/types';

export const ACADEMY = {
  /** Сколько успешных попыток нужно, чтобы жест считался изученным. */
  needed: 3,
  /** Удержание щита/лечения, которое засчитывается как попытка. */
  holdMs: 1000,
  /**
   * Следующая попытка удержания — только после настоящего отпускания позы не короче этого.
   * Мигание распознавания (поза сорвалась на кадры и взвелась снова) — это то же удержание.
   */
  releaseMs: 300,
};

export type HoldPhase = 'idle' | 'holding' | 'counted';

/**
 * Подсчёт успешных попыток одного упражнения Академии. Без React: вход — события и снимки
 * распознавателя, выход — засчитана ли попытка. Ошибки счётчик не уменьшают.
 */
export class AcademyCounter {
  count = 0;
  /** Удержание уже засчитано и ждёт отпускания позы. */
  private awaitingRelease = false;
  private releasedSince: number | null = null;
  /** Начало текущего непрерывного удержания (мигание распознавания его не обрывает). */
  private holdStart: number | null = null;

  constructor(
    readonly gesture: GestureId,
    readonly kind: 'hold' | 'motion',
  ) {}

  /** Каст движения. Лёд: засчитывается серия (первый осколок), а не каждый осколок. */
  onEvent(e: GestureEvent): number | null {
    if (this.kind !== 'motion' || e.type !== 'cast' || e.gesture !== this.gesture || e.shard !== 1) return null;
    this.count++;
    return e.quality;
  }

  /** Удержание: возвращает качество, если в этом кадре засчитана попытка. */
  onSnapshot(snap: Pick<GestureSnapshot, 't' | 'active' | 'quality'>): number | null {
    if (this.kind !== 'hold') return null;
    const held = snap.active === this.gesture;
    if (!held) {
      this.releasedSince ??= snap.t;
      if (snap.t - this.releasedSince >= ACADEMY.releaseMs) {
        this.awaitingRelease = false;
        this.holdStart = null;
      }
      return null;
    }
    this.releasedSince = null;
    this.holdStart ??= snap.t;
    if (this.awaitingRelease || snap.t - this.holdStart < ACADEMY.holdMs) return null;
    this.awaitingRelease = true;
    this.count++;
    return snap.quality;
  }

  /** Для UI: доля удержания 0..1 и фаза. */
  holdState(t: number, active: GestureId | null): { phase: HoldPhase; progress: number } {
    if (this.awaitingRelease) return { phase: 'counted', progress: 1 };
    if (active !== this.gesture || this.holdStart === null) return { phase: 'idle', progress: 0 };
    return { phase: 'holding', progress: Math.min(1, (t - this.holdStart) / ACADEMY.holdMs) };
  }

  get done() {
    return this.count >= ACADEMY.needed;
  }
}
