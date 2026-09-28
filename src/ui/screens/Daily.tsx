import { useEffect, useState } from 'react';
import { ASSETS } from '../../game/data/assets';
import { dailyChallenge } from '../../game/data/daily';
import { SPELLS } from '../../game/data/spells';
import type { DailyRow } from '../../net/leaderboard';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { AssetImg } from '../AssetImg';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';

/** Испытание дня: одинаковый для всех бой с модификатором и свой рейтинг. */
export function Daily() {
  const { go, startDaily } = useGame();
  const [c] = useState(() => dailyChallenge());
  const best = useSave((s) => (s.dailyBest?.id === c.id ? s.dailyBest.score : null));
  const [rows, setRows] = useState<DailyRow[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    import('../../net/leaderboard')
      .then(({ fetchDailyTop }) => fetchDailyTop(c.id))
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows('error'));
    return () => {
      alive = false;
    };
  }, [c.id]);

  const base = c.level;
  return (
    <ScreenShell className="daily">
      <CoinBadge />
      <h2 className="screen-title">📅 Испытание дня · {c.id}</h2>
      <div className="results-grid">
        <section className="card daily-card">
          <AssetImg src={ASSETS.enemy(base.portraitOf ?? 1)} fallback={base.enemyPortrait} className="daily-portrait" />
          <div>
            <b>{base.enemyName}</b> · HP {base.hp}
          </div>
          <div className="daily-mod">⚠ {c.modifier.text}</div>
          {c.modifier.allowed && (
            <div className="muted">Разрешено: {c.modifier.allowed.map((s) => SPELLS[s].icon).join(' ')} + щит</div>
          )}
          <p className="muted">Очки = точность жестов × 1000 + бонус за скорость. У всех игроков сегодня один и тот же бой.</p>
          {best !== null && <p className="found">Твой лучший результат сегодня: {best}</p>}
          <DwellButton className="btn-primary" onSelect={startDaily}>
            ⚔️ В бой
          </DwellButton>
        </section>
        <section className="card">
          <h3>Топ дня</h3>
          {rows === 'loading' && <p className="muted">Загружаем…</p>}
          {rows === 'error' && <p className="muted">Нет связи с релеями.</p>}
          {Array.isArray(rows) && !rows.length && <p className="muted">Сегодня ещё никто не сыграл — будь первым!</p>}
          {Array.isArray(rows) && rows.length > 0 && (
            <table className="lb-table">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.pubkey} className={r.me ? 'lb-me' : ''}>
                    <td>{i + 1}</td>
                    <td>{r.nickname}</td>
                    <td>{r.score}</td>
                    <td>{Math.round(r.accuracy * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <DwellButton onSelect={() => go('menu')}>← В меню</DwellButton>
    </ScreenShell>
  );
}
