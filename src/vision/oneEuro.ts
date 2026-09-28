/**
 * One Euro filter (Casiez et al., 2012): адаптивный низкочастотный фильтр.
 * На медленном движении сильно сглаживает дребезг, на быстром — почти не добавляет задержки.
 */
export interface OneEuroParams {
  /** Минимальная частота среза, Гц. Меньше — сильнее сглаживание в покое. */
  minCutoff: number;
  /** Насколько частота среза растёт со скоростью. Больше — меньше лаг на рывках. */
  beta: number;
  /** Частота среза для производной, Гц. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.2, beta: 8, dCutoff: 1 };

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastT = 0;

  constructor(private params: OneEuroParams = DEFAULT_ONE_EURO) {}

  /** @param t время в секундах */
  filter(value: number, t: number): number {
    if (this.x === null) {
      this.x = value;
      this.lastT = t;
      return value;
    }
    const dt = Math.max(t - this.lastT, 1e-3);
    this.lastT = t;

    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.params.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
  }
}

/** Фильтр для 21 точки руки (x, y, z каждой). */
export class LandmarkFilter {
  private filters: OneEuroFilter[] = [];

  constructor(private params: OneEuroParams = DEFAULT_ONE_EURO) {}

  apply<P extends { x: number; y: number; z: number }>(points: P[], tSec: number): P[] {
    if (this.filters.length !== points.length * 3) {
      this.filters = Array.from({ length: points.length * 3 }, () => new OneEuroFilter(this.params));
    }
    return points.map((p, i) => ({
      ...p,
      x: this.filters[i * 3].filter(p.x, tSec),
      y: this.filters[i * 3 + 1].filter(p.y, tSec),
      z: this.filters[i * 3 + 2].filter(p.z, tSec),
    }));
  }
}
