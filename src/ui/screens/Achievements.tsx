import { useState } from 'react';
import { ACHIEVEMENTS, achievementCount, MAGE_RANKS, rankFor } from '../../game/achievements';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';
import { localize, tr } from '../../i18n';

const CHAPTERS = [
  { name: 'Первые искры', subtitle: 'Каждое великое приключение начинается с одного жеста.', scenery: '✦ Лес пробуждения ✦' },
  { name: 'Испытание стихий', subtitle: 'Оттачивай точность и докажи своё мастерство.', scenery: '✦ Кристальные вершины ✦' },
  { name: 'Легенда о маге', subtitle: 'Пройди через портал и завоюй трон Архимага.', scenery: '✦ Цитадель магов ✦' },
  { name: 'Искусство боя', subtitle: 'Комбо, парирования и руны — оружие настоящего мастера.', scenery: '✦ Зал поединков ✦' },
  { name: 'Испытания воли', subtitle: 'Сражайся без брони, с мутаторами и каждый день.', scenery: '✦ Пылающие пустоши ✦' },
  { name: 'Бесконечная башня', subtitle: 'Звёзды кампании и волны, которым нет конца.', scenery: '✦ Шпиль вечности ✦' },
];
localize(CHAPTERS);

export function Achievements() {
  const save = useSave();
  const go = useGame((s) => s.go);
  const awards = save.achievements ?? {};
  const count = achievementCount(awards);
  const rank = rankFor(count);
  const nextRank = MAGE_RANKS.find((r) => r.required > count);
  const firstMissing = ACHIEVEMENTS.findIndex((a) => !Object.hasOwn(awards, a.id));
  const [chapter, setChapter] = useState(() => firstMissing < 0 ? CHAPTERS.length - 1 : Math.floor(firstMissing / 3));
  const story = CHAPTERS[chapter];

  return (
    <ScreenShell className="achievements">
      <header className="journey-header">
        <div><p className="reward-eyebrow">{tr('Твоя история в SPELLHAND', 'Your SPELLHAND story')}</p><h1>{tr('Путь мага', 'Path of the Mage')}</h1></div>
        <div className="journey-rank"><span aria-hidden="true">{rank.icon}</span><div><small>{tr('Твоё звание', 'Your rank')}</small><strong>{rank.name}</strong></div></div>
      </header>

      <section className="journey-summary" aria-label={tr('Прогресс достижений', 'Achievement progress')}>
        <div><b>{count} / {ACHIEVEMENTS.length} {tr('достижений', 'achievements')}</b><span>{nextRank ? tr(`До звания «${nextRank.name}»: ещё ${nextRank.required - count}`, `To “${nextRank.name}”: ${nextRank.required - count} more`) : tr('Все звания получены. Ты — Архимаг!', 'All ranks earned. You are an Archmage!')}</span></div>
        <progress value={count} max={ACHIEVEMENTS.length} aria-label={tr('Полученные достижения', 'Achievements earned')} />
        <div className="journey-ranks">
          {MAGE_RANKS.filter((r) => r.required > 0).map((r) => (
            <span key={r.id} className={count >= r.required ? 'rank-earned' : ''} title={`${r.name}: ${r.required} ${tr('достижений', 'achievements')}`}>
              {r.icon} {r.name} <small>{r.required}</small>
            </span>
          ))}
        </div>
      </section>

      <section className={`journey-map journey-chapter-${chapter}`} aria-label={`${tr('Участок', 'Section')} ${chapter + 1}: ${story.name}`}>
        <div className="journey-map-heading"><span>{tr('Глава', 'Chapter')} 0{chapter + 1}</span><h2>{story.name}</h2><p>{story.subtitle}</p></div>
        <div className="journey-trail">
          <svg className="journey-road" viewBox="0 0 600 440" preserveAspectRatio="none" aria-hidden="true">
            <path className="road-shadow" d="M72 0 L72 80 C72 155 528 145 528 220 S72 285 72 360 L72 440" />
            <path className="road-surface" d="M72 0 L72 80 C72 155 528 145 528 220 S72 285 72 360 L72 440" />
            <path className="road-dashes" d="M72 0 L72 80 C72 155 528 145 528 220 S72 285 72 360 L72 440" />
          </svg>
          <ol className="journey-stops" start={chapter * 3 + 1}>
            {ACHIEVEMENTS.slice(chapter * 3, chapter * 3 + 3).map((a, i) => {
              const earned = Object.hasOwn(awards, a.id);
              const current = earned ? a.target : Math.max(0, Math.min(a.target, a.progress(save)));
              return (
                <li key={a.id} className={`journey-stop ${i % 2 ? 'stop-right' : ''} ${earned ? 'stop-earned' : 'stop-pending'}`} style={{ top: `${(80 + i * 140) / 440 * 100}%` }}>
                  <div className="journey-medal" aria-hidden="true"><span>{a.icon}</span><b>{earned ? '✓' : chapter * 3 + i + 1}</b></div>
                  <div className="journey-card">
                    <span className="journey-status">{earned ? tr('✦ Получено', '✦ Earned') : tr('Впереди приключение', 'Adventure ahead')}</span>
                    <h3>{a.name}</h3><p>{a.description}</p>
                    <div className="journey-card-progress"><progress value={current} max={a.target} aria-label={a.name} /><span>{current}/{a.target}{a.unit ?? ''}</span></div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="journey-scenery" aria-hidden="true">{story.scenery}</div>
      </section>

      <nav className="journey-nav" aria-label={tr('Навигация по дороге достижений', 'Achievement road navigation')}>
        <DwellButton disabled={chapter === 0} onSelect={() => setChapter((p) => Math.max(0, p - 1))}>← {tr('Назад', 'Back')}</DwellButton>
        <span>{chapter + 1} / {CHAPTERS.length}</span>
        <DwellButton disabled={chapter === CHAPTERS.length - 1} onSelect={() => setChapter((p) => Math.min(CHAPTERS.length - 1, p + 1))}>{tr('Дальше', 'Next')} →</DwellButton>
        <DwellButton onSelect={() => go('menu')}>🏠 {tr('В меню', 'Menu')}</DwellButton>
      </nav>
      <p className="journey-note">{tr('Выполняй условия в любом порядке. Новые достижения и звания присваиваются автоматически.', 'Complete goals in any order. New achievements and ranks are awarded automatically.')}</p>
    </ScreenShell>
  );
}
