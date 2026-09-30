import { useEffect, useRef, useState } from 'react';
import type { MatchFound } from '../../net/matchmaking';
import { randomNick } from '../../net/nick';
import type { PvpLink } from '../../net/pvp';
import type { PrivateRole, PrivateResult } from '../../net/privateRoom';
import { createRoomCode, formatRoomCode, isRoomCode, ROOM_CODE_LENGTH } from '../../net/roomCode';
import { setCurrentLink } from '../../net/session';
import { useGame } from '../../store/gameStore';
import { updateSave, useSave } from '../../store/saveStore';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';
import { localize, tr } from '../../i18n';

type Phase =
  | { kind: 'idle' }
  | { kind: 'enter' }
  | { kind: 'preparing' }
  | { kind: 'hosting'; code: string }
  | { kind: 'joining'; code: string }
  | { kind: 'search'; online: number; secondsLeft: number }
  | { kind: 'found'; nick: string }
  | { kind: 'fallback'; reason: string };

const FALLBACK_DELAY_MS = 1800;
const PRIVATE_ERRORS: Record<Exclude<PrivateResult['kind'], 'matched' | 'cancelled'>, string> = {
  timeout: 'Не удалось найти комнату. Проверь код и попроси друга оставить комнату открытой, затем попробуй ещё раз.',
  full: 'В комнате уже два игрока. Попроси друга создать новую комнату.',
  closed: 'Создатель закрыл комнату или связь прервалась. Попроси друга создать новую комнату.',
  error: 'Не удалось открыть соединение. Проверь интернет и попробуй ещё раз.',
};
localize(PRIVATE_ERRORS);

/**
 * Public matchmaking and private two-player rooms. Private rooms never fall back to a bot.
 */
