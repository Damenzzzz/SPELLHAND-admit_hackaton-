import type { SpellId } from '../../gestures/types';

/** Комбо: заклинание `then` в течение windowMs после `first` получает бонус. Данные, не код. */
export interface ComboDef {
  id: string;
  name: string;
  first: SpellId;
  then: SpellId;
  bonusDamage: number;
  /** Доля урона, проходящая сквозь щит (для «Шторма»). */
  pierce?: number;
  /** Поджигает цель. */
  burn?: boolean;
}

export const COMBO_WINDOW_MS = 1500;

export const COMBOS: ComboDef[] = [
  { id: 'storm', name: 'Шторм', first: 'ice', then: 'lightning', bonusDamage: 15, pierce: 0.5 },
  { id: 'firestorm', name: 'Огненный вихрь', first: 'fireball', then: 'wind', bonusDamage: 10, burn: true },
];

/** Стихийные статусы. */
export const STATUS = {
  /** Горение от огненного шара: урон в секунду и длительность; снимается льдом или лечением. */
  burnDps: 2,
  burnMs: 3000,
  /** Ветер сдувает вражеские снаряды в полёте, теряя долю силы за каждый. */
  windAbsorbLoss: 1 / 3,
};
