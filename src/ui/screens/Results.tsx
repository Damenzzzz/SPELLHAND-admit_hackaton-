import { useState } from 'react';
import { LEVELS, LEVEL_BY_ID } from '../../game/data/levels';
import { modifiersOf } from '../../game/data/modifiers';
import { starString } from '../../game/stars';
import { useSave } from '../../store/saveStore';
import { TEMPLATES, TEMPLATE_BY_ID } from '../../gestures/templates';
import { useGame } from '../../store/gameStore';
import { CoinBadge } from '../CoinBadge';
import { SpellIcon } from '../SpellIcon';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';
import { plural, tr } from '../../i18n';

const pct = (x: number) => `${Math.round(x * 100)}%`;

const times = (n: number) => plural(n, ['раз', 'раза', 'раз'], ['time', 'times']);

/** Итоги боя: точность, качество по спеллам, топ-3 ошибки и что тренировать. */
export function Results() {
  const { lastResult: r, startBattle, startSurvival, go, openAcademy } = useGame();
  const [shared, setShared] = useState<string | null>(null);
  const survivalBest = useSave((s) => s.survivalBest ?? 0);
  if (!r) return null;
  const campaign = r.mode === 'campaign';
  const level = LEVEL_BY_ID[r.level];
  const hasNext = campaign && r.won && r.level < LEVELS.length;
  const trainGesture = r.topErrors[0]?.gesture;

  return (
    <ScreenShell className="results">
      <CoinBadge />
      <h1 className={`results-title ${r.won || r.mode === 'survival' ? 'win' : 'lose'}`}>
        {r.mode === 'survival'
          ? `🗼 ${tr('Волн', 'Waves')}: ${r.wavesCleared ?? 0}`
          : r.won
            ? tr('Победа!', 'Victory!')
            : tr('Поражение', 'Defeat')}
      </h1>
      <p className="menu-sub">
        {campaign
          ? `${tr('Уровень', 'Level')} ${level.id} · ${level.name} · ${level.enemyName}`
          : r.mode === 'survival'
            ? tr(
                `Башня выживания · пройдено волн: ${r.wavesCleared ?? 0} · рекорд: ${survivalBest}`,
                `Survival Tower · waves cleared: ${r.wavesCleared ?? 0} · best: ${survivalBest}`,
              )
            : r.mode === 'online'
            ? tr(`Онлайн-дуэль с игроком «${r.opponent}»`, `Online duel with “${r.opponent}”`)
            : r.mode === 'daily'
              ? tr(`Испытание дня · ${r.dailyScore ?? 0} очков`, `Daily challenge · ${r.dailyScore ?? 0} pts`)
              : tr('Соперник не нашёлся — бой с Призраком мага', 'No opponent found — battle with the Mage Ghost')}
      </p>

      {campaign && r.won && r.stars !== undefined && (
        <div className="results-stars" aria-label={tr(`Звёзд: ${r.stars} из 3`, `Stars: ${r.stars} of 3`)}>
          {starString(r.stars)}
          {r.newStars ? <small> +{r.newStars} ★ {tr('новых', 'new')}</small> : null}
        </div>
      )}
      {campaign && r.mutators && r.mutators.length > 0 && (
        <p className="muted">⚗️ {tr('Мутаторы', 'Mutators')}: {modifiersOf(r.mutators).map((m) => `${m.icon} ${m.text}`).join(' · ')}</p>
      )}

      <div className="results-grid">
        <section className="card">
          <div className="stat-row">
            <div className="stat">
              <b>{pct(r.accuracy)}</b>
              <span>{tr('точность жестов', 'gesture accuracy')}</span>
            </div>
            <div className="stat">
              <b>
                {r.casts}/{r.attempts}
              </b>
              <span>{tr('удачных попыток', 'successful attempts')}</span>
            </div>
            <div className="stat">
              <b>
                {(r.durationMs / 1000).toFixed(0)} {tr('с', 's')}
              </b>
              <span>{tr('длительность', 'duration')}</span>
            </div>
            <div className="stat">
              <b className="gold">+{r.coins}</b>
              <span>{r.won && !r.firstWin && (campaign || r.mode === 'daily') ? tr('монет (повтор ×0.5)', 'coins (replay ×0.5)') : tr('монет', 'coins')}</span>
            </div>
          </div>
          {r.newRecord && (
            <div className="record-badge">{r.mode === 'survival' ? tr('🏆 Новый рекорд башни!', '🏆 New tower record!') : tr('🏆 Новый рекорд уровня!', '🏆 New level record!')}</div>
          )}

          <h3>{tr('Качество по заклинаниям', 'Quality by spell')}</h3>
          <div className="quality-list">
            {TEMPLATES.filter((t) => r.perSpell[t.id]).map((t) => {
              const s = r.perSpell[t.id]!;
              return (
                <div key={t.id} className="quality-row">
                  <span>
                    <SpellIcon id={t.id} className="icon-inline" /> {t.name} ×{s.count}
                  </span>
                  <span className="bar quality-bar">
                    <span className="bar-fill" style={{ transform: `scaleX(${s.avgQuality})` }} />
                  </span>
                  <b>{pct(s.avgQuality)}</b>
                </div>
              );
            })}
            {!Object.keys(r.perSpell).length && <p className="muted">{tr('Ни одного успешного каста — загляни в Академию.', 'No successful casts — visit the Academy.')}</p>}
          </div>
        </section>

        <section className="card">
          <h3>{tr('Топ ошибок', 'Top errors')}</h3>
          {r.topErrors.length ? (
            <ol className="error-list">
              {r.topErrors.map((e) => (
                <li key={e.id}>
                  <span>
                    <SpellIcon id={e.gesture} className="icon-inline" /> {e.text}
                  </span>
                  <b>{times(e.count)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{tr('Ошибок нет — чистая работа!', 'No errors — clean work!')}</p>
          )}
          {r.advice.length > 0 && (
            <>
              <h3>{tr('Что тренировать', 'What to practice')}</h3>
              <ul className="advice-list">
                {r.advice.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <nav className="results-buttons">
        {hasNext && (
          <DwellButton className="btn-primary" onSelect={() => startBattle(r.level + 1)}>
            ⚔️ {tr('Уровень', 'Level')} {r.level + 1}
          </DwellButton>
        )}
        {campaign ? (
          <DwellButton onSelect={() => startBattle(r.level)}>🔁 {tr('Ещё раз', 'Retry')}</DwellButton>
        ) : r.mode === 'daily' ? (
          <DwellButton onSelect={() => go('daily')}>📅 {tr('К испытанию дня', 'Daily challenge')}</DwellButton>
        ) : r.mode === 'survival' ? (
          <DwellButton onSelect={startSurvival}>🗼 {tr('Новый забег', 'New run')}</DwellButton>
        ) : (
          <DwellButton onSelect={() => go('online')}>🔍 {tr('Новый соперник', 'New opponent')}</DwellButton>
        )}
        {trainGesture && (
          <DwellButton onSelect={() => openAcademy(trainGesture)}>
            📖 {tr('Тренировать', 'Practice')} {TEMPLATE_BY_ID[trainGesture].icon}
          </DwellButton>
        )}
        <DwellButton
          onSelect={() =>
            void import('../shareCard').then(({ shareResult }) =>
              shareResult(r).then((how) => setShared(how === 'shared' ? tr('Отправлено!', 'Shared!') : tr('Картинка скачана', 'Image downloaded'))),
            )
          }
        >
          📤 {shared ?? tr('Поделиться', 'Share')}
        </DwellButton>
        <DwellButton onSelect={() => go('menu')}>🏠 {tr('Меню', 'Menu')}</DwellButton>
      </nav>
    </ScreenShell>
  );
}