export function Online() {
  const { go, startOnline, startGhost } = useGame();
  const { nickname, online } = useSave();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const linkRef = useRef<PvpLink | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);
  const alive = useRef(true);

  const stopAttempt = () => {
    attempt.current++;
    cancelRef.current?.();
    cancelRef.current = null;
    linkRef.current?.close();
    linkRef.current = null;
    clearTimeout(fallbackRef.current);
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopAttempt();
    };
  }, []);

  const current = (id: number) => alive.current && attempt.current === id;
  const begin = () => {
    stopAttempt();
    setError(null);
    setCopied(false);
    return attempt.current;
  };
  const cancel = () => {
    stopAttempt();
    setError(null);
    setPhase({ kind: 'idle' });
  };
  const fail = (message: string, role?: PrivateRole) => {
    stopAttempt();
    setError(message);
    setPhase({ kind: role === 'guest' ? 'enter' : 'idle' });
  };
  const fallback = (reason: string, id: number) => {
    setPhase({ kind: 'fallback', reason });
    fallbackRef.current = setTimeout(() => current(id) && startGhost(), FALLBACK_DELAY_MS);
  };

  const connect = async (match: MatchFound, id: number, role?: PrivateRole) => {
    setPhase({ kind: 'found', nick: match.opponentNick });
    const { PvpLink } = await import('../../net/pvp');
    if (!current(id)) return;
    const link = new PvpLink(match);
    linkRef.current = link;
    const startAt = await link.started;
    if (!current(id)) return link.close();
    linkRef.current = null;
    if (startAt === null) {
      link.close();
      if (role) return fail(tr('Не удалось соединиться с другом. Создайте новую комнату и попробуйте ещё раз.', 'Could not connect to your friend. Create a new room and try again.'), role);
      return fallback(tr('Не удалось соединиться с соперником', 'Could not connect to the opponent'), id);
    }
    setCurrentLink(link);
    startOnline(match.opponentNick, startAt);
  };

  const search = async () => {
    const id = begin();
    setPhase({ kind: 'search', online: 0, secondsLeft: 20 });
    try {
      const { findOpponent } = await import('../../net/matchmaking');
      if (!current(id)) return;
      const request = findOpponent(nickname, (s) => {
        if (current(id)) setPhase({ kind: 'search', ...s });
      });
      cancelRef.current = request.cancel;
      const match = await request.promise;
      if (!current(id)) return;
      cancelRef.current = null;
      if (!match) return fallback(tr('Соперник не найден за 20 секунд', 'No opponent found in 20 seconds'), id);
      await connect(match, id);
    } catch {
      if (current(id)) fail(tr('Не удалось начать поиск. Проверь интернет и попробуй ещё раз.', 'Could not start searching. Check your internet and try again.'));
    }
  };

  const privateDuel = async (role: PrivateRole) => {
    if (role === 'guest' && !isRoomCode(code)) {
      setError(tr('Введи все 6 цифр кода комнаты.', 'Enter all 6 digits of the room code.'));
      return;
    }
    const id = begin();
    setPhase({ kind: 'preparing' });
    try {
      const roomCode = role === 'host' ? createRoomCode() : code;
      const { openPrivateRoom } = await import('../../net/privateRoom');
      if (!current(id)) return;
      const request = openPrivateRoom(role, roomCode, nickname);
      cancelRef.current = request.cancel;
      setPhase({ kind: role === 'host' ? 'hosting' : 'joining', code: roomCode });
      const result = await request.promise;
      if (!current(id)) return;
      cancelRef.current = null;
      if (result.kind === 'matched') await connect(result.match, id, role);
      else if (result.kind !== 'cancelled') fail(PRIVATE_ERRORS[result.kind], role);
    } catch {
      if (current(id)) fail(PRIVATE_ERRORS.error, role);
    }
  };

  const copyCode = async (value: string) => {
    const id = attempt.current;
    try {
      await navigator.clipboard.writeText(value);
      if (current(id)) { setCopied(true); setError(null); }
    } catch {
      if (current(id)) setError(tr('Не удалось скопировать. Передай другу код, показанный на экране.', 'Could not copy. Tell your friend the code shown on screen.'));
    }
  };

  return (
    <ScreenShell className="online">
      <CoinBadge />
      <h2 className="screen-title">🌐 {tr('Онлайн-дуэль', 'Online duel')}</h2>
      <div className="card online-card" ref={panelRef}>
        <div className="online-nick">
          <span className="muted">{tr('Твой ник', 'Your nickname')}</span>
          <b>{nickname}</b>
          <span className="muted">
            {tr('Победы', 'Wins')} {online.wins} · {tr('поражения', 'losses')} {online.losses}
          </span>
        </div>

        {phase.kind === 'idle' && (
          <div className="online-actions">
            <section className="private-actions">
              <h3>🤝 {tr('Дуэль с другом', 'Duel a friend')}</h3>
              <p className="muted">{tr('Комната на двоих. Войти можно только по коду.', 'A room for two. Join by code only.')}</p>
              <DwellButton className="btn-primary" onSelect={() => void privateDuel('host')}>＋ {tr('Создать комнату', 'Create room')}</DwellButton>
              <DwellButton onSelect={() => { setError(null); setCode(''); setPhase({ kind: 'enter' }); }}>⌨ {tr('Войти по коду', 'Join by code')}</DwellButton>
            </section>
            <DwellButton onSelect={() => void search()}>🔍 {tr('Найти случайного соперника', 'Find a random opponent')}</DwellButton>
            <DwellButton onSelect={() => updateSave({ nickname: randomNick() })}>🎲 {tr('Другой ник', 'New nickname')}</DwellButton>
          </div>
        )}

        {phase.kind === 'enter' && (
          <form className="room-entry" onSubmit={(e) => { e.preventDefault(); void privateDuel('guest'); }}>
            <label htmlFor="room-code">{tr('Код комнаты друга', 'Friend’s room code')}</label>
            <input
              id="room-code"
              className="room-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              value={code}
              placeholder="000000"
              aria-describedby="room-code-hint"
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, ROOM_CODE_LENGTH)); setError(null); }}
            />
            <p id="room-code-hint" className="muted">{tr('Введи 6 цифр с клавиатуры или выбери их жестами.', 'Type 6 digits or pick them with gestures.')}</p>
            <div className="room-keypad" role="group" aria-label={tr('Цифры кода комнаты', 'Room code digits')}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <DwellButton key={digit} disabled={code.length >= ROOM_CODE_LENGTH} onSelect={() => { setCode((v) => (v + digit).slice(0, ROOM_CODE_LENGTH)); setError(null); }}>{digit}</DwellButton>
              ))}
              <DwellButton disabled={!code} onSelect={() => { setCode(''); setError(null); }}>{tr('Сброс', 'Clear')}</DwellButton>
              <DwellButton disabled={code.length >= ROOM_CODE_LENGTH} onSelect={() => { setCode((v) => (v + '0').slice(0, ROOM_CODE_LENGTH)); setError(null); }}>0</DwellButton>
              <DwellButton disabled={!code} onSelect={() => { setCode((v) => v.slice(0, -1)); setError(null); }}>⌫</DwellButton>
            </div>
            <DwellButton className="btn-primary" disabled={!isRoomCode(code)} onSelect={() => void privateDuel('guest')}>⚔️ {tr('Подключиться', 'Connect')}</DwellButton>
          </form>
        )}

        {phase.kind === 'preparing' && <div className="online-status" role="status"><p>{tr('Открываем комнату…', 'Opening the room…')}</p></div>}

        {phase.kind === 'hosting' && (
          <div className="online-status private-waiting">
            <h3>{tr('Комната создана', 'Room created')}</h3>
            <span className="muted">{tr('Передай другу этот код', 'Give your friend this code')}</span>
            <output className="room-code" aria-label={`${tr('Код комнаты', 'Room code')}: ${phase.code.split('').join(' ')}`}>{formatRoomCode(phase.code)}</output>
            <DwellButton onSelect={() => void copyCode(phase.code)}>{copied ? tr('✓ Код скопирован', '✓ Code copied') : tr('📋 Скопировать код', '📋 Copy code')}</DwellButton>
            <p role="status">{tr('Ждём друга · 1 из 2 игроков', 'Waiting for your friend · 1 of 2 players')}</p>
            <p className="muted">{tr('Другу нужно открыть «Онлайн-дуэль» → «Войти по коду». Оставь эту комнату открытой — бой начнётся после подключения.', 'Your friend opens “Online duel” → “Join by code”. Keep this room open — the battle starts once they connect.')}</p>
          </div>
        )}

        {phase.kind === 'joining' && (
          <div className="online-status" role="status">
            <p>{tr('Подключаемся к комнате', 'Joining the room')}</p>
            <span className="room-code">{formatRoomCode(phase.code)}</span>
            <p className="muted">{tr('Создатель должен оставаться в комнате. Подключение может занять до 25 секунд.', 'The host must stay in the room. Connecting can take up to 25 seconds.')}</p>
          </div>
        )}

        {phase.kind === 'search' && (
          <div className="online-status">
            <div className="search-ring" style={{ ['--p' as string]: 1 - phase.secondsLeft / 20 }}>
              {phase.secondsLeft}
            </div>
            <p>
              {tr('Ищем соперника… Магов в лобби', 'Searching… Mages in lobby')}: {phase.online}
            </p>
            <p className="muted">{tr('Не нашли за 20 с — сразимся с Призраком мага', 'Nobody in 20 s — you will fight the Mage Ghost')}</p>
          </div>
        )}

        {phase.kind === 'found' && (
          <div className="online-status">
            <p className="found">
              ⚔️ {tr('Соперник найден', 'Opponent found')}: {phase.nick}
            </p>
            <p className="muted">{tr('Готовим дуэль…', 'Preparing the duel…')}</p>
          </div>
        )}

        {phase.kind === 'fallback' && (
          <div className="online-status">
            <p>{phase.reason}</p>
            <p className="found">👻 {tr('Бой с Призраком мага!', 'Battle with the Mage Ghost!')}</p>
          </div>
        )}
        {error && <p className="room-error" role="alert">{error}</p>}
      </div>
      <nav className="online-footer" aria-label={tr('Навигация онлайн-дуэли', 'Online duel navigation')}>
        <DwellButton onSelect={phase.kind === 'idle' ? () => go('menu') : cancel}>
          {phase.kind === 'idle'
            ? tr('← В меню', '← Menu')
            : phase.kind === 'enter'
              ? tr('← Назад', '← Back')
              : phase.kind === 'hosting'
                ? tr('✖ Закрыть комнату', '✖ Close room')
                : tr('✖ Отмена', '✖ Cancel')}
        </DwellButton>
        <div className="online-scroll" aria-label={tr('Прокрутка', 'Scroll')}>
          <DwellButton onSelect={() => panelRef.current?.closest('.shell-content')?.scrollBy({ top: -250 })}>↑<span className="sr-only"> {tr('Прокрутить вверх', 'Scroll up')}</span></DwellButton>
          <DwellButton onSelect={() => panelRef.current?.closest('.shell-content')?.scrollBy({ top: 250 })}>↓<span className="sr-only"> {tr('Прокрутить вниз', 'Scroll down')}</span></DwellButton>
        </div>
      </nav>
    </ScreenShell>
  );
}
