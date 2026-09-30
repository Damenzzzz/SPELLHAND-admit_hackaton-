import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { joinRoom, type JoinRoomCallbacks, type Room } from 'trystero';
import { openPrivateRoom, PRIVATE_JOIN_TIMEOUT_MS } from './privateRoom';
import { PvpLink, type CastMsg } from './pvp';
import { createRoomCode, isRoomCode, normalizeRoomCode } from './roomCode';
import type { MatchFound } from './matchmaking';

vi.mock('trystero', () => ({ joinRoom: vi.fn() }));

type Packet = { from: string; action: string; data: unknown; target?: string | string[] | null };
type Handler = (data: any, context: { peerId: string }) => void;
let peer: string;
let rooms: FakeRoom[];
let packets: Packet[];
let dropped: Set<string>;

/** Asynchronous, targeted delivery + disconnects, without public relay dependencies. */
class FakeRoom {
  peers = new Set<string>();
  actions = new Map<string, { onMessage: Handler | null; send: (data: unknown, options?: { target?: string | string[] | null }) => Promise<void> }>();
  onPeerJoin: ((id: string) => void) | null = null;
  onPeerLeave: ((id: string) => void) | null = null;
  left = false;
  constructor(readonly id: string, readonly namespace: string, readonly password?: string, readonly callbacks?: JoinRoomCallbacks) {}
  getPeers = () => Object.fromEntries([...this.peers].map((id) => [id, {}]));
  leave = vi.fn(async () => {
    this.left = true;
    for (const room of rooms) {
      if (room.namespace === this.namespace && room.password === this.password && room.peers.delete(this.id)) room.onPeerLeave?.(this.id);
    }
    this.peers.clear();
  });
  makeAction = (name: string) => {
    const existing = this.actions.get(name);
    if (existing) return existing;
    const action = {
      onMessage: null as Handler | null,
      send: async (data: unknown, options?: { target?: string | string[] | null }) => {
        packets.push({ from: this.id, action: name, data, target: options?.target });
        await Promise.resolve();
        if (dropped.has(name) || this.left) return;
        for (const room of rooms) {
          const target = options?.target;
          if (room === this || room.left || !this.peers.has(room.id) || room.namespace !== this.namespace || room.password !== this.password) continue;
          if (target && !(Array.isArray(target) ? target.includes(room.id) : target === room.id)) continue;
          room.receive(name, data, this.id);
        }
      },
    };
    this.actions.set(name, action);
    return action;
  };
  receive(name: string, data: unknown, from: string) {
    this.actions.get(name)?.onMessage?.(data, { peerId: from });
  }
}

const as = <T>(id: string, action: () => T): T => { peer = id; return action(); };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const match = (opponentId: string, initiator: boolean): MatchFound => ({ roomId: 'test-match', opponentId, opponentNick: opponentId, initiator, password: '123456' });

