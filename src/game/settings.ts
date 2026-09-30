export interface GameSettings {
  menuControl: 'gesture' | 'both' | 'pointer';
  dwellMs: number;
  pointerGain: number;
  pointerHand: 'auto' | 'left' | 'right';
  musicVolume: number;
  sfxVolume: number;
  reducedEffects: boolean;
  showStaff: boolean;
  /** Язык интерфейса. */
  lang: 'ru' | 'en';
}

export const DEFAULT_SETTINGS: GameSettings = {
  menuControl: 'gesture',
  dwellMs: 1200,
  pointerGain: 1.4,
  pointerHand: 'auto',
  musicVolume: 28,
  sfxVolume: 50,
  reducedEffects: false,
  showStaff: true,
  lang: 'ru',
};

const numberIn = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

/** Old or partially written saves inherit defaults; audio values always stay valid. */
export function normalizeSettings(input: Partial<GameSettings> = {}): GameSettings {
  return {
    menuControl: input.menuControl === 'both' || input.menuControl === 'pointer' ? input.menuControl : 'gesture',
    dwellMs: numberIn(input.dwellMs, DEFAULT_SETTINGS.dwellMs, 600, 2400),
    pointerGain: numberIn(input.pointerGain, DEFAULT_SETTINGS.pointerGain, 1, 2),
    pointerHand: input.pointerHand === 'left' || input.pointerHand === 'right' ? input.pointerHand : 'auto',
    musicVolume: numberIn(input.musicVolume, DEFAULT_SETTINGS.musicVolume, 0, 100),
    sfxVolume: numberIn(input.sfxVolume, DEFAULT_SETTINGS.sfxVolume, 0, 100),
    reducedEffects: input.reducedEffects === true,
    showStaff: input.showStaff !== false,
    lang: input.lang === 'en' ? 'en' : 'ru',
  };
}

export function pointerFromTip(x: number, y: number, gain: number) {
  return {
    x: Math.max(0, Math.min(1, 0.5 + (1 - x - 0.5) * gain)),
    y: Math.max(0, Math.min(1, 0.5 + (y - 0.5) * gain)),
  };
}
