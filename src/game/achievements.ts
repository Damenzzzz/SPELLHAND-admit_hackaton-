import { EMPTY_FEATS, type SaveData } from '../store/saveStore';
import { totalStars } from './stars';
import { localize, tr } from '../i18n';

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  target: number;
  progress: (save: SaveData) => number;
  unit?: string;
}

const wins = (s: SaveData) => Object.values(s.records).reduce((n, r) => n + r.wins, 0);
const learned = (s: SaveData) => new Set(s.learned).size;
const feats = (s: SaveData) => ({ ...EMPTY_FEATS, ...s.feats });

/** Самая длинная серия испытаний дня подряд (дни YYYY-MM-DD). */
export function longestDailyStreak(days: readonly string[]) {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev = NaN;
  for (const d of sorted) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = t - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/** Conditions are independent: the road is a collection, not an unlock gate. */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_gesture', name: 'Искра магии', icon: '✨', description: 'Изучи первый жест в Академии.', target: 1, progress: learned },
  { id: 'first_win', name: 'Первая победа', icon: '⚔️', description: 'Выиграй первый бой в кампании.', target: 1, progress: wins },
  { id: 'first_purchase', name: 'Магический арсенал', icon: '🔮', description: 'Купи любой посох или щит в магазине.', target: 1, progress: (s) => s.owned.filter((id) => id !== 'staff_apprentice' && id !== 'shield_basic').length },
  { id: 'precision', name: 'Точная магия', icon: '🎯', description: 'Победи в кампании с точностью жестов не ниже 90%.', target: 90, unit: '%', progress: (s) => Math.floor(Math.max(0, ...Object.values(s.records).filter((r) => r.wins > 0).map((r) => r.bestAccuracy)) * 100) },
  { id: 'all_gestures', name: 'Повелитель стихий', icon: '🔥', description: 'Изучи все шесть жестов в Академии.', target: 6, progress: learned },
  { id: 'five_wins', name: 'Опытный дуэлянт', icon: '🏅', description: 'Одержи пять побед в кампании. Повторные бои тоже считаются.', target: 5, progress: wins },
  { id: 'first_boss', name: 'Разбитое зеркало', icon: '💎', description: 'Победи Зеркального стража на пятом уровне.', target: 1, progress: (s) => s.records[5]?.wins ?? 0 },
  { id: 'online_win', name: 'За гранью портала', icon: '🌀', description: 'Победи живого игрока в онлайн-дуэли. Бой с Призраком не считается.', target: 1, progress: (s) => s.online.wins },
  { id: 'final_boss', name: 'Наследник трона', icon: '👑', description: 'Победи Архимага Морвена на десятом уровне.', target: 1, progress: (s) => s.records[10]?.wins ?? 0 },
  { id: 'combo_master', name: 'Стихийный аккорд', icon: '⛈️', description: 'Выполни 5 комбо: лёд → молния или огонь → ветер.', target: 5, progress: (s) => feats(s).combos },
  { id: 'parry_master', name: 'Зеркальная ладонь', icon: '🪞', description: 'Парируй 5 снарядов — сожми кулак в последний момент.', target: 5, progress: (s) => feats(s).parries },
  { id: 'rune_scholar', name: 'Знаток рун', icon: '✍️', description: 'Примени в бою каждую из пяти рун.', target: 5, progress: (s) => feats(s).runes.length },
  { id: 'no_shield', name: 'Без брони', icon: '💔', description: 'Победи в кампании, ни разу не подняв щит.', target: 1, progress: (s) => feats(s).noShieldWins },
  { id: 'daredevil', name: 'Сорвиголова', icon: '⚗️', description: 'Победи в кампании с тремя мутаторами одновременно.', target: 3, progress: (s) => feats(s).maxMutatorsWin },
  { id: 'daily_streak', name: 'Верность испытанию', icon: '📅', description: 'Сыграй испытание дня 7 дней подряд.', target: 7, unit: ' дн.', progress: (s) => longestDailyStreak(feats(s).dailyDays) },
  { id: 'star_gazer', name: 'Звездочёт', icon: '⭐', description: 'Собери 25 звёзд в кампании.', target: 25, unit: '★', progress: (s) => totalStars(s.records) },
  { id: 'survivor', name: 'Страж башни', icon: '🗼', description: 'Пройди 5 волн в башне выживания за один забег.', target: 5, progress: (s) => s.survivalBest ?? 0 },
  { id: 'unbreakable', name: 'Несокрушимый', icon: '🏰', description: 'Пройди 10 волн в башне выживания за один забег.', target: 10, progress: (s) => s.survivalBest ?? 0 },
];

export const MAGE_RANKS = [
  { id: 'novice', name: 'Путник', icon: '🌙', required: 0 },
  { id: 'apprentice', name: 'Ученик', icon: '✨', required: 1 },
  { id: 'adept', name: 'Адепт', icon: '🔮', required: 3 },
  { id: 'mage', name: 'Маг', icon: '🪄', required: 5 },
  { id: 'master', name: 'Мастер стихий', icon: '💠', required: 7 },
  { id: 'archmage', name: 'Архимаг', icon: '👑', required: 9 },
];

export const achievementCount = (unlocked: Record<string, number> = {}) =>
  ACHIEVEMENTS.filter((a) => Object.hasOwn(unlocked, a.id)).length;

export function rankFor(count: number) {
  return [...MAGE_RANKS].reverse().find((rank) => count >= rank.required) ?? MAGE_RANKS[0];
}

export interface RewardNotice {
  id: string;
  kind: 'achievement' | 'rank';
  name: string;
  icon: string;
  description: string;
}

/** Pure reconciliation also backfills old saves; previously earned rewards never disappear. */
export function evaluateAchievements(save: SaveData, now: number) {
  const unlocked = { ...save.achievements };
  const notices: RewardNotice[] = [];
  for (const a of ACHIEVEMENTS) {
    if (Object.hasOwn(unlocked, a.id) || a.progress(save) < a.target) continue;
    const before = achievementCount(unlocked);
    unlocked[a.id] = now;
    notices.push({ id: a.id, kind: 'achievement', name: a.name, icon: a.icon, description: a.description });
    for (const rank of MAGE_RANKS) {
      if (rank.required > before && rank.required <= before + 1) {
        notices.push({ id: rank.id, kind: 'rank', name: rank.name, icon: rank.icon, description: tr(`Получено достижений: ${before + 1} из ${ACHIEVEMENTS.length}`, `Achievements earned: ${before + 1} of ${ACHIEVEMENTS.length}`) });
      }
    }
  }
  return { unlocked, notices };
}

localize([ACHIEVEMENTS, MAGE_RANKS]);
