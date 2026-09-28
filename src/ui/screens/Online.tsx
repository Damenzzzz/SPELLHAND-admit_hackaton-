import { useEffect, useRef, useState } from 'react';
import type { MatchFound } from '../../net/matchmaking';
import { randomNick } from '../../net/nick';
import { setCurrentLink } from '../../net/session';
import { useGame } from '../../store/gameStore';
import { updateSave, useSave } from '../../store/saveStore';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';

type Phase =
  | { kind: 'idle' }
  | { kind: 'search'; online: number; secondsLeft: number }
  | { kind: 'found'; nick: string }
  | { kind: 'fallback'; reason: string };

const FALLBACK_DELAY_MS = 1800;

/**
 * Онлайн-дуэль: поиск соперника в лобби (P2P), через 20 с без пары — бой с ботом
 * «Призрак мага» (жюри тестирует в одиночку — ожидание не должно быть тупиком).
 */
export function Online() {
  const { go, startOnline, startGhost } = useGame();
  const { nickname, online } = useSave();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const cancelRef = useRef<(() => void) | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelRef.current?.();
    };
  }, []);

  const fallback = (reason: string) => {
    setPhase({ kind: 'fallback', reason });
    setTimeout(() => alive.current && startGhost(), FALLBACK_DELAY_MS);
  };

  const search = async () => {
    setPhase({ kind: 'search', online: 0, secondsLeft: 20 });
    // Trystero грузится только при поиске
    const [{ findOpponent }, { PvpLink }] = await Promise.all([
      import('../../net/matchmaking'),
      import('../../net/pvp'),
    ]);
    if (!alive.current) return;
    const { promise, cancel } = findOpponent(nickname, (s) => {
      if (alive.current) setPhase({ kind: 'search', ...s });
    });
    cancelRef.current = cancel;
    const match: MatchFound | null = await promise;
    cancelRef.current = null;
    if (!alive.current) return;
    if (!match) return fallback('Соперник не найден за 20 секунд');

    setPhase({ kind: 'found', nick: match.opponentNick });
    const link = new PvpLink(match);
    const startAt = await link.started;
    if (!alive.current) return link.close();
    if (startAt === null) {
      link.close();
      return fallback('Не удалось соединиться с соперником');
    }
    setCurrentLink(link);
    startOnline(match.opponentNick, startAt);
  };

  return (
    <ScreenShell className="online">
      <CoinBadge />
      <h2 className="screen-title">🌐 Онлайн-дуэль</h2>
      <div className="card online-card">
        <div className="online-nick">
          <span className="muted">Твой ник</span>
          <b>{nickname}</b>
          <span className="muted">
            Победы {online.wins} · поражения {online.losses}
          </span>
        </div>

        {phase.kind === 'idle' && (
          <div className="online-actions">
            <DwellButton className="btn-primary" onSelect={search}>
              🔍 Найти соперника
            </DwellButton>
            <DwellButton onSelect={() => updateSave({ nickname: randomNick() })}>🎲 Другой ник</DwellButton>
          </div>
        )}

        {phase.kind === 'search' && (
          <div className="online-status">
            <div className="search-ring" style={{ ['--p' as string]: 1 - phase.secondsLeft / 20 }}>
              {phase.secondsLeft}
            </div>
            <p>Ищем соперника… Магов в лобби: {phase.online}</p>
            <p className="muted">Не нашли за 20 с — сразимся с Призраком мага</p>
            <DwellButton onSelect={() => cancelRef.current?.()}>✖ Отмена</DwellButton>
          </div>
        )}

        {phase.kind === 'found' && (
          <div className="online-status">
            <p className="found">⚔️ Соперник найден: {phase.nick}</p>
            <p className="muted">Соединяемся напрямую (WebRTC)…</p>
          </div>
        )}

        {phase.kind === 'fallback' && (
          <div className="online-status">
            <p>{phase.reason}</p>
            <p className="found">👻 Бой с Призраком мага!</p>
          </div>
        )}
      </div>
      {phase.kind === 'idle' && <DwellButton onSelect={() => go('menu')}>← В меню</DwellButton>}
    </ScreenShell>
  );
}
