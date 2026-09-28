import { updateSave, useSave } from '../store/saveStore';
import { LEVELS, LEVEL_BY_ID } from './data/levels';
import { ITEM_BY_ID, SHIELDS, STAFFS, type ShieldDef, type StaffDef } from './data/items';

/** Монеты за бой: 50 + 25·уровень, бонус за точность до +50%, повторная победа — половина. */
export function battleReward(level: number, won: boolean, accuracy: number, firstWin: boolean): number {
  if (!won) return 0;
  const base = LEVEL_BY_ID[level].reward;
  const withAccuracy = base * (1 + 0.5 * Math.max(0, Math.min(1, accuracy)));
  return Math.round(firstWin ? withAccuracy : withAccuracy * 0.5);
}

/** Записывает итог боя: монеты, открытие следующего уровня, рекорды. */
export function applyBattleResult(level: number, won: boolean, accuracy: number, durationMs: number) {
  const save = useSave.getState();
  const prev = save.records[level];
  const firstWin = won && !prev?.wins;
  const coins = battleReward(level, won, accuracy, firstWin);
  const newRecord = won && (!prev || accuracy > prev.bestAccuracy || durationMs < prev.bestTimeMs);

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
        },
      },
    });
  }
  return { coins, firstWin, newRecord };
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
