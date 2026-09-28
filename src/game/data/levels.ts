import type { SpellId } from '../../gestures/types';

export interface LevelDef {
  id: number;
  name: string;
  enemyName: string;
  /** Портрет врага (заглушка-эмодзи до Фазы 3). */
  enemyPortrait: string;
  arena: string;
  hp: number;
  /** Множитель урона врага. */
  dmgMul: number;
  spellWeights: Partial<Record<SpellId, number>>;
  castInterval: number;
  telegraphMs: number;
  /** Шанс поставить щит в каждом цикле. */
  shieldChance: number;
  /** Шанс поставить щит в ответ на заряд игрока. */
  shieldReact: number;
  reward: number;
  boss?: {
    /** Щит отражает долю урона обратно. */
    reflect?: number;
    /** Вторая фаза на 50% HP: ускорение и одно лечение. */
    enrage?: { heal: number; speedMul: number };
  };
}

const reward = (level: number) => 50 + 25 * level;

export const LEVELS: LevelDef[] = [
  { id: 1, name: 'Опушка', enemyName: 'Ученик-отступник', enemyPortrait: '🧙', arena: 'forest', hp: 60, dmgMul: 0.6, spellWeights: { fireball: 1 }, castInterval: 3000, telegraphMs: 1200, shieldChance: 0, shieldReact: 0, reward: reward(1) },
  { id: 2, name: 'Старый мост', enemyName: 'Огненный бес', enemyPortrait: '👺', arena: 'bridge', hp: 80, dmgMul: 0.65, spellWeights: { fireball: 1 }, castInterval: 3000, telegraphMs: 1200, shieldChance: 0, shieldReact: 0, reward: reward(2) },
  { id: 3, name: 'Ледяная пещера', enemyName: 'Снежная ведьма', enemyPortrait: '🧝‍♀️', arena: 'cave', hp: 90, dmgMul: 0.7, spellWeights: { fireball: 1, ice: 1 }, castInterval: 2700, telegraphMs: 1100, shieldChance: 0.2, shieldReact: 0.1, reward: reward(3) },
  { id: 4, name: 'Туманное болото', enemyName: 'Болотный шаман', enemyPortrait: '🧌', arena: 'swamp', hp: 100, dmgMul: 0.75, spellWeights: { fireball: 1, ice: 1.2 }, castInterval: 2500, telegraphMs: 1000, shieldChance: 0.2, shieldReact: 0.2, reward: reward(4) },
  { id: 5, name: 'Башня Зеркал', enemyName: 'Зеркальный страж', enemyPortrait: '🗿', arena: 'tower', hp: 150, dmgMul: 0.8, spellWeights: { fireball: 1, ice: 1 }, castInterval: 2400, telegraphMs: 1000, shieldChance: 0.25, shieldReact: 0.3, reward: reward(5), boss: { reflect: 0.2 } },
  { id: 6, name: 'Грозовой утёс', enemyName: 'Громовой жрец', enemyPortrait: '🧛', arena: 'cliff', hp: 120, dmgMul: 0.85, spellWeights: { fireball: 1, ice: 0.8, lightning: 0.8 }, castInterval: 2000, telegraphMs: 900, shieldChance: 0.25, shieldReact: 0.35, reward: reward(6) },
  { id: 7, name: 'Пустошь ветров', enemyName: 'Кочевник бурь', enemyPortrait: '🥷', arena: 'wastes', hp: 130, dmgMul: 0.9, spellWeights: { fireball: 1, ice: 0.8, lightning: 0.6, wind: 0.8 }, castInterval: 1850, telegraphMs: 800, shieldChance: 0.3, shieldReact: 0.4, reward: reward(7) },
  { id: 8, name: 'Некрополь', enemyName: 'Лич', enemyPortrait: '💀', arena: 'crypt', hp: 140, dmgMul: 0.95, spellWeights: { fireball: 1, ice: 1, lightning: 0.9, wind: 0.7 }, castInterval: 1650, telegraphMs: 700, shieldChance: 0.3, shieldReact: 0.5, reward: reward(8) },
  { id: 9, name: 'Врата Бездны', enemyName: 'Демон-страж', enemyPortrait: '👹', arena: 'abyss', hp: 150, dmgMul: 1, spellWeights: { fireball: 1, ice: 0.9, lightning: 1, wind: 0.8 }, castInterval: 1400, telegraphMs: 600, shieldChance: 0.3, shieldReact: 0.6, reward: reward(9) },
  { id: 10, name: 'Трон Архимага', enemyName: 'Архимаг Морвен', enemyPortrait: '🧙‍♂️', arena: 'throne', hp: 200, dmgMul: 1.05, spellWeights: { fireball: 1, ice: 1, lightning: 1, wind: 1 }, castInterval: 1600, telegraphMs: 700, shieldChance: 0.3, shieldReact: 0.5, reward: reward(10), boss: { enrage: { heal: 40, speedMul: 0.7 } } },
];

export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l])) as Record<number, LevelDef>;
