import { LEVELS, type LevelDef } from './levels';
import { tr } from '../../i18n';

/** Башня выживания: бесконечные волны, HP игрока переносится между волнами. Данные, не код. */
export const SURVIVAL = {
  /** Сколько HP восстанавливается между волнами. */
  healBetween: 25,
  /** Каждые 10 волн враги проходят круг заново, но сильнее. */
  cycleHpMul: 0.25,
  cycleDmgMul: 0.15,
  cycleSpeedMul: 0.9,
  minCastInterval: 900,
};

/** Монеты за пройденную волну. */
export const waveCoins = (wave: number) => 15 + 5 * wave;

/** Монеты за забег: сумма по пройденным волнам с бонусом за точность до +50%. */
export function survivalCoins(wavesCleared: number, accuracy: number) {
  let sum = 0;
  for (let w = 1; w <= wavesCleared; w++) sum += waveCoins(w);
  return Math.round(sum * (1 + 0.5 * Math.max(0, Math.min(1, accuracy))));
}

/** Враг волны: уровни кампании по кругу, первый круг чуть слабее, каждый следующий — сильнее. */
export function survivalLevel(wave: number): LevelDef {
  const base = LEVELS[(wave - 1) % LEVELS.length];
  const cycle = Math.floor((wave - 1) / LEVELS.length);
  return {
    ...base,
    name: tr(`Волна ${wave}`, `Wave ${wave}`),
    portraitOf: base.id,
    hp: Math.round(base.hp * 0.7 * (1 + SURVIVAL.cycleHpMul * cycle)),
    dmgMul: base.dmgMul * (1 + SURVIVAL.cycleDmgMul * cycle),
    castInterval: Math.max(SURVIVAL.minCastInterval, base.castInterval * SURVIVAL.cycleSpeedMul ** cycle),
    reward: 0,
  };
}
