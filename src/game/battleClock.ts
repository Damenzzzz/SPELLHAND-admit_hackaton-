export const BATTLE_COUNTDOWN_MS = 3000;
export type BattlePhase = 'countdown' | 'fight' | 'paused' | 'resuming' | 'end';

/** Wall time controls countdowns; only fighting contributes time to the simulation. */
export class BattleClock {
  phase: BattlePhase = 'countdown';
  private lastAt: number;
  private readyAt: number;

  constructor(now: number, private readonly online = false, countdownMs = BATTLE_COUNTDOWN_MS) {
    this.lastAt = now;
    this.readyAt = now + countdownMs;
  }

  get countdown() {
    return Math.max(0, Math.ceil((this.readyAt - this.lastAt) / 1000));
  }

  get frozen() {
    return this.phase === 'paused' || this.phase === 'resuming';
  }

  /** Never catch up the simulation after a pause or a stalled animation frame. */
  advance(now: number): number {
    const dt = Math.max(0, Math.min(50, now - this.lastAt));
    this.lastAt = now;
    if ((this.phase === 'countdown' || this.phase === 'resuming') && now >= this.readyAt) {
      this.phase = 'fight';
      return 0;
    }
    return this.phase === 'fight' ? dt : 0;
  }

  pause(): boolean {
    if (this.online || this.phase === 'paused' || this.phase === 'end') return false;
    this.phase = 'paused';
    return true;
  }

  resume(now: number): boolean {
    if (this.phase !== 'paused') return false;
    this.phase = 'resuming';
    this.lastAt = now;
    this.readyAt = now + BATTLE_COUNTDOWN_MS;
    return true;
  }

  end() {
    this.phase = 'end';
  }
}
