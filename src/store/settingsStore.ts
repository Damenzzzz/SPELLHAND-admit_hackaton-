import { useMemo } from 'react';
import { DEFAULT_SETTINGS, normalizeSettings, type GameSettings } from '../game/settings';
import { updateSave, useSave } from './saveStore';

export const getSettings = () => normalizeSettings(useSave.getState().settings);

export function useSettings() {
  const saved = useSave((s) => s.settings);
  return useMemo(() => normalizeSettings(saved), [saved]);
}

export function updateSettings(patch: Partial<GameSettings>) {
  updateSave((s) => ({ settings: normalizeSettings({ ...s.settings, ...patch }) }));
}

/** Сброс не меняет язык — иначе игрок потеряет интерфейс, который понимает. */
export function resetSettings() {
  updateSave((s) => ({ settings: { ...DEFAULT_SETTINGS, lang: normalizeSettings(s.settings).lang }, musicOn: true }));
}
