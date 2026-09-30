import type { SpellId } from '../../gestures/types';
import { localize } from '../../i18n';

export type ComboId = 'storm' | 'firestorm' | 'steam' | 'plasma';

/**
 * Комбинация стихий: заклинание `then`, принятое движком в течение окна после `first`,
 * усиливает свою атаку. Единый каталог для боя, панели подсказок, Академии и PvP.
 * Это не серия качественных жестов (grades.ts: COMBO) — другая механика.
 */
export interface ComboDef {
  id: ComboId;
  name: string;
  first: SpellId;
  then: SpellId;
  /** Бонус урона завершающей атаки (сразу в снаряде). */
  bonusDamage: number;
  /** Доля урона сквозь щит не ниже этой («Шторм»). */
  pierce?: number;
  /** Прибавка к пробитию завершающей атаки («Плазма»); итог не выше 100%. */
  pierceBonus?: number;
  /** Поджигает цель («Огненный вихрь»). */
  burn?: boolean;
  /**
   * «Паровой взрыв»: условие проверяется при попадании завершающей атаки в тело (не в щит).
   * Цель горит — горение снимается, разовый урон и оглушение. Не горит — обычный лёд.
   */
  steam?: { bonusDamage: number; stunMs: number };
  /** Своя перезарядка комбинации (обычные заклинания в это время доступны). */
  cooldownMs: number;
  /** Коротко для подсказок, тостов и Академии. */
  effect: string;
  /** Особое условие (если есть). */
  condition?: string;
}

export const COMBO_CONFIG = {
  /** Окно между принятыми кастами первого и второго заклинания. */
  windowMs: 2200,
};

export const COMBOS: ComboDef[] = [
  {
    id: 'storm',
    name: 'Шторм',
    first: 'ice',
    then: 'lightning',
    bonusDamage: 15,
    pierce: 0.5,
    cooldownMs: 6000,
    effect: '+15 урона, половина проходит сквозь щит',
  },
  {
    id: 'firestorm',
    name: 'Огненный вихрь',
    first: 'fireball',
    then: 'wind',
    bonusDamage: 10,
    burn: true,
    cooldownMs: 6000,
    effect: '+10 урона и поджог',
  },
  {
    id: 'steam',
    name: 'Паровой взрыв',
    first: 'fireball',
    then: 'ice',
    bonusDamage: 0,
    steam: { bonusDamage: 18, stunMs: 1200 },
    cooldownMs: 8000,
    effect: 'гасит горение: +18 урона и оглушение 1,2 с',
    condition: 'Цель должна гореть, когда лёд попадёт (не в щит)',
  },
  {
    id: 'plasma',
    name: 'Плазма',
    first: 'fireball',
    then: 'lightning',
    bonusDamage: 12,
    pierceBonus: 0.3,
    cooldownMs: 7000,
    effect: '+12 урона, пробитие щита +30%',
  },
];

export const COMBO_BY_ID = Object.fromEntries(COMBOS.map((c) => [c.id, c])) as Record<ComboId, ComboDef>;

/** Стихийные статусы. */
export const STATUS = {
  /** Горение от огненного шара: урон в секунду и длительность; снимается льдом или лечением. */
  burnDps: 2,
  burnMs: 3000,
  /** Ветер сдувает вражеские снаряды в полёте, теряя долю силы за каждый. */
  windAbsorbLoss: 1 / 3,
};

localize(COMBOS);
