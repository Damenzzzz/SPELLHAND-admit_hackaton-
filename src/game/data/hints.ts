import type { GestureId } from '../../gestures/types';

/** Советы «что тренировать» по id ошибки (ограничения или осечки). */
const ADVICE: Record<string, string> = {
  palm_facing: 'Держи ладонь строго к камере — представь, что показываешь её собеседнику.',
  hand_above_head: 'Для молнии поднимай руку выше макушки ещё до взмаха.',
  index_up: 'Для молнии направляй указательный палец строго вверх.',
  index_middle_together: 'Для льда прижимай указательный и средний друг к другу.',
  two_hands: 'Для ветра и лечения держи обе руки в кадре — отойди чуть дальше от камеры.',
  hands_together: 'Для лечения сводите запястья вплотную, как будто держишь воду.',
  hands_apart: 'Для ветра разводи руки на ширину плеч.',
  hand_open: 'Раскрывай ладонь полностью — все пальцы прямые и чуть разведены.',
  other_hand_open: 'Следи и за второй рукой: она тоже должна быть раскрыта.',
  fireball_motion_weak: 'Выстрел огнём — короткий резкий толчок ладонью к камере, а не плавное приближение.',
  lightning_motion_weak: 'Молния — это быстрый взмах вниз, как удар хлыстом.',
  ice_motion_weak: 'Осколки льда — короткие резкие кивки кистью вниз.',
  wind_motion_weak: 'Ветер — обе руки одновременно и быстро в одну сторону.',
  fireball_overcharge: 'Полный заряд — через полторы секунды; держишь дольше двух — шар взрывается. Толкай, как только посох засиял.',
};

const FINGER_RU: Record<string, string> = {
  thumb: 'большого пальца',
  index: 'указательного',
  middle: 'среднего',
  ring: 'безымянного',
  pinky: 'мизинца',
};

export function adviceFor(errorId: string): string {
  if (ADVICE[errorId]) return ADVICE[errorId];
  const [finger, state] = errorId.split('_');
  if (FINGER_RU[finger] && state === 'extended') {
    return `Тренируй выпрямление ${FINGER_RU[finger]} — в Академии смотри на чек-лист.`;
  }
  if (FINGER_RU[finger] && state === 'curled') {
    return `Тренируй сгибание ${FINGER_RU[finger]}: прижимай его к ладони плотнее.`;
  }
  return 'Повтори жест в Академии, глядя на призрачную руку.';
}

/** Какой жест тренировать по ошибке — для кнопки «В академию». */
export function gestureOfError(errorId: string, fallback: GestureId): GestureId {
  const prefix = errorId.split('_')[0];
  return (['fireball', 'ice', 'lightning', 'wind', 'heal', 'shield'] as string[]).includes(prefix)
    ? (prefix as GestureId)
    : fallback;
}
