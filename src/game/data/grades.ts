import { localize } from '../../i18n';
/**
 * Оценка жеста при касте: точность = сила. Perfect даёт бонус урона и растит комбо,
 * «Слабо» бьёт по базовой формуле 0.6 + 0.4·качество и обрывает серию.
 */
export type GradeId = 'perfect' | 'good' | 'weak';

export interface GradeDef {
  id: GradeId;
  /** Минимальное качество жеста. */
  min: number;
  label: string;
  color: string;
  /** Множитель урона поверх 0.6 + 0.4·качество. */
  mul: number;
}

export const GRADES: GradeDef[] = [
  { id: 'perfect', min: 0.92, label: 'ИДЕАЛЬНО', color: '#f2c35b', mul: 1.2 },
  { id: 'good', min: 0.8, label: 'ХОРОШО', color: '#5dffa0', mul: 1 },
  { id: 'weak', min: 0, label: 'СЛАБО', color: '#ff9a3d', mul: 1 },
];

export const gradeOf = (quality: number): GradeDef => GRADES.find((g) => quality >= g.min) ?? GRADES[2];

/** Комбо: каждый удачный (не «слабо») каст подряд +5% урона, максимум +25%. */
export const COMBO = { stepBonus: 0.05, maxSteps: 5 };

localize(GRADES);
