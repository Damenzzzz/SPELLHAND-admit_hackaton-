import type { SpellId } from '../../gestures/types';
import { LEVEL_BY_ID, type LevelDef } from './levels';

/** Модификатор испытания дня — данные, а не код. */
interface DailyModifier {
  id: string;
  text: string;
  apply: (l: LevelDef) => LevelDef;
  /** Разрешённые заклинания игрока (нет — все). */
  allowed?: SpellId[];
}

const MODIFIERS: DailyModifier[] = [
  { id: 'fire_only', text: 'Только огонь и щит', apply: (l) => l, allowed: ['fireball'] },
  { id: 'no_fire', text: 'Без огня — лёд, молния и ветер', apply: (l) => l, allowed: ['ice', 'lightning', 'wind', 'heal'] },
  { id: 'fast_enemy', text: 'Враг колдует на 25% быстрее', apply: (l) => ({ ...l, castInterval: l.castInterval * 0.75 }) },
  { id: 'short_telegraph', text: 'Телеграф врага вдвое короче — щит только на реакцию', apply: (l) => ({ ...l, telegraphMs: l.telegraphMs * 0.5 }) },
  { id: 'tank', text: 'У врага +50% HP', apply: (l) => ({ ...l, hp: Math.round(l.hp * 1.5) }) },
  { id: 'glass', text: 'Оба бьют вдвое сильнее', apply: (l) => ({ ...l, dmgMul: l.dmgMul * 2 }) },
  { id: 'shielder', text: 'Враг прячется за щитом — пробивай молнией и ветром', apply: (l) => ({ ...l, shieldChance: 0.6, shieldReact: 0.8 }) },
];

/** Детерминированный RNG из даты — у всех игроков одно и то же испытание. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export interface DailyChallenge {
  /** YYYY-MM-DD по UTC. */
  id: string;
  level: LevelDef;
  modifier: DailyModifier;
}

export const todayId = (d = new Date()) => d.toISOString().slice(0, 10);

export function dailyChallenge(id = todayId()): DailyChallenge {
  const rnd = seeded(`spellhand-${id}`);
  const base = LEVEL_BY_ID[3 + Math.floor(rnd() * 7)]; // уровни 3–9: есть что показать
  const modifier = MODIFIERS[Math.floor(rnd() * MODIFIERS.length)];
  const level = { ...modifier.apply(base), id: 0, name: `Испытание дня ${id}` };
  return { id, level, modifier };
}

/** Очки испытания: победа, точность жестов и скорость. */
export const dailyScore = (won: boolean, accuracy: number, durationMs: number) =>
  won ? Math.round(1000 * accuracy + Math.max(0, 120 - durationMs / 1000) * 5) : Math.round(300 * accuracy);
