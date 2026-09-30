import { create } from 'zustand';
import type { GestureId } from '../gestures/types';
import { COMBAT } from '../game/data/spells';
import { BattleStats, type BattleResult } from '../game/stats';

export type Screen =
  | 'settings'
  | 'achievements'
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
  | 'coach'
  | 'rush'
  | 'daily'
  | 'runes'
  | 'body'
  | 'survival'
  | 'tutorial'
  | 'combos';

export type BattleSetup =
  | { kind: 'campaign'; level: number; mutators: string[] }
  /** startAt — общее время старта (Date.now-шкала), назначенное инициатором. */
  | { kind: 'online'; opponentNick: string; startAt: number }
  | { kind: 'ghost' }
  | { kind: 'daily' }
  | { kind: 'survival'; wave: number };

/** Забег башни выживания: HP и статистика жестов переносятся между волнами. */
export interface SurvivalRun {
  wave: number;
  hp: number;
  stats: BattleStats;
  durationMs: number;
}

interface GameState {
  screen: Screen;
  /** Уровень текущего/следующего боя (кампания). */
  level: number;
  setup: BattleSetup;
  /** Выбранный в академии жест (null — список). */
  academyGesture: GestureId | null;
  lastResult: BattleResult | null;
  /** Мутаторы, включённые на экране кампании. */
  mutators: string[];
  survival: SurvivalRun | null;
  /** Растёт при каждом старте боя — экран боя пересоздаётся даже без смены экрана (следующая волна). */
  battleId: number;
  toggleMutator: (id: string) => void;
  startSurvival: () => void;
  nextWave: (hp: number, durationMs: number) => void;
  go: (screen: Screen) => void;
  startBattle: (level: number) => void;
  startOnline: (opponentNick: string, startAt: number) => void;
  startGhost: () => void;
  startDaily: () => void;
  finishBattle: (result: BattleResult) => void;
  openAcademy: (g: GestureId | null) => void;
}

export const useGame = create<GameState>((set) => ({
  screen: 'calibration',
  level: 1,
  setup: { kind: 'campaign', level: 1, mutators: [] },
  academyGesture: null,
  lastResult: null,
  mutators: [],
  survival: null,
  battleId: 0,
  toggleMutator: (id) =>
    set((s) => ({ mutators: s.mutators.includes(id) ? s.mutators.filter((m) => m !== id) : [...s.mutators, id] })),
  startSurvival: () =>
    set((s) => ({
      screen: 'battle',
      setup: { kind: 'survival', wave: 1 },
      survival: { wave: 1, hp: COMBAT.hp, stats: new BattleStats(), durationMs: 0 },
      battleId: s.battleId + 1,
    })),
  nextWave: (hp, durationMs) =>
    set((s) => {
      if (!s.survival) return {};
      const wave = s.survival.wave + 1;
      return {
        setup: { kind: 'survival', wave },
        survival: { ...s.survival, wave, hp, durationMs: s.survival.durationMs + durationMs },
        battleId: s.battleId + 1,
      };
    }),
  go: (screen) => set({ screen }),
  startBattle: (level) =>
    set((s) => ({ screen: 'battle', level, setup: { kind: 'campaign', level, mutators: s.mutators }, battleId: s.battleId + 1 })),
  startOnline: (opponentNick, startAt) =>
    set((s) => ({ screen: 'battle', setup: { kind: 'online', opponentNick, startAt }, battleId: s.battleId + 1 })),
  startGhost: () => set((s) => ({ screen: 'battle', setup: { kind: 'ghost' }, battleId: s.battleId + 1 })),
  startDaily: () => set((s) => ({ screen: 'battle', setup: { kind: 'daily' }, battleId: s.battleId + 1 })),
  finishBattle: (lastResult) => set({ screen: 'results', lastResult }),
  openAcademy: (academyGesture) => set({ screen: 'academy', academyGesture }),
}));
