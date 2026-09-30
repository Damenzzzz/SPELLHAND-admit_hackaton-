import { ASSETS } from '../../game/data/assets';
import { LEVELS } from '../../game/data/levels';
import { achievementCount, ACHIEVEMENTS, rankFor } from '../../game/achievements';
import { setMusicOn } from '../../game/music';
import { MAX_STARS, totalStars } from '../../game/stars';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { AssetImg } from '../AssetImg';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';
import { updateSettings, useSettings } from '../../store/settingsStore';
import { num, tr } from '../../i18n';

/** Кампания в меню: текущий уровень, пройденные уровни и звёзды — из сохранения. */
function CampaignCard() {
  const { go, startBattle } = useGame();
  const unlocked = useSave((s) => s.unlocked);
  const records = useSave((s) => s.records);
  const cleared = LEVELS.filter((l) => records[l.id]?.wins).length;
  const allDone = cleared === LEVELS.length;
  const level = LEVELS[Math.min(unlocked, LEVELS.length) - 1];

  return (
    <section className="campaign-card" aria-labelledby="campaign-card-title">
      <div className="campaign-card-portrait" aria-hidden>
        <AssetImg src={ASSETS.enemy(level.id)} fallback={level.enemyPortrait} />
      </div>
      <div className="campaign-card-body">
        <div className="campaign-card-head">
          <h2 id="campaign-card-title">⚔️ {tr('Кампания', 'Campaign')}</h2>
          <span className="campaign-card-stars">
            ★ {totalStars(records)}/{LEVELS.length * MAX_STARS}
          </span>
        </div>
        <p className="campaign-card-level">
          {allDone
            ? tr('Все уровни пройдены — собери недостающие звёзды', 'All levels cleared — collect the missing stars')
            : `${tr('Уровень', 'Level')} ${level.id} · ${level.boss ? '👑 ' : ''}${level.enemyName}`}
        </p>
        <div className="campaign-card-progress">
          <div className="campaign-track" role="progressbar" aria-valuemin={0} aria-valuemax={LEVELS.length} aria-valuenow={cleared} aria-label={tr('Пройдено уровней', 'Levels cleared')}>
            {LEVELS.map((l) => (
              <span key={l.id} className={records[l.id]?.wins ? 'done' : l.id === level.id && !allDone ? 'current' : ''} />
            ))}
          </div>
          <small>{tr(`Пройдено ${cleared} из ${LEVELS.length}`, `${cleared} of ${LEVELS.length} cleared`)}</small>
        </div>
        <div className="campaign-card-actions">
          {allDone ? (
            <DwellButton className="btn-primary" onSelect={() => go('campaign')}>
              ★ {tr('Выбрать уровень', 'Choose a level')}
            </DwellButton>
          ) : (
            <>
              <DwellButton className="btn-primary" onSelect={() => startBattle(level.id)}>
                ▶ {cleared === 0 ? tr('Начать', 'Start') : tr('Продолжить', 'Continue')}
                <small>{tr('уровень', 'level')} {level.id}</small>
              </DwellButton>
              <DwellButton className="btn-quiet" onSelect={() => go('campaign')}>
                {tr('Все уровни и мутаторы', 'All levels & mutators')}
              </DwellButton>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function Menu() {
  const { go, openAcademy } = useGame();
  const learned = useSave((s) => s.learned.length);
  const survivalBest = useSave((s) => s.survivalBest ?? 0);
  const musicOn = useSave((s) => s.musicOn ?? true);
  const awards = useSave((s) => s.achievements);
  const count = achievementCount(awards);
  const rank = rankFor(count);
  const { menuControl, dwellMs, lang } = useSettings();

  return (
    <ScreenShell className="menu">
      <header className="topbar">
        <div className="topbar-group">
          <DwellButton className="chip-btn" pressed={musicOn} onSelect={() => setMusicOn(!musicOn, 'menu')}>
            <span aria-hidden>{musicOn ? '🎵' : '🔇'}</span>
            <span className="sr-only">{tr('Музыка', 'Music')}</span>
          </DwellButton>
          <DwellButton allowPointer className="chip-btn" onSelect={() => updateSettings({ lang: lang === 'en' ? 'ru' : 'en' })}>
            <span aria-hidden>🌐</span> {lang === 'en' ? 'RU' : 'EN'}
            <span className="sr-only"> — {tr('сменить язык', 'switch language')}</span>
          </DwellButton>
        </div>
        <CoinBadge />
      </header>
      <div className="menu-stage">
        <AssetImg src={ASSETS.logo} fallback="SPELLHAND" className="logo-img" alt="SPELLHAND" />
        <p className="menu-sub">
          {menuControl === 'pointer'
            ? tr('Нажимай кнопки мышью или касанием', 'Click buttons with a mouse or touch')
            : tr(
                `Наведи палец на кнопку на ${num(dwellMs / 1000, 1)} с${menuControl === 'both' ? ' или нажми мышью' : ''}`,
                `Point your finger at a button for ${num(dwellMs / 1000, 1)} s${menuControl === 'both' ? ' or click it' : ''}`,
              )}
        </p>
        <CampaignCard />
        <nav className="menu-buttons" aria-label={tr('Режимы', 'Modes')}>
          <DwellButton onSelect={() => openAcademy(null)}>
            <span className="btn-icon" aria-hidden>📖</span> {tr('Академия', 'Academy')} <small>{tr('изучено', 'learned')} {learned}/6</small>
          </DwellButton>
          <DwellButton onSelect={() => go('survival')}>
            <span className="btn-icon" aria-hidden>🗼</span> {tr('Башня выживания', 'Survival Tower')} {survivalBest > 0 && <small>{tr('рекорд', 'best')} {survivalBest}</small>}
          </DwellButton>
          <DwellButton onSelect={() => go('online')}>
            <span className="btn-icon" aria-hidden>🌐</span> {tr('Онлайн-дуэль', 'Online duel')}
          </DwellButton>
          <DwellButton onSelect={() => go('shop')}>
            <span className="btn-icon" aria-hidden>🛒</span> {tr('Магазин', 'Shop')}
          </DwellButton>
          <DwellButton onSelect={() => go('leaderboard')}>
            <span className="btn-icon" aria-hidden>🏆</span> {tr('Лидерборд', 'Leaderboard')}
          </DwellButton>
          <DwellButton onSelect={() => go('achievements')}>
            <span className="btn-icon" aria-hidden>🗺️</span> {tr('Достижения', 'Achievements')} <small>{rank.name} · {count}/{ACHIEVEMENTS.length}</small>
          </DwellButton>
          <DwellButton onSelect={() => go('rush')}>
            <span className="btn-icon" aria-hidden>⚡</span> {tr('Разминка', 'Warm-up')}
          </DwellButton>
          <DwellButton onSelect={() => go('daily')}>
            <span className="btn-icon" aria-hidden>📅</span> {tr('Испытание дня', 'Daily challenge')}
          </DwellButton>
        </nav>
        <nav className="menu-secondary" aria-label={tr('Инструменты', 'Tools')}>
          <DwellButton className="btn-quiet" onSelect={() => go('coach')}>
            <span className="btn-icon" aria-hidden>📈</span> {tr('Тренер', 'Coach')}
          </DwellButton>
          <DwellButton className="btn-quiet" onSelect={() => go('calibration')}>
            <span className="btn-icon" aria-hidden>🎯</span> {tr('Калибровка', 'Calibration')}
          </DwellButton>
          <DwellButton allowPointer className="btn-quiet" onSelect={() => go('settings')}>
            <span className="btn-icon" aria-hidden>⚙️</span> {tr('Настройки', 'Settings')}
          </DwellButton>
        </nav>
      </div>
    </ScreenShell>
  );
}
