import type { PvpLink } from './pvp';

/** Текущий матч — передаётся с экрана «Онлайн» на экран боя (без статического импорта Trystero). */
let current: PvpLink | null = null;
export const setCurrentLink = (l: PvpLink | null) => (current = l);
export const currentLink = () => current;

export const STATE_EVERY_MS = 250;
export const HAND_EVERY_MS = 80;

/** Последний скелет руки соперника (нормированные координаты его кадра). */
export const remoteHand: { pts: { x: number; y: number }[] | null; at: number } = { pts: null, at: 0 };
