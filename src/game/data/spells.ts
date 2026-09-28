import type { SpellId } from '../../gestures/types';

export interface SpellDef {
  id: SpellId;
  name: string;
  icon: string;
  /** Урон [мин, макс]: для огненного шара — от заряда, для остальных мин = макс. */
  damage: [number, number];
  mana: number;
  cooldownMs: number;
  /** Время полёта снаряда. */
  travelMs: number;
  /** Доля урона, проходящая сквозь щит (молния — 50%). */
  shieldPierce: number;
  /** Урон по прочности щита вместо обычного (ветер ломает щиты). */
  shieldDamage?: number;
  /** Замедление цели. */
  slow?: { factor: number; ms: number };
  /** Сбивает заряд/телеграф врага. */
  interrupt?: boolean;
  /** Лечение: всего HP за durationMs, пока держишь позу. */
  heal?: { amount: number; durationMs: number };
  /** Ледяные осколки: сколько ударов в серии. */
  hits?: number;
  flavor: string;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  fireball: {
    id: 'fireball',
    name: 'Огненный шар',
    icon: '🔥',
    damage: [18, 35],
    mana: 25,
    cooldownMs: 400,
    travelMs: 650,
    shieldPierce: 0,
    flavor: 'Заряжаемый burst: чем дольше держишь ладонь, тем больнее',
  },
  ice: {
    id: 'ice',
    name: 'Ледяные осколки',
    icon: '❄️',
    damage: [6, 6],
    hits: 3,
    mana: 20,
    cooldownMs: 1500,
    travelMs: 420,
    shieldPierce: 0,
    slow: { factor: 0.2, ms: 3000 },
    flavor: '3 осколка, замедляют каст врага на 20%',
  },
  lightning: {
    id: 'lightning',
    name: 'Молния',
    icon: '⚡',
    damage: [28, 28],
    mana: 40,
    cooldownMs: 4000,
    travelMs: 110,
    shieldPierce: 0.5,
    flavor: 'Мгновенная, пробивает 50% щита',
  },
  wind: {
    id: 'wind',
    name: 'Порыв ветра',
    icon: '🌪️',
    damage: [8, 8],
    mana: 25,
    cooldownMs: 3000,
    travelMs: 480,
    shieldPierce: 0,
    shieldDamage: 40,
    interrupt: true,
    flavor: 'Сбивает заряд врага и ломает щиты',
  },
  heal: {
    id: 'heal',
    name: 'Исцеление',
    icon: '💚',
    damage: [0, 0],
    mana: 35,
    cooldownMs: 8000,
    travelMs: 0,
    shieldPierce: 0,
    heal: { amount: 20, durationMs: 2000 },
    flavor: '+20 HP за 2 с, пока держишь (без щита)',
  },
};

export const COMBAT = {
  hp: 100,
  mana: 100,
  manaRegen: 12,
  /** Восстановление прочности опущенного щита в секунду. */
  shieldRegen: 15,
  /** Итоговый урон = база × (qualityBase + qualityK·quality). */
  qualityBase: 0.6,
  qualityK: 0.4,
  /** Бот держит щит столько мс. */
  botShieldMs: 1500,
};
