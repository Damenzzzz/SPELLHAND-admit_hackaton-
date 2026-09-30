import { joinRoom } from 'trystero';
import { APP_ID } from './config';
import type { MatchFound } from './matchmaking';
import { isRoomCode, normalizeRoomCode } from './roomCode';
import { tr } from '../i18n';

export type PrivateRole = 'host' | 'guest';
export type PrivateResult =
  | { kind: 'matched'; match: MatchFound }
  | { kind: 'cancelled' | 'timeout' | 'full' | 'closed' | 'error' };

type Hello = { role: PrivateRole; nick: string };
type Offer = { roomId: string; nick: string };

export const PRIVATE_JOIN_TIMEOUT_MS = 25000;
const OFFER_TIMEOUT_MS = 10000;
const HELLO_MS = 1500;

/** A code-only lobby, separate from public matchmaking. Only its host can pair guests. */
export function openPrivateRoom(role: PrivateRole, input: string, nick: string) {
  const code = normalizeRoomCode(input);
  if (!isRoomCode(code)) throw new Error(tr('Код комнаты должен содержать 6 цифр.', 'The room code must have 6 digits.'));

  const room = joinRoom({ appId: APP_ID, password: code }, `private-v1-${code}`);
  const hello = room.makeAction<Hello>('hello');
  const offer = room.makeAction<Offer>('offer');
  const accept = room.makeAction<{ roomId: string }>('accept');
  const start = room.makeAction<{ roomId: string }>('start');
  const reject = room.makeAction<{ reason: 'full' | 'closed' }>('reject');
  let done = false;
  let starting = false;
  let pending: { peerId: string; roomId: string; nick: string; at: number } | null = null;
  let resolve!: (result: PrivateResult) => void;
  const promise = new Promise<PrivateResult>((r) => { resolve = r; });
  let tick: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const finish = (result: PrivateResult) => {
    if (done) return;
    done = true;
    clearInterval(tick);
    clearTimeout(timeout);
    // No delayed leave: a quick retry with the same code must get a fresh room.
    void room.leave();
    resolve(result);
  };
  const failed = () => finish({ kind: 'error' });
  const announce = (peerId?: string) => {
    if (!done) void hello.send({ role, nick }, peerId ? { target: peerId } : undefined).catch(failed);
  };
  const matched = (): PrivateResult => ({
    kind: 'matched',
    match: {
      roomId: pending!.roomId,
      opponentId: pending!.peerId,
      opponentNick: pending!.nick,
      initiator: role === 'host',
      password: code,
    },
  });

  hello.onMessage = (h, { peerId }) => {
    if (done || !h || (h.role !== 'host' && h.role !== 'guest') || typeof h.nick !== 'string') return;
    if (role !== 'host') return;
    // An unlikely code collision must not create a host-vs-host duel.
    if (h.role === 'host') return finish({ kind: 'error' });
    if (pending) {
      if (pending.peerId !== peerId) void reject.send({ reason: 'full' }, { target: peerId }).catch(failed);
      return;
    }
    pending = { peerId, roomId: crypto.randomUUID(), nick: h.nick.slice(0, 40), at: Date.now() };
    void offer.send({ roomId: pending.roomId, nick }, { target: peerId }).catch(failed);
  };

  offer.onMessage = (o, { peerId }) => {
    if (done || role !== 'guest' || pending || !o || typeof o.roomId !== 'string' || typeof o.nick !== 'string') return;
    if (!/^[a-f\d-]{36}$/.test(o.roomId)) return;
    pending = { peerId, roomId: o.roomId, nick: o.nick.slice(0, 40), at: Date.now() };
    void accept.send({ roomId: o.roomId }, { target: peerId }).catch(failed);
  };

  accept.onMessage = (a, { peerId }) => {
    if (done || starting || role !== 'host' || !pending || peerId !== pending.peerId || a?.roomId !== pending.roomId) return;
    starting = true;
    // Deliver the final acknowledgement before leaving this lobby.
    void start.send({ roomId: pending.roomId }, { target: peerId }).then(() => {
      if (!done && pending) finish(matched());
    }).catch(failed);
  };

  start.onMessage = (s, { peerId }) => {
    if (done || role !== 'guest' || !pending || peerId !== pending.peerId || s?.roomId !== pending.roomId) return;
    finish(matched());
  };

  reject.onMessage = (r, { peerId }) => {
    if (done || role !== 'guest' || (pending && pending.peerId !== peerId)) return;
    if (r?.reason === 'full' || r?.reason === 'closed') finish({ kind: r.reason });
  };
  room.onPeerLeave = (peerId) => {
    if (done || pending?.peerId !== peerId) return;
    // Once start is being sent, leaving the lobby is the normal handoff to PvP.
    if (role === 'host' && starting) return;
    if (role === 'guest') finish({ kind: 'closed' });
    else pending = null;
  };

  tick = setInterval(() => {
    if (done) return;
    if (pending && !starting && Date.now() - pending.at >= OFFER_TIMEOUT_MS) {
      if (role === 'guest') return finish({ kind: 'timeout' });
      const peerId = pending.peerId;
      pending = null;
      void reject.send({ reason: 'closed' }, { target: peerId }).catch(failed);
    }
    announce();
  }, HELLO_MS);
  // Hosts wait until a friend arrives or they explicitly close the room.
  if (role === 'guest') timeout = setTimeout(() => finish({ kind: 'timeout' }), PRIVATE_JOIN_TIMEOUT_MS);
  room.onPeerJoin = (peerId) => announce(peerId);
  announce();

  return { promise, cancel: () => finish({ kind: 'cancelled' }) };
}
