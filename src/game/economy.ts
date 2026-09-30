import { updateSave, useSave } from '../store/saveStore';
import { LEVELS, LEVEL_BY_ID } from './data/levels';
import { ITEM_BY_ID, SHIELDS, STAFFS, type ShieldDef, type StaffDef } from './data/items';
import { survivalCoins } from './data/survival';
import { levelStars, starsFor } from './stars';

/**
 * Монеты за бой: 50 + 25·уровень, бонус за точность до +50%, повторная победа — половина.
 * mutatorBonus — сумма бонусов включённых мутаторов (0.3 = +30%).
 */
export function battleReward(level: number, won: boolean, accuracy: number, firstWin: boolean, mutatorBonus = 0): number {
  if (!won) return 0;
  const base = LEVEL_BY_ID[level].reward;
  const withAccuracy = base * (1 + 0.5 * Math.max(0, Math.min(1, accuracy))) * (1 + mutatorBonus);
  return Math.round(firstWin ? withAccuracy : withAccuracy * 0.5);
}

/** Записывает итог боя: монеты, открытие следующего уровня, рекорды и звёзды. hpLeft — доля HP (0..1). */
export function applyBattleResult(level: number, won: boolean, accuracy: number, durationMs: number, hpLeft = 0, mutatorBonus = 0) {
  const save = useSave.getState();
  const prev = save.records[level];
  const firstWin = won && !prev?.wins;
  const coins = battleReward(level, won, accuracy, firstWin, mutatorBonus);
  const newRecord = won && (!prev || accuracy > prev.bestAccuracy || durationMs < prev.bestTimeMs);
  const stars = starsFor(won, accuracy, hpLeft);
  const prevStars = levelStars(prev);

  if (won) {
    updateSave({
      coins: save.coins + coins,
      unlocked: Math.max(save.unlocked, Math.min(LEVELS.length, level + 1)),
      records: {
        ...save.records,
        [level]: {
          wins: (prev?.wins ?? 0) + 1,
          bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
          bestTimeMs: Math.min(prev?.bestTimeMs ?? Infinity, durationMs),
          stars: Math.max(prevStars, stars),
        },
      },
    });
  }
  return { coins, firstWin, newRecord, stars, newStars: Math.max(0, stars - prevStars) };
}

/** Башня выживания: монеты за пройденные волны, рекорд волн. */
export function applySurvivalResult(wavesCleared: number, accuracy: number) {
  const save = useSave.getState();
  const coins = survivalCoins(wavesCleared, accuracy);
  const newRecord = wavesCleared > (save.survivalBest ?? 0);
  updateSave({ coins: save.coins + coins, ...(newRecord ? { survivalBest: wavesCleared } : {}) });
  return { coins, firstWin: false, newRecord };
}

/** Повторная победа в испытании дня того же дня — доля награды (как повтор уровня кампании). */
export const DAILY_REPLAY_MUL = 0.5;

/**
 * Испытание дня: полная награда — за первую победу дня, повторы в тот же день — половина.
 * Раньше каждая победа платила полностью, и повтор лёгкого испытания был самым выгодным
 * заработком в игре (~430 монет/мин против 130–260 у повторов кампании).
 */
export function applyDailyResult(day: string, won: boolean, accuracy: number, reward: number) {
  const save = useSave.getState();
  const firstWin = won && save.dailyRewardedOn !== day;
  const full = won ? reward * (1 + 0.5 * Math.max(0, Math.min(1, accuracy))) : 0;
  const coins = Math.round(firstWin ? full : full * DAILY_REPLAY_MUL);
  updateSave({ coins: save.coins + coins, ...(firstWin ? { dailyRewardedOn: day } : {}) });
  return { coins, firstWin, newRecord: false };
}

/** Онлайн/призрак: без рекордов кампании, награда за победу с бонусом за точность. */
export function applyOnlineResult(won: boolean, accuracy: number, reward: number, live: boolean) {
  const save = useSave.getState();
  const coins = won ? Math.round(reward * (1 + 0.5 * Math.max(0, Math.min(1, accuracy)))) : 0;
  updateSave({
    coins: save.coins + coins,
    online: live
      ? { wins: save.online.wins + (won ? 1 : 0), losses: save.online.losses + (won ? 0 : 1) }
      : save.online,
  });
  return { coins, firstWin: false, newRecord: false };
}

export function buyItem(id: string): boolean {
  const item = ITEM_BY_ID[id];
  const save = useSave.getState();
  if (!item || save.owned.includes(id) || save.coins < item.price) return false;
  updateSave({ coins: save.coins - item.price, owned: [...save.owned, id] });
  equipItem(id);
  return true;
}

export function equipItem(id: string) {
  const item = ITEM_BY_ID[id];
  const save = useSave.getState();
  if (!item || !save.owned.includes(id)) return;
  updateSave({ equipped: { ...save.equipped, [item.kind]: id } });
}

export interface Loadout {
  staff: StaffDef;
  shield: ShieldDef;
}

export function currentLoadout(): Loadout {
  const { equipped } = useSave.getState();
  return {
    staff: STAFFS.find((s) => s.id === equipped.staff) ?? STAFFS[0],
    shield: SHIELDS.find((s) => s.id === equipped.shield) ?? SHIELDS[0],
  };
}
