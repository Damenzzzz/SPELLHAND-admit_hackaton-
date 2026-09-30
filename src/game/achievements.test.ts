import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementCount, evaluateAchievements, longestDailyStreak, rankFor } from './achievements';
import { totalStars } from './stars';
import { EMPTY_FEATS, type SaveData } from '../store/saveStore';

const fresh = (): SaveData => ({
  coins: 0, unlocked: 1, owned: ['staff_apprentice', 'shield_basic'],
  equipped: { staff: 'staff_apprentice', shield: 'shield_basic' }, records: {},
  learned: [], palmSign: 1, nickname: 'Маг', online: { wins: 0, losses: 0 },
});
const victory = { wins: 1, bestAccuracy: 0.9, bestTimeMs: 20000 };

describe('достижения и звания', () => {
  it('не выдаёт награды новому игроку за стартовую экипировку', () => {
    expect(evaluateAchievements(fresh(), 100).notices).toEqual([]);
    expect(rankFor(0).name).toBe('Путник');
  });
  it('выдаёт достижение и звание по очереди, без повторов после перезагрузки', () => {
    const save = { ...fresh(), records: { 1: { ...victory, bestAccuracy: 0.8 } } };
    const result = evaluateAchievements(save, 100);
    expect(result.notices.map((n) => n.id)).toEqual(['first_win', 'apprentice']);
    expect(result.unlocked.first_win).toBe(100);
    expect(evaluateAchievements({ ...save, achievements: result.unlocked }, 200).notices).toEqual([]);
  });
  it('восстанавливает достижения старого сохранения и все пройденные звания', () => {
    const save: SaveData = {
      ...fresh(), learned: ['fireball', 'ice', 'lightning', 'wind', 'heal', 'shield'],
      owned: ['staff_apprentice', 'shield_basic', 'staff_oak'],
      records: { 1: { ...victory, wins: 3 }, 5: victory, 10: victory },
      online: { wins: 1, losses: 0 },
    };
    const result = evaluateAchievements(save, 100);
    expect(achievementCount(result.unlocked)).toBe(9);
    expect(result.notices.filter((n) => n.kind === 'rank').map((n) => n.name))
      .toEqual(['Ученик', 'Адепт', 'Маг', 'Мастер стихий', 'Архимаг']);
  });
  it('не засчитывает 89.9% как 90%, поражение или бой с призраком как онлайн-победу', () => {
    const save = fresh();
    save.coins = 200;
    save.records = { 1: { ...victory, bestAccuracy: 0.899 } };
    let result = evaluateAchievements(save, 100);
    expect(result.unlocked).not.toHaveProperty('precision');
    expect(result.unlocked).not.toHaveProperty('online_win');
    save.records = { 1: { ...victory, wins: 0 } };
    result = evaluateAchievements(save, 100);
    expect(result.notices).toEqual([]);
  });
  it('сохраняет полученное достижение, даже если исходные данные изменились', () => {
    const result = evaluateAchievements({ ...fresh(), achievements: { precision: 0 } }, 100);
    expect(result.unlocked.precision).toBe(0);
    expect(result.notices).toEqual([]);
    expect(achievementCount({ precision: 0, unknown_future_id: 1 })).toBe(1);
  });
  it('покупка засчитывается один раз, переэкипировка не выдаёт награду повторно', () => {
    const save = { ...fresh(), owned: [...fresh().owned, 'staff_oak'] };
    const result = evaluateAchievements(save, 100);
    expect(result.unlocked).toHaveProperty('first_purchase');
    expect(evaluateAchievements({ ...save, achievements: result.unlocked, equipped: { staff: 'staff_oak', shield: 'shield_basic' } }, 200).notices).toEqual([]);
  });
});

describe('новые достижения', () => {
  it('засчитывают приёмы, звёзды, мутаторы и выживание', () => {
    const records = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, { ...victory, stars: 3 }]));
    const save: SaveData = {
      ...fresh(), records, survivalBest: 10,
      feats: { combos: 5, parries: 5, runes: ['meteor', 'chain', 'prison', 'sphere', 'mend'], noShieldWins: 1, maxMutatorsWin: 3, dailyDays: [] },
    };
    const ids = Object.keys(evaluateAchievements(save, 1).unlocked);
    for (const id of ['combo_master', 'parry_master', 'rune_scholar', 'no_shield', 'daredevil', 'star_gazer', 'survivor', 'unbreakable']) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain('daily_streak');
  });
  it('серия испытаний дня считается только по дням подряд', () => {
    expect(longestDailyStreak([])).toBe(0);
    expect(longestDailyStreak(['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02'])).toBe(3);
    expect(longestDailyStreak(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-01'])).toBe(3);
    const week = Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`);
    expect(ACHIEVEMENTS.find((a) => a.id === 'daily_streak')!.progress({ ...fresh(), feats: { ...EMPTY_FEATS, dailyDays: week } })).toBe(7);
  });
  it('старые рекорды без звёзд дают 1–2 звезды', () => {
    expect(totalStars({ 1: victory, 2: { ...victory, bestAccuracy: 0.5 }, 3: { ...victory, wins: 0 } })).toBe(3);
  });
});

it('подписка выдаёт награды сразу при изменении сохранения и не дублирует очередь', async () => {
  const { useSave, updateSave } = await import('../store/saveStore');
  const { startAchievements, useRewardNotices } = await import('../store/achievementStore');
  const previous = useSave.getState();
  useSave.setState(fresh(), true);
  useRewardNotices.setState({ queue: [] });
  const stop = startAchievements();
  try {
    updateSave({ learned: ['fireball'] });
    expect(useSave.getState().achievements).toHaveProperty('first_gesture');
    expect(useRewardNotices.getState().queue.map((n) => n.id)).toEqual(['first_gesture', 'apprentice']);
    updateSave({ coins: 100 });
    expect(useRewardNotices.getState().queue).toHaveLength(2);
    useRewardNotices.getState().dismiss();
    expect(useRewardNotices.getState().queue[0].kind).toBe('rank');
  } finally {
    stop();
    useSave.setState(previous, true);
    useRewardNotices.setState({ queue: [] });
  }
});
