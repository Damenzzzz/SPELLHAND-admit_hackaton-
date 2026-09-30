import { create } from 'zustand';
import { evaluateAchievements, type RewardNotice } from '../game/achievements';
import { updateSave, useSave } from './saveStore';

export const useRewardNotices = create<{ queue: RewardNotice[]; dismiss: () => void }>((set) => ({
  queue: [],
  dismiss: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

/** One app-wide subscription covers purchases, training and all campaign results. */
export function startAchievements() {
  const check = () => {
    const result = evaluateAchievements(useSave.getState(), Date.now());
    if (!result.notices.length) return;
    // Commit first: nested subscriptions and later reloads must not award twice.
    updateSave({ achievements: result.unlocked });
    useRewardNotices.setState((s) => ({ queue: [...s.queue, ...result.notices] }));
  };
  const unsubscribe = useSave.subscribe(check);
  check();
  return unsubscribe;
}
