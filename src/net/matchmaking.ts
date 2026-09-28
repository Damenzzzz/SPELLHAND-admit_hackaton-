import { joinRoom, selfId } from 'trystero';
import { APP_ID, LOBBY_ROOM, MATCH_TIMEOUT_MS } from './config';

export interface MatchFound {
  roomId: string;
  opponentId: string;
  opponentNick: string;
  /** Инициатор матча (меньший id) — он назначает время старта. */
  initiator: boolean;
}

export interface LobbyStatus {
  /** Сколько других свободных магов видно в лобби. */
  online: number;
  secondsLeft: number;
}

// type, а не interface: Trystero требует JSON-совместимый тип с индексной сигнатурой
type Hello = {
  nick: string;
  /** Время входа в лобби — пару составляют два самых ранних свободных. */
  since: number;
  free: boolean;
};

const PROPOSE_TIMEOUT_MS = 3000;
const TICK_MS = 600;

/**
 * Матчмейкинг через presence в комнате лобби:
 * все шлют hello {nick, since, free}; два самых ранних свободных игрока — пара;
 * игрок с меньшим id предлагает матч, второй подтверждает; оба уходят в комнату матча.
 * Через 20 с без соперника — null (дальше бой с ботом).
 */
export function findOpponent(nick: string, onStatus: (s: LobbyStatus) => void) {
  const room = joinRoom({ appId: APP_ID }, LOBBY_ROOM);
  const since = Date.now();
  const peers = new Map<string, Hello>();
  const busy = new Set<string>();
  let state: 'free' | 'proposing' | 'done' = 'free';
  let pending: { peerId: string; roomId: string; at: number } | null = null;

  const hello = room.makeAction<Hello>('hello');
  const propose = room.makeAction<{ roomId: string }>('propose');
  const accept = room.makeAction<{ roomId: string; ok: boolean }>('accept');

  const me = (): Hello => ({ nick, since, free: state !== 'done' });

  let resolve!: (m: MatchFound | null) => void;
  const promise = new Promise<MatchFound | null>((r) => (resolve = r));

  const cleanup = () => {
    clearInterval(tick);
    clearTimeout(timeout);
    // даём последним сообщениям уйти до выхода из лобби
    setTimeout(() => void room.leave(), 400);
  };

  const finish = (m: MatchFound | null) => {
    if (state === 'done') return;
    state = 'done';
    void hello.send(me());
    cleanup();
    resolve(m);
  };

  hello.onMessage = (h, { peerId }) => {
    peers.set(peerId, h);
  };
  room.onPeerJoin = (peerId) => void hello.send(me(), { target: peerId });
  room.onPeerLeave = (peerId) => {
    peers.delete(peerId);
    busy.delete(peerId);
  };

  propose.onMessage = ({ roomId }, { peerId }) => {
    const ok = state === 'free';
    void accept.send({ roomId, ok }, { target: peerId });
    if (ok) {
      finish({ roomId, opponentId: peerId, opponentNick: peers.get(peerId)?.nick ?? 'Маг', initiator: false });
    }
  };

  accept.onMessage = ({ roomId, ok }, { peerId }) => {
    if (state !== 'proposing' || pending?.peerId !== peerId || pending.roomId !== roomId) return;
    if (ok) {
      finish({ roomId, opponentId: peerId, opponentNick: peers.get(peerId)?.nick ?? 'Маг', initiator: true });
    } else {
      busy.add(peerId);
      pending = null;
      state = 'free';
    }
  };

  const tick = setInterval(() => {
    if (state === 'done') return;
    const now = Date.now();
    const free = [...peers.entries()].filter(([id, h]) => h.free && !busy.has(id));
    onStatus({ online: free.length, secondsLeft: Math.max(0, Math.ceil((since + MATCH_TIMEOUT_MS - now) / 1000)) });

    if (state === 'proposing' && pending && now - pending.at > PROPOSE_TIMEOUT_MS) {
      busy.add(pending.peerId);
      pending = null;
      state = 'free';
    }
    if (state !== 'free') return;

    // пара — два самых ранних свободных (включая себя)
    const queue = [[selfId, since] as const, ...free.map(([id, h]) => [id, h.since] as const)].sort(
      (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
    );
    const pair = queue.slice(0, 2).map(([id]) => id);
    if (pair.length < 2 || !pair.includes(selfId)) return;
    const other = pair[0] === selfId ? pair[1] : pair[0];
    if (selfId < other) {
      const roomId = `${selfId.slice(0, 6)}-${other.slice(0, 6)}-${now.toString(36)}`;
      pending = { peerId: other, roomId, at: now };
      state = 'proposing';
      void propose.send({ roomId }, { target: other });
    }
  }, TICK_MS);

  // периодический hello — на случай потерянного первого сообщения
  const helloTimer = setInterval(() => state !== 'done' && void hello.send(me()), 2000);
  const timeout = setTimeout(() => finish(null), MATCH_TIMEOUT_MS);
  promise.finally(() => clearInterval(helloTimer));

  return {
    promise,
    cancel: () => finish(null),
  };
}

export { selfId };
