import { useEffect } from 'react';
import { useRewardNotices } from '../store/achievementStore';
import { tr } from '../i18n';

export function AchievementToast() {
  const notice = useRewardNotices((s) => s.queue[0]);
  const remaining = useRewardNotices((s) => s.queue.length);
  const dismiss = useRewardNotices((s) => s.dismiss);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  return (
    <div className="reward-announcer" role="status" aria-live="polite" aria-atomic="true">
      {notice && (
        <div key={`${notice.kind}-${notice.id}`} className={`reward-toast reward-toast-${notice.kind}`}>
          <span className="reward-toast-icon" aria-hidden="true">{notice.icon}</span>
          <div>
            <div className="reward-eyebrow">{notice.kind === 'rank' ? tr('Новое звание получено!', 'New rank earned!') : tr('Достижение получено!', 'Achievement unlocked!')}</div>
            <strong>{notice.name}</strong>
            <p>{notice.description}</p>
            {remaining > 1 && <small>{tr('Следующих наград', 'More rewards')}: {remaining - 1}</small>}
          </div>
          <span className="reward-toast-timer" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
