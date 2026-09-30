import { ASSETS } from '../../game/data/assets';
import { SURVIVAL, survivalLevel, waveCoins } from '../../game/data/survival';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { AssetImg } from '../AssetImg';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';
import { plural, tr } from '../../i18n';

const PREVIEW_WAVES = [1, 2, 3, 4, 5];

/** Башня выживания: волна за волной, HP переносится, монеты — за каждую пройденную волну. */
export function Survival() {
  const { go, startSurvival } = useGame();
  const best = useSave((s) => s.survivalBest ?? 0);

  return (
    <ScreenShell className="survival">
      <CoinBadge />
      <h2 className="screen-title">🗼 {tr('Башня выживания', 'Survival Tower')}</h2>
      <div className="results-grid">
        <section className="card">
          <h3>{tr('Правила', 'Rules')}</h3>
          <ul className="advice-list">
            <li>{tr('Враги идут волнами без конца — после 10-й волны круг повторяется, но сильнее.', 'Enemies come in endless waves — after wave 10 the cycle repeats, stronger.')}</li>
            <li>
              {tr(
                `HP не восстанавливается полностью: между волнами только +${SURVIVAL.healBetween} HP.`,
                `HP is not fully restored: only +${SURVIVAL.healBetween} HP between waves.`,
              )}
            </li>
            <li>
              {tr(
                `Монеты за каждую пройденную волну (волна N — ${waveCoins(1) - 5} + 5·N), бонус за точность до +50%.`,
                `Coins for every cleared wave (wave N — ${waveCoins(1) - 5} + 5·N), up to +50% for accuracy.`,
              )}
            </li>
            <li>{tr('Пауза работает. Выход в меню завершает забег без награды.', 'Pause works. Quitting to the menu ends the run with no reward.')}</li>
          </ul>
          <p className="found">
            {tr('Твой рекорд', 'Your best')}: {best ? plural(best, ['волна', 'волны', 'волн'], ['wave', 'waves']) : tr('ещё нет', 'none yet')}
          </p>
          <DwellButton className="btn-primary" onSelect={startSurvival}>
            ⚔️ {tr('Начать забег', 'Start run')}
          </DwellButton>
        </section>
        <section className="card">
          <h3>{tr('Первые волны', 'First waves')}</h3>
          <ol className="survival-waves">
            {PREVIEW_WAVES.map((w) => {
              const l = survivalLevel(w);
              return (
                <li key={w}>
                  <AssetImg src={ASSETS.enemy(l.portraitOf ?? l.id)} fallback={l.enemyPortrait} className="survival-portrait" />
                  <span>
                    <b>{w}.</b> {l.enemyName} <small className="muted">HP {l.hp} · 🪙 {waveCoins(w)}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <DwellButton onSelect={() => go('menu')}>← {tr('В меню', 'Menu')}</DwellButton>
    </ScreenShell>
  );
}
