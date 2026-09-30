import type { LevelRecord } from '../store/saveStore';

/** Звёзды уровня: ★ победа, ★ точность жестов ≥ 80%, ★ победа, сохранив ≥ 50% HP. */
export const STAR_ACCURACY = 0.8;
export const STAR_HP = 0.5;
export const MAX_STARS = 3;

export function starsFor(won: boolean, accuracy: number, hpLeft: number): number {
  if (!won) return 0;
  return 1 + (accuracy >= STAR_ACCURACY ? 1 : 0) + (hpLeft >= STAR_HP ? 1 : 0);
}

/** Лучшие звёзды уровня. Старые сохранения без звёзд: победа и рекорд точности. */
export function levelStars(rec: LevelRecord | undefined): number {
  if (!rec?.wins) return 0;
  return rec.stars ?? (rec.bestAccuracy >= STAR_ACCURACY ? 2 : 1);
}

export const totalStars = (records: Record<number, LevelRecord>) =>
  Object.values(records).reduce((n, r) => n + levelStars(r), 0);

export const starString = (n: number) => '★'.repeat(n) + '☆'.repeat(MAX_STARS - n);
