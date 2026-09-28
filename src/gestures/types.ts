import type { FingerId, HandFeatures } from '../vision/features';

export type SpellId = 'fireball' | 'ice' | 'lightning' | 'wind' | 'heal';
export type GestureId = SpellId | 'shield';

export interface FrameCtx {
  /** Вторая рука для двуручных шаблонов (null — её нет в кадре). */
  other: HandFeatures | null;
}

export interface Constraint {
  /** 'index_extended', 'palm_facing', 'hand_above_head'… — ключ для статистики ошибок. */
  id: string;
  weight: number;
  /** 0..1, мягкие пороги. */
  score: (h: HandFeatures, ctx: FrameCtx) => number;
  /** Строка чек-листа в академии: «Указательный выпрямлен». */
  label: string;
  /** КОНКРЕТНАЯ подсказка при провале: «Выпрями указательный палец». */
  hint: string;
  /** Какие пальцы подсветить красным при провале. */
  fingers?: FingerId[];
}

export type MotionKind = 'push' | 'flickDown' | 'swipeDown' | 'swipeSide' | 'hold';

export interface MotionTrigger {
  kind: MotionKind;
  /** Что показать в академии: как выполнить движение. */
  howTo: string;
  /** Подсказка при слабом движении («осечка»). */
  weakHint: string;
}

/** Описание позы для процедурной призрачной руки. */
export interface GhostSpec {
  ext: Record<FingerId, number>;
  facing: 1 | -1;
  twoHands?: 'together' | 'apart';
  /** Рука высоко (молния). */
  raised?: boolean;
  /** Указательный и средний сведены. */
  fingersTogether?: boolean;
}

export interface GestureTemplate {
  id: GestureId;
  name: string;
  icon: string;
  hands: 1 | 2;
  /** Короткое описание позы для академии. */
  poseText: string;
  pose: Constraint[];
  motion: MotionTrigger;
  ghost: GhostSpec;
}

export interface ConstraintResult {
  id: string;
  label: string;
  hint: string;
  score: number;
  fingers: FingerId[];
}

export interface TemplateScore {
  id: GestureId;
  score: number;
  results: ConstraintResult[];
  /** Индекс руки в кадре, на которой шаблон оценён лучше всего. */
  handIdx: number;
}
