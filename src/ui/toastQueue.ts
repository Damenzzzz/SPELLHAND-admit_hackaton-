export type ToastKind = 'bad' | 'info' | 'good';

export interface ToastItem {
  id: number;
  /** Сообщения с одним ключом не дублируются: текст обновляется, показ продлевается. */
  key: string;
  text: string;
  kind: ToastKind;
  until: number;
  /** Сколько раз повторилось, пока было на экране (×N рядом с текстом). */
  count: number;
}

export const TOAST_MS = 1600;
export const TOAST_MAX = 3;

/**
 * Очередь коротких сообщений боя. Время — по часам кадра (performance.now), без setTimeout:
 * нечего чистить при уходе с экрана. Повторы с тем же ключом (отказ «перезарядка 3.0 с» →
 * «2.5 с», одно и то же поджигание) сливаются в одно сообщение.
 */
export class ToastQueue {
  items: ToastItem[] = [];
  private nextId = 1;

  push(now: number, text: string, kind: ToastKind, key = text, ttl = TOAST_MS): void {
    const same = this.items.find((t) => t.key === key && t.until > now);
    if (same) {
      if (same.text === text) same.count++;
      same.text = text;
      same.kind = kind;
      same.until = now + ttl;
      return;
    }
    this.items = [...this.items.filter((t) => t.until > now), { id: this.nextId++, key, text, kind, until: now + ttl, count: 1 }].slice(-TOAST_MAX);
  }

  /** Убирает истёкшие; true — список изменился (нужна перерисовка). */
  prune(now: number): boolean {
    const before = this.items.length;
    this.items = this.items.filter((t) => t.until > now);
    return this.items.length !== before;
  }
}
