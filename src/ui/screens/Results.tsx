import { LEVELS, LEVEL_BY_ID } from '../../game/data/levels';
import { TEMPLATES, TEMPLATE_BY_ID } from '../../gestures/templates';
import { useGame } from '../../store/gameStore';
import { CoinBadge } from '../CoinBadge';
import { SpellIcon } from '../SpellIcon';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function times(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} раза`;
  return `${n} раз`;
}

/** Итоги боя: точность, качество по спеллам, топ-3 ошибки и что тренировать. */
export function Results() {
  const { lastResult: r, startBattle, go, openAcademy } = useGame();
  if (!r) return null;
  const campaign = r.mode === 'campaign';
  const level = LEVEL_BY_ID[r.level];
  const hasNext = campaign && r.won && r.level < LEVELS.length;
  const trainGesture = r.topErrors[0]?.gesture;

  return (
    <ScreenShell className="results">
      <CoinBadge />
      <h1 className={`results-title ${r.won ? 'win' : 'lose'}`}>{r.won ? 'Победа!' : 'Поражение'}</h1>
      <p className="menu-sub">
        {campaign
          ? `Уровень ${level.id} · ${level.name} · ${level.enemyName}`
          : r.mode === 'online'
            ? `Онлайн-дуэль с игроком «${r.opponent}»`
            : r.mode === 'daily'
              ? `Испытание дня · ${r.dailyScore ?? 0} очков`
              : 'Соперник не нашёлся — бой с Призраком мага'}
      </p>

      <div className="results-grid">
        <section className="card">
          <div className="stat-row">
            <div className="stat">
              <b>{pct(r.accuracy)}</b>
              <span>точность жестов</span>
            </div>
            <div className="stat">
              <b>
                {r.casts}/{r.attempts}
              </b>
              <span>удачных попыток</span>
            </div>
            <div className="stat">
              <b>{(r.durationMs / 1000).toFixed(0)} с</b>
              <span>длительность</span>
            </div>
            <div className="stat">
              <b className="gold">+{r.coins}</b>
              <span>{r.won ? (r.firstWin ? 'монет' : 'монет (повтор ×0.5)') : 'монет'}</span>
            </div>
          </div>
          {r.newRecord && <div className="record-badge">🏆 Новый рекорд уровня!</div>}

          <h3>Качество по заклинаниям</h3>
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
            {!Object.keys(r.perSpell).length && <p className="muted">Ни одного успешного каста — загляни в Академию.</p>}
          </div>
        </section>

        <section className="card">
          <h3>Топ ошибок</h3>
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
            <p className="muted">Ошибок нет — чистая работа!</p>
          )}
          {r.advice.length > 0 && (
            <>
              <h3>Что тренировать</h3>
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
            ⚔️ Уровень {r.level + 1}
          </DwellButton>
        )}
        {campaign ? (
          <DwellButton onSelect={() => startBattle(r.level)}>🔁 Ещё раз</DwellButton>
        ) : r.mode === 'daily' ? (
          <DwellButton onSelect={() => go('daily')}>📅 К испытанию дня</DwellButton>
        ) : (
          <DwellButton onSelect={() => go('online')}>🔍 Новый соперник</DwellButton>
        )}
        {trainGesture && (
          <DwellButton onSelect={() => openAcademy(trainGesture)}>
            📖 Тренировать {TEMPLATE_BY_ID[trainGesture].icon}
          </DwellButton>
        )}
        <DwellButton onSelect={() => go('menu')}>🏠 Меню</DwellButton>
      </nav>
    </ScreenShell>
  );
}