beforeEach(() => {
  vi.useFakeTimers();
  rooms = []; packets = []; dropped = new Set();
  vi.mocked(joinRoom).mockImplementation((config, namespace, callbacks) => {
    const room = new FakeRoom(peer, namespace, config.password, callbacks);
    rooms.push(room);
    void Promise.resolve().then(async () => {
      for (const other of rooms) {
        if (other === room || other.left || room.left || other.namespace !== namespace || other.password !== config.password || room.peers.has(other.id)) continue;
        try {
          const send = async () => {};
          const receive = async () => ({ data: null });
          await callbacks?.onPeerHandshake?.(other.id, send, receive, true);
          await other.callbacks?.onPeerHandshake?.(room.id, send, receive, false);
        } catch { continue; }
        if (room.left || other.left) continue;
        room.peers.add(other.id); other.peers.add(room.id);
        room.onPeerJoin?.(other.id); other.onPeerJoin?.(room.id);
      }
    });
    return room as unknown as Room;
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('комнаты по коду', () => {
  it('соединяет создателя и друга с одинаковым кодом вне публичного лобби', async () => {
    const host = as('host', () => openPrivateRoom('host', '012 345', 'Создатель'));
    const guest = as('guest', () => openPrivateRoom('guest', '012345', 'Друг'));
    await flush();
    const h = await host.promise;
    const g = await guest.promise;
    expect(h.kind).toBe('matched'); expect(g.kind).toBe('matched');
    if (h.kind !== 'matched' || g.kind !== 'matched') throw new Error('No match');
    expect(h.match).toMatchObject({ opponentId: 'guest', opponentNick: 'Друг', initiator: true, password: '012345' });
    expect(g.match).toMatchObject({ roomId: h.match.roomId, opponentId: 'host', initiator: false });
    expect(h.match.roomId).not.toContain('012345');
    expect(rooms.every((r) => r.namespace === 'private-v1-012345' && r.left)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('другой код не подключается; создатель продолжает ждать дольше тайм-аута гостя', async () => {
    const host = as('host', () => openPrivateRoom('host', '123456', 'Создатель'));
    const settled = vi.fn(); void host.promise.then(settled);
    const guest = as('guest', () => openPrivateRoom('guest', '654321', 'Друг'));
    await vi.advanceTimersByTimeAsync(PRIVATE_JOIN_TIMEOUT_MS);
    expect(await guest.promise).toEqual({ kind: 'timeout' });
    expect(settled).not.toHaveBeenCalled();
    const right = as('right', () => openPrivateRoom('guest', '123456', 'Друг'));
    await flush();
    expect((await right.promise).kind).toBe('matched');
    expect((await host.promise).kind).toBe('matched');
  });

  it('два гостя без создателя не начинают дуэль', async () => {
    const a = as('a', () => openPrivateRoom('guest', '123456', 'A'));
    const b = as('b', () => openPrivateRoom('guest', '123456', 'B'));
    await vi.advanceTimersByTimeAsync(PRIVATE_JOIN_TIMEOUT_MS);
    expect(await a.promise).toEqual({ kind: 'timeout' });
    expect(await b.promise).toEqual({ kind: 'timeout' });
  });

  it('при одновременном входе допускает только одного гостя', async () => {
    const host = as('host', () => openPrivateRoom('host', '123456', 'Создатель'));
    const first = as('first', () => openPrivateRoom('guest', '123456', 'Первый'));
    const second = as('second', () => openPrivateRoom('guest', '123456', 'Второй'));
    await flush();
    const results = await Promise.all([first.promise, second.promise]);
    expect(results.map((r) => r.kind).sort()).toEqual(['full', 'matched']);
    expect((await host.promise).kind).toBe('matched');
    expect(rooms.every((r) => r.left)).toBe(true);
  });

  it('отмена закрывает комнату и не позволяет поздним сообщениям запустить бой', async () => {
    const host = as('host', () => openPrivateRoom('host', '123456', 'Создатель'));
    host.cancel();
    rooms[0].receive('hello', { role: 'guest', nick: 'Поздний' }, 'late');
    await flush();
    expect(await host.promise).toEqual({ kind: 'cancelled' });
    expect(rooms[0].left).toBe(true);
    expect(packets.some((p) => p.action === 'offer')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('освобождает место, если выбранный гость ушёл до подтверждения', async () => {
    dropped.add('accept');
    const host = as('host', () => openPrivateRoom('host', '123456', 'Создатель'));
    const first = as('first', () => openPrivateRoom('guest', '123456', 'Первый'));
    await flush();
    first.cancel();
    dropped.delete('accept');
    const second = as('second', () => openPrivateRoom('guest', '123456', 'Второй'));
    await flush();
    expect(await first.promise).toEqual({ kind: 'cancelled' });
    expect((await second.promise).kind).toBe('matched');
    const result = await host.promise;
    expect(result.kind === 'matched' && result.match.opponentId).toBe('second');
  });

  it('не принимает подтверждение матча от постороннего участника', async () => {
    dropped.add('accept');
    const host = as('host', () => openPrivateRoom('host', '123456', 'Создатель'));
    const guest = as('guest', () => openPrivateRoom('guest', '123456', 'Друг'));
    const settled = vi.fn(); void host.promise.then(settled);
    await flush();
    const offer = packets.find((p) => p.action === 'offer')!.data as { roomId: string };
    rooms[0].receive('accept', { roomId: offer.roomId }, 'stranger');
    rooms[0].receive('accept', { roomId: 'wrong' }, 'guest');
    await flush();
    expect(settled).not.toHaveBeenCalled();
    host.cancel(); guest.cancel();
  });

  it('отклоняет неверный формат до создания соединения и сохраняет ведущие нули', () => {
    expect(normalizeRoomCode('012-345')).toBe('012345');
    expect(isRoomCode('012345')).toBe(true);
    expect(() => openPrivateRoom('guest', '12345x', 'Друг')).toThrow('6 цифр');
    expect(rooms).toHaveLength(0);
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set([0, 1, 2, 3, 4, 5]); return array;
    });
    expect(createRoomCode()).toBe('012345');
  });
});

describe('приватный PvP-канал', () => {
  it('оба игрока получают одно время старта и передают каст только сопернику', async () => {
    const host = as('host', () => new PvpLink(match('guest', true)));
    const guest = as('guest', () => new PvpLink(match('host', false)));
    await flush();
    const [a, b] = await Promise.all([host.started, guest.started]);
    expect(a).toBe(b); expect(a).toBeGreaterThan(Date.now());
    const onCast = vi.fn(); guest.onCast = onCast;
    const cast: CastMsg = { spell: 'fireball', damage: 20, quality: 1, pierce: 0, shieldDamage: null, slowFactor: null, slowMs: null, interrupt: false, travelMs: 500 };
    host.sendCast(cast);
    await flush();
    expect(onCast).toHaveBeenCalledWith(cast);
    expect(packets.find((p) => p.action === 'cast')?.target).toBe('guest');
    const starts = packets.filter((p) => p.action === 'countdown').length;
    rooms[0].receive('ready', { v: 1 }, 'guest');
    await flush();
    expect(packets.filter((p) => p.action === 'countdown')).toHaveLength(starts);
    host.close(); guest.close();
  });

  it('не пускает третьего игрока и игнорирует его события', async () => {
    const link = as('host', () => new PvpLink(match('guest', true)));
    const third = as('stranger', () => new PvpLink(match('host', false)));
    await flush();
    expect(rooms[0].getPeers()).toEqual({});
    const callbacks = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    [link.onCast, link.onState, link.onEnd, link.onHand, link.onForming] = callbacks;
    for (const [name, value] of [['cast', {}], ['state', {}], ['end', {}], ['hand', { lm: null }], ['forming', { g: 'ice' }]] as const) {
      rooms[0].receive(name, value, 'stranger');
    }
    rooms[0].receive('ready', { v: 1 }, 'stranger');
    rooms[0].receive('countdown', { startAt: Date.now() + 100 }, 'stranger');
    await flush();
    for (const callback of callbacks) expect(callback).not.toHaveBeenCalled();
    expect(packets.some((p) => p.action === 'countdown')).toBe(false);
    link.close(); third.close();
    expect(await link.started).toBeNull();
  });

  it('отмена и тайм-аут завершают ожидание, очищая таймеры', async () => {
    const cancelled = as('a', () => new PvpLink(match('missing', true)));
    cancelled.close();
    expect(await cancelled.started).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.getTimerCount()).toBe(0);
    const timedOut = as('b', () => new PvpLink(match('missing', false)));
    await vi.advanceTimersByTimeAsync(12000);
    expect(await timedOut.started).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    timedOut.close();
  });
});
