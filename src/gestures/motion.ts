import type { HandFeatures } from '../vision/features';
import { GESTURE_CONFIG as C } from './config';

interface Sample {
  t: number;
  cx: number;
  cy: number;
  tipY: number;
  palm: number;
}

/**
 * Кольцевой буфер последних кадров одной руки и производные по нему:
 * толчок (рост palmSize), скорость центра ладони и кончика указательного.
 */
export class MotionTrack {
  private buf: Sample[] = [];

  push(h: HandFeatures, t: number) {
    this.buf.push({ t, cx: h.center.x, cy: h.center.y, tipY: h.pts[8].y, palm: h.palmSize });
    if (this.buf.length > C.historyFrames) this.buf.shift();
  }

  clear() {
    this.buf = [];
  }

  get size() {
    return this.buf.length;
  }

  private last() {
    return this.buf[this.buf.length - 1];
  }

  /** Самый ранний сэмпл не старше windowMs. */
  private since(windowMs: number): Sample | undefined {
    const now = this.last()?.t ?? 0;
    return this.buf.find((s) => now - s.t <= windowMs);
  }

  private avgPalm() {
    return this.buf.reduce((a, s) => a + s.palm, 0) / (this.buf.length || 1);
  }

  /** Относительный рост palmSize от минимума за окно: 0.15 = +15%. */
  pushGrowth(): number {
    const now = this.last();
    if (!now) return 0;
    let min = Infinity;
    for (const s of this.buf) if (now.t - s.t <= C.pushWindowMs) min = Math.min(min, s.palm);
    return min === Infinity ? 0 : now.palm / min - 1;
  }

  /** Скорость центра ладони, ладоней/сек. vy > 0 — вниз. */
  velocity(): { vx: number; vy: number } {
    const now = this.last();
    const then = this.since(C.velocityWindowMs);
    if (!now || !then || now === then) return { vx: 0, vy: 0 };
    const dt = (now.t - then.t) / 1000;
    const k = 1 / (this.avgPalm() * dt);
    return { vx: (now.cx - then.cx) * k, vy: (now.cy - then.cy) * k };
  }

  /** Скорость кончика указательного вниз, ладоней/сек. */
  tipVelocityY(): number {
    const now = this.last();
    const then = this.since(C.velocityWindowMs);
    if (!now || !then || now === then) return 0;
    const dt = (now.t - then.t) / 1000;
    return (now.tipY - then.tipY) / (this.avgPalm() * dt);
  }
}
