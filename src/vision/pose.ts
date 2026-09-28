/**
 * Жесты всем телом по MediaPipe Pose (33 точки): уклонение наклоном, скрещённые руки,
 * руки вверх. Координаты — нормированные кадра (незеркальные), y вниз.
 * Индексы: 0 нос; 11/12 плечи (левое/правое человека); 13/14 локти; 15/16 запястья.
 */
export interface PosePoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type PoseEvent =
  | { type: 'dodge'; dir: 'left' | 'right'; t: number }
  | { type: 'armsUp'; t: number }
  | { type: 'crossStart'; t: number }
  | { type: 'crossEnd'; t: number };

export interface PoseState {
  visible: boolean;
  calibrated: boolean;
  /** Наклон корпуса в ширинах плеч; > 0 — к краю кадра справа (игроку — влево в зеркале). */
  lean: number;
  crossed: boolean;
  armsUp: boolean;
}

export const POSE_CONFIG = {
  minVisibility: 0.5,
  calibFrames: 20,
  /** Уклонение: наклон дальше этого (в W) от нейтрали… */
  dodgeLean: 0.35,
  /** …и перед следующим надо вернуться ближе этого. */
  neutralLean: 0.18,
  dodgeRefractoryMs: 700,
  crossHoldMs: 250,
  armsUpHoldMs: 450,
  armsUpRefractoryMs: 3000,
  /** Медленная подстройка нейтрали (игрок сместился в кадре). */
  driftRate: 0.02,
};

const C = POSE_CONFIG;
const vis = (p: PosePoint | undefined) => !!p && (p.visibility ?? 1) >= C.minVisibility;

export class PoseTracker {
  private base: { x: number; w: number } | null = null;
  private calib: { x: number; w: number }[] = [];
  private armed = true;
  private lastDodge = -Infinity;
  private crossSince = 0;
  private crossed = false;
  private upSince = 0;
  private lastUp = -Infinity;

  reset() {
    this.base = null;
    this.calib = [];
    this.armed = true;
    this.crossed = false;
  }

  update(lm: PosePoint[] | null, now: number): { state: PoseState; events: PoseEvent[] } {
    const events: PoseEvent[] = [];
    const none: PoseState = { visible: false, calibrated: !!this.base, lean: 0, crossed: false, armsUp: false };
    if (!lm || !vis(lm[11]) || !vis(lm[12])) {
      if (this.crossed) {
        this.crossed = false;
        events.push({ type: 'crossEnd', t: now });
      }
      return { state: none, events };
    }

    const mid = (lm[11].x + lm[12].x) / 2;
    const shoulderY = (lm[11].y + lm[12].y) / 2;
    const w = Math.abs(lm[11].x - lm[12].x) || 1e-3;

    if (!this.base) {
      this.calib.push({ x: mid, w });
      if (this.calib.length >= C.calibFrames) {
        this.base = {
          x: this.calib.reduce((a, c) => a + c.x, 0) / this.calib.length,
          w: this.calib.reduce((a, c) => a + c.w, 0) / this.calib.length,
        };
      }
      return { state: { ...none, visible: true }, events };
    }

    const lean = (mid - this.base.x) / this.base.w;

    // уклонение: резкий наклон из нейтрали
    if (Math.abs(lean) < C.neutralLean) {
      this.armed = true;
      this.base.x += (mid - this.base.x) * C.driftRate;
      this.base.w += (w - this.base.w) * C.driftRate;
    } else if (this.armed && Math.abs(lean) > C.dodgeLean && now - this.lastDodge > C.dodgeRefractoryMs) {
      this.armed = false;
      this.lastDodge = now;
      // в зеркальном отображении сдвиг к правому краю кадра игрок видит как «влево»
      events.push({ type: 'dodge', dir: lean > 0 ? 'left' : 'right', t: now });
    }

    // скрещённые руки: запястья поменялись сторонами относительно плеч, на уровне груди
    let crossedNow = false;
    if (vis(lm[15]) && vis(lm[16]) && vis(lm[0])) {
      const swapped = Math.sign(lm[15].x - lm[16].x) !== Math.sign(lm[11].x - lm[12].x);
      const chest = [lm[15], lm[16]].every((p) => p.y > lm[0].y && p.y < shoulderY + 1.3 * this.base!.w);
      crossedNow = swapped && chest;
    }
    if (crossedNow) this.crossSince ||= now;
    else this.crossSince = 0;
    const crossed = !!this.crossSince && now - this.crossSince >= C.crossHoldMs;
    if (crossed !== this.crossed) {
      this.crossed = crossed;
      events.push({ type: crossed ? 'crossStart' : 'crossEnd', t: now });
    }

    // руки вверх: оба запястья заметно выше носа
    let upNow = false;
    if (vis(lm[15]) && vis(lm[16]) && vis(lm[0])) {
      upNow = lm[15].y < lm[0].y - 0.3 * this.base.w && lm[16].y < lm[0].y - 0.3 * this.base.w;
    }
    if (upNow) this.upSince ||= now;
    else this.upSince = 0;
    if (upNow && now - this.upSince >= C.armsUpHoldMs && now - this.lastUp > C.armsUpRefractoryMs) {
      this.lastUp = now;
      events.push({ type: 'armsUp', t: now });
    }

    return { state: { visible: true, calibrated: true, lean, crossed: this.crossed, armsUp: upNow }, events };
  }
}
