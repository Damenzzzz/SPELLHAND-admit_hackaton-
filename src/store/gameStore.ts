import { create } from 'zustand';

export type Screen = 'calibration' | 'sandbox';

interface GameState {
  screen: Screen;
  go: (screen: Screen) => void;
}

export const useGame = create<GameState>((set) => ({
  screen: 'calibration',
  go: (screen) => set({ screen }),
}));
