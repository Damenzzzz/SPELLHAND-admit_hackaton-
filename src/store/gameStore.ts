import { create } from 'zustand';
import type { GestureId } from '../gestures/types';
import type { BattleResult } from '../game/stats';

export type Screen =
  | 'calibration'
  | 'menu'
  | 'academy'
  | 'campaign'
  | 'battle'
  | 'results'
  | 'shop'
  | 'online'
  | 'leaderboard'
  | 'personal'
  | 'coach';

export type BattleSetup =
  | { kind: 'campaign'; level: number }
  /** startAt — общее время старта (Date.now-шкала), назначенное инициатором. */
  | { kind: 'online'; opponentNick: string; startAt: number }
  | { kind: 'ghost' };

interface GameState {
  screen: Screen;
  /** Уровень текущего/следующего боя (кампания). */
  level: number;
  setup: BattleSetup;
  /** Выбранный в академии жест (null — список). */
  academyGesture: GestureId | null;
  lastResult: BattleResult | null;
  go: (screen: Screen) => void;
  startBattle: (level: number) => void;
  startOnline: (opponentNick: string, startAt: number) => void;
  startGhost: () => void;
  finishBattle: (result: BattleResult) => void;
  openAcademy: (g: GestureId | null) => void;
}

export const useGame = create<GameState>((set) => ({
  screen: 'calibration',
  level: 1,
  setup: { kind: 'campaign', level: 1 },
  academyGesture: null,
  lastResult: null,
  go: (screen) => set({ screen }),
  startBattle: (level) => set({ screen: 'battle', level, setup: { kind: 'campaign', level } }),
  startOnline: (opponentNick, startAt) => set({ screen: 'battle', setup: { kind: 'online', opponentNick, startAt } }),
  startGhost: () => set({ screen: 'battle', setup: { kind: 'ghost' } }),
  finishBattle: (lastResult) => set({ screen: 'results', lastResult }),
  openAcademy: (academyGesture) => set({ screen: 'academy', academyGesture }),
}));
