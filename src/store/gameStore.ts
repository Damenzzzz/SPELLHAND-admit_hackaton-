import { create } from 'zustand';
import type { GestureId } from '../gestures/types';
import type { BattleResult } from '../game/stats';

export type Screen = 'calibration' | 'menu' | 'academy' | 'campaign' | 'battle' | 'results' | 'shop';

interface GameState {
  screen: Screen;
  /** Уровень текущего/следующего боя. */
  level: number;
  /** Выбранный в академии жест (null — список). */
  academyGesture: GestureId | null;
  lastResult: BattleResult | null;
  go: (screen: Screen) => void;
  startBattle: (level: number) => void;
  finishBattle: (result: BattleResult) => void;
  openAcademy: (g: GestureId | null) => void;
}

export const useGame = create<GameState>((set) => ({
  screen: 'calibration',
  level: 1,
  academyGesture: null,
  lastResult: null,
  go: (screen) => set({ screen }),
  startBattle: (level) => set({ screen: 'battle', level }),
  finishBattle: (lastResult) => set({ screen: 'results', lastResult }),
  openAcademy: (academyGesture) => set({ screen: 'academy', academyGesture }),
}));
