import { dist, type HandFeatures } from '../../vision/features';
import { recognize, type Pt } from './pdollar';
import { RUNES, RUNE_TEMPLATES, type RuneId } from './runes';

export const RUNE_CONFIG = {
  /** Перо: большой и указательный сведены (÷palmSize), средний выпрямлен (не кулак). */
  pinchEnter: 0.32,
  pinchExit: 0.5,
  middleMin: 0.45,
  enterFrames: 2,
  /** Пропажа руки короче этого не обрывает росчерк. */
  lostMs: 150,
  /** Дрожание пера в начале и конце росчерка. */
  trimMs: 80,
  minMs: 250,
  maxMs: 3000,
  /** Минимальная длина росчерка в размерах ладони. */
  minPathPalms: 1.2,
  /**
   * $P штрафует недорисованные концы (−10% пути → оценка 0.73 → 0.50), а в воздухе
   * фигуры всегда неидеальны — поэтому решает в первую очередь отрыв от второй руны.
   * Каракули набирают ≤ 0.22.
   */
  accept: 0.45,
  margin: 0.15,
  /** Ниже accept, но выше этого — «похоже на …» (режим «ошибка»). */
  nearMiss: 0.3,
};

export type RuneEvent =
  | { type: 'rune'; rune: RuneId; score: number; t: number }
  | { type: 'runeFail'; reason: string; guess: RuneId | null; score: number; t: number };

interface Sample extends Pt {
  t: number;
  /** Нормированные координаты кадра — для отрисовки следа. */
  rx: number;
  ry: number;
}

const C = RUNE_CONFIG;

/**
 * Росчерк руны «пером» (жест «ОК»): кончик — середина между большим и указательным.
 * Пока перо опущено, обычные жесты не взводятся (чтобы росчерк не стал огненным шаром).
 */
export class RuneTracker {
  private down = false;
  private enter = 0;
  private points: Sample[] = [];
  private lostAt = 0;
  private palm = 0.1;

  isPen(h: HandFeatures): boolean {
    const pinch = dist(h.pts[4], h.pts[8]) / h.palmSize;
    const limit = this.down ? C.pinchExit : C.pinchEnter;
    return pinch < limit && h.extension.middle >= C.middleMin;
  }

  /**
   * Возвращает состояние пера и событие, если росчерк завершён.
   * unfiltered — сырые landmarks MediaPipe тех же рук: для формы руны точность важнее
   * сглаживания (One Euro скругляет углы треугольника), дрожь уберёт передискретизация.
   */
  update(
    hands: HandFeatures[],
    now: number,
    unfiltered?: { x: number; y: number }[][],
    aspect = 1,
  ): { penDown: boolean; trail: { x: number; y: number }[]; event: RuneEvent | null } {
    const penIdx = hands.findIndex((h) => this.isPen(h));
    const pen = penIdx >= 0 ? hands[penIdx] : undefined;

    if (!this.down) {
      this.enter = pen ? this.enter + 1 : 0;
      if (this.enter >= C.enterFrames && pen) {
        this.down = true;
        this.points = [];
        this.lostAt = 0;
      }
    }

    let event: RuneEvent | null = null;
    if (this.down) {
      if (pen) {
        this.lostAt = 0;
        this.palm = pen.palmSize;
        const src = unfiltered?.[penIdx] ?? pen.raw;
        const rx = (src[4].x + src[8].x) / 2;
        const ry = (src[4].y + src[8].y) / 2;
        const tip = unfiltered ? { x: rx * aspect, y: ry } : { x: (pen.pts[4].x + pen.pts[8].x) / 2, y: (pen.pts[4].y + pen.pts[8].y) / 2 };
        this.points.push({ ...tip, t: now, rx, ry });
      } else {
        this.lostAt ||= now;
        if (now - this.lostAt >= C.lostMs || !hands.length) {
          this.down = false;
          this.enter = 0;
          event = this.finish(now);
        }
      }
    }

    return { penDown: this.down, trail: this.down ? this.points.map((p) => ({ x: p.rx, y: p.ry })) : [], event };
  }

  private finish(now: number): RuneEvent | null {
    const pts = this.points;
    this.points = [];
    if (pts.length < 3) return null;
    const t0 = pts[0].t + C.trimMs;
    const t1 = pts[pts.length - 1].t - C.trimMs;
    const stroke = pts.filter((p) => p.t >= t0 && p.t <= t1);
    const duration = pts[pts.length - 1].t - pts[0].t;
    const fail = (reason: string, guess: RuneId | null = null, score = 0): RuneEvent => ({
      type: 'runeFail',
      reason,
      guess,
      score,
      t: now,
    });

    if (duration < C.minMs) return null; // случайное касание пальцев — не попытка
    if (duration > C.maxMs) return fail('Слишком долго — рисуй руну одним движением за 1–2 секунды');
    let length = 0;
    for (let i = 1; i < stroke.length; i++) length += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
    if (stroke.length < 3 || length < C.minPathPalms * this.palm) return fail('Слишком мелко — рисуй руну крупнее');

    const r = recognize(stroke, RUNE_TEMPLATES);
    if (!r) return null;
    if (r.score >= C.accept && r.margin >= C.margin) return { type: 'rune', rune: r.id, score: r.score, t: now };
    if (r.score >= C.nearMiss) {
      const rune = RUNES[r.id];
      return fail(`Похоже на «${rune.name}» (${rune.howTo.toLowerCase()}) — нарисуй чётче и замкни фигуру`, r.id, r.score);
    }
    return fail('Не похоже ни на одну руну — посмотри фигуры в Академии', null, r.score);
  }
}
