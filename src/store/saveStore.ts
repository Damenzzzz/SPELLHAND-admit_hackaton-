import { create } from 'zustand';
import type { GestureId } from '../gestures/types';
import type { SessionRecord } from '../game/progress';
import type { PersonalModel } from '../gestures/personal';
import { randomNick } from '../net/nick';

const KEY = 'spellhand.save.v1';

export interface LevelRecord {
  wins: number;
  bestAccuracy: number;
  bestTimeMs: number;
}

export interface SaveData {
  coins: number;
  /** Максимальный открытый уровень (1..10). */
  unlocked: number;
  owned: string[];
  equipped: { staff: string; shield: string };
  records: Record<number, LevelRecord>;
  /** Жесты, изученные в академии. */
  learned: GestureId[];
  /** Знак нормали ладони, найденный калибровкой. */
  palmSign: 1 | -1;
  /** Ник для онлайна и лидерборда. */
  nickname: string;
  /** Итоги онлайн-боёв. */
  online: { wins: number; losses: number };
  /** Персональная калибровка жестов (образцы формы руки). */
  personal?: PersonalModel;
  /** История сессий для «Тренера». */
  history?: SessionRecord[];
  /** Рекорд разминки. */
  rushBest?: number;
  /** Лучший результат испытания дня. */
  dailyBest?: { id: string; score: number };
  /** Жесты всем телом (Pose Landmarker). По умолчанию выключены (Академия → «Тело»). */
  poseEnabled?: boolean;
}

const DEFAULT_SAVE: SaveData = {
  coins: 0,
  unlocked: 1,
  owned: ['staff_apprentice', 'shield_basic'],
  equipped: { staff: 'staff_apprentice', shield: 'shield_basic' },
  records: {},
  learned: [],
  palmSign: 1,
  nickname: randomNick(),
  online: { wins: 0, losses: 0 },
};

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SAVE;
    return { ...DEFAULT_SAVE, ...(JSON.parse(raw) as Partial<SaveData>) };
  } catch {
    return DEFAULT_SAVE;
  }
}

export const useSave = create<SaveData>(() => load());

useSave.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // приватный режим / квота — играем без сохранения
  }
});

export const updateSave = (patch: Partial<SaveData> | ((s: SaveData) => Partial<SaveData>)) =>
  useSave.setState(patch);
