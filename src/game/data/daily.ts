import { LEVEL_BY_ID, type LevelDef } from './levels';
import { DAILY_POOL, type Modifier } from './modifiers';
import { tr } from '../../i18n';

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
  modifier: Modifier;
}

export const todayId = (d = new Date()) => d.toISOString().slice(0, 10);

export function dailyChallenge(id = todayId()): DailyChallenge {
  const rnd = seeded(`spellhand-${id}`);
  const base = LEVEL_BY_ID[3 + Math.floor(rnd() * 7)]; // уровни 3–9: есть что показать
  const modifier = DAILY_POOL[Math.floor(rnd() * DAILY_POOL.length)];
  // особые механики противников не переносим: модификатор дня может запретить контр-заклинание
  // (например, «без огня» против ледяной брони), а рейтинг дня должен оставаться сравнимым
  const level = { ...(modifier.apply?.(base) ?? base), trait: undefined, id: 0, name: tr(`Испытание дня ${id}`, `Daily challenge ${id}`) };
  return { id, level, modifier };
}

/** Очки испытания: победа, точность жестов и скорость. */
export const dailyScore = (won: boolean, accuracy: number, durationMs: number) =>
  won ? Math.round(1000 * accuracy + Math.max(0, 120 - durationMs / 1000) * 5) : Math.round(300 * accuracy);
