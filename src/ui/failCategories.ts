import type { RejectKind } from '../game/combat';
import type { FailCategory } from '../gestures/matcher';

/** Единая таксономия причин провала: игрок сразу видит, что не так — рука, кадр или заклинание. */
export const FAIL_BADGE: Record<FailCategory | RejectKind, { icon: string; label: string; color: string }> = {
  shape: { icon: '✋', label: 'Форма руки', color: '#ff4d5e' },
  motion: { icon: '↯', label: 'Движение', color: '#ff9a3d' },
  frame: { icon: '📷', label: 'Кадр', color: '#f2c35b' },
  light: { icon: '💡', label: 'Свет', color: '#f2c35b' },
  cooldown: { icon: '⏳', label: 'Перезарядка', color: '#8fb8ff' },
  mana: { icon: '💧', label: 'Мана', color: '#5fa8ff' },
  interrupted: { icon: '🌪️', label: 'Сбит', color: '#b6f5d8' },
};
