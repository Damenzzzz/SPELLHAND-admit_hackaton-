import { useEffect, useState } from 'react';
import type { LeaderRow } from '../../net/leaderboard';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';
import { tr } from '../../i18n';

type State = { kind: 'loading' } | { kind: 'ok'; rows: LeaderRow[] } | { kind: 'error' };

/** Топ-20 магов по победам и точности (глобально, через Nostr) + свои рекорды. */
export function Leaderboard() {
  const go = useGame((s) => s.go);
  const { records, online, nickname } = useSave();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    import('../../net/leaderboard')
      .then(({ fetchTop }) => fetchTop())
      .then((rows) => alive && setState({ kind: 'ok', rows }))
      .catch(() => alive && setState({ kind: 'error' }));
    return () => {
      alive = false;
    };
  }, [reload]);

  const localWins = Object.values(records).reduce((a, r) => a + r.wins, 0);
  const bestAcc = Math.max(0, ...Object.values(records).map((r) => r.bestAccuracy));

  return (
    <ScreenShell className="leaderboard">
      <CoinBadge />
      <h2 className="screen-title">🏆 {tr('Лидерборд', 'Leaderboard')}</h2>
      <div className="results-grid">
        <section className="card">
          <h3>{tr('Топ-20 магов', 'Top 20 mages')}</h3>
          {state.kind === 'loading' && <p className="muted">{tr('Загружаем с релеев…', 'Loading from relays…')}</p>}
          {state.kind === 'error' && <p className="muted">{tr('Нет связи с релеями — попробуй позже.', 'Cannot reach the relays — try again later.')}</p>}
          {state.kind === 'ok' && !state.rows.length && <p className="muted">{tr('Пока пусто — стань первым!', 'Empty so far — be the first!')}</p>}
          {state.kind === 'ok' && state.rows.length > 0 && (
            <table className="lb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{tr('Маг', 'Mage')}</th>
                  <th>{tr('Победы', 'Wins')}</th>
                  <th>{tr('Точность', 'Accuracy')}</th>
                  <th>{tr('Уровень', 'Level')}</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r, i) => (
                  <tr key={r.pubkey} className={r.me ? 'lb-me' : ''}>
                    <td>{i + 1}</td>
                    <td>{r.nickname}</td>
                    <td>
                      {r.wins}
                      {r.onlineWins ? <small> (🌐{r.onlineWins})</small> : null}
                    </td>
                    <td>{Math.round(r.accuracy * 100)}%</td>
                    <td>{r.maxLevel || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h3>
            {tr('Мои рекорды', 'My records')} · {nickname}
          </h3>
          <div className="stat-row">
            <div className="stat">
              <b>{localWins}</b>
              <span>{tr('побед в кампании', 'campaign wins')}</span>
            </div>
            <div className="stat">
              <b>{Math.round(bestAcc * 100)}%</b>
              <span>{tr('лучшая точность', 'best accuracy')}</span>
            </div>
            <div className="stat">
              <b>{online.wins}</b>
              <span>{tr('онлайн-побед', 'online wins')}</span>
            </div>
            <div className="stat">
              <b>{Object.keys(records).length}/10</b>
              <span>{tr('уровней пройдено', 'levels cleared')}</span>
            </div>
          </div>
        </section>
      </div>
      <nav className="results-buttons">
        <DwellButton onSelect={() => setReload((n) => n + 1)}>🔄 {tr('Обновить', 'Refresh')}</DwellButton>
        <DwellButton onSelect={() => go('menu')}>← {tr('В меню', 'Menu')}</DwellButton>
      </nav>
    </ScreenShell>
  );
}
