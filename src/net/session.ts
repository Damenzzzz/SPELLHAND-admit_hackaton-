import type { PvpLink } from './pvp';

/** Текущий матч — передаётся с экрана «Онлайн» на экран боя (без статического импорта Trystero). */
let current: PvpLink | null = null;
export const setCurrentLink = (l: PvpLink | null) => (current = l);
export const currentLink = () => current;

export const STATE_EVERY_MS = 250;
