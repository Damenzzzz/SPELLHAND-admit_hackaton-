import { gestureEngine, type GestureEngine } from '../gestures/matcher';
import { useGame } from './gameStore';

/**
 * Смена экрана (новый бой, другое упражнение Академии на том же экране) сбрасывает взведённую позу, заряд, перо руны
 * и незавершённое движение. Трекинг рук остаётся — курсор меню не прыгает. Иначе ладонь,
 * которой навели на «Старт», приходит в разминку или Академию уже заряженным огненным шаром.
 */
export function startIntentReset(engine: GestureEngine = gestureEngine) {
  return useGame.subscribe((s, prev) => {
    // новое упражнение Академии («Дальше») — тоже чистый лист, хотя экран тот же
    if (s.screen !== prev.screen || s.battleId !== prev.battleId || s.academyGesture !== prev.academyGesture) engine.resetIntent();
  });
}
