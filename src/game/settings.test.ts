import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings, pointerFromTip } from './settings';
import { getSettings, resetSettings, updateSettings } from '../store/settingsStore';
import { useSave } from '../store/saveStore';

const initial = useSave.getState();
afterEach(() => useSave.setState(initial, true));

describe('настройки управления', () => {
  it('старое сохранение без настроек использует прежние значения', () => {
    expect(normalizeSettings()).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ sfxVolume: 0 })).toEqual({ ...DEFAULT_SETTINGS, sfxVolume: 0 });
  });
  it('ограничивает диапазоны и отбрасывает повреждённые числовые значения', () => {
    expect(normalizeSettings({ musicVolume: 200, sfxVolume: -10, dwellMs: NaN, pointerGain: Infinity }))
      .toEqual({ ...DEFAULT_SETTINGS, musicVolume: 100, sfxVolume: 0 });
  });
  it('частичное изменение и сброс не стирают достижения, монеты и калибровку', () => {
    useSave.setState({ coins: 950, achievements: { first_win: 10 }, palmSign: -1, musicOn: false });
    updateSettings({ dwellMs: 800 });
    updateSettings({ pointerHand: 'left', menuControl: 'both' });
    expect(getSettings().dwellMs).toBe(800);
    expect(getSettings().pointerHand).toBe('left');
    resetSettings();
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(useSave.getState()).toMatchObject({ coins: 950, achievements: { first_win: 10 }, palmSign: -1, musicOn: true });
  });
  it('чувствительность сохраняет центр, зеркалит X и ограничивает края экрана', () => {
    expect(pointerFromTip(0.5, 0.5, 1.8)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointerFromTip(0, 1, 1.8)).toEqual({ x: 1, y: 1 });
    expect(pointerFromTip(1, 0, 1.8)).toEqual({ x: 0, y: 0 });
    expect(pointerFromTip(0.25, 0.5, 1).x).toBe(0.75);
    expect(pointerFromTip(0.25, 0.5, 1.8).x).toBe(0.95);
  });
});
