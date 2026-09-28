import { joinRoom, type Room } from 'trystero';
import type { GestureId, SpellId } from '../gestures/types';
import { APP_ID } from './config';
import type { MatchFound } from './matchmaking';

export type CastMsg = {
  spell: SpellId;
  damage: number;
  quality: number;
  pierce: number;
  shieldDamage: number | null;
  slowFactor: number | null;
  slowMs: number | null;
  interrupt: boolean;
  travelMs: number;
};

export type StateMsg = {
  hp: number;
  maxHp: number;
  mana: number;
  shieldUp: boolean;
  durability: number;
  shieldMax: number;
  staff: string;
};

const START_DELAY_MS = 3500;
const CONNECT_TIMEOUT_MS = 12000;

/**
 * Канал матча: события ready, countdown {startAt}, cast, state (каждые 250 мс), end.
 * Каждый клиент авторитетен по своему HP: применяет входящие cast к себе и рассылает state.
 */
export class PvpLink {
  readonly room: Room;
  onCast: ((c: CastMsg) => void) | null = null;
  onState: ((s: StateMsg) => void) | null = null;
  onEnd: ((winnerIsMe: boolean) => void) | null = null;
  onLeave: (() => void) | null = null;
  /** Соперник взводит жест (или отпустил — null): видно его «телеграф», можно финтить. */
  onForming: ((g: GestureId | null) => void) | null = null;
  /** Скелет руки соперника (x,y ×10⁴, 21 точка) — видно, как он складывает жест. */
  onHand: ((lm: number[] | null) => void) | null = null;

  private castA;
  private stateA;
  private endA;
  private formingA;
  private handA;
  private closed = false;

  /** Резолвится временем старта (Date.now()-шкала) или null, если соперник не подключился. */
  readonly started: Promise<number | null>;

  constructor(readonly match: MatchFound) {
    this.room = joinRoom({ appId: APP_ID }, `match-${match.roomId}`);
    const ready = this.room.makeAction<{ v: number }>('ready');
    const countdown = this.room.makeAction<{ startAt: number }>('countdown');
    this.castA = this.room.makeAction<CastMsg>('cast');
    this.stateA = this.room.makeAction<StateMsg>('state');
    this.endA = this.room.makeAction<{ loser: string }>('end');
    this.formingA = this.room.makeAction<{ g: GestureId | null }>('forming');
    this.formingA.onMessage = ({ g }) => this.onForming?.(g);
    this.handA = this.room.makeAction<{ lm: number[] | null }>('hand');
    this.handA.onMessage = ({ lm }) => this.onHand?.(lm);

    this.castA.onMessage = (c) => this.onCast?.(c);
    this.stateA.onMessage = (s) => this.onState?.(s);
    this.endA.onMessage = () => this.onEnd?.(true);
    this.room.onPeerLeave = (id) => id === match.opponentId && this.onLeave?.();

    this.started = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), CONNECT_TIMEOUT_MS);
      const go = (startAt: number) => {
        clearTimeout(timer);
        resolve(startAt);
      };
      countdown.onMessage = ({ startAt }) => go(startAt);
      ready.onMessage = () => {
        // инициатор назначает общее время старта
        if (!match.initiator) return;
        const startAt = Date.now() + START_DELAY_MS;
        void countdown.send({ startAt });
        go(startAt);
      };
      this.room.onPeerJoin = (id) => {
        if (id === match.opponentId) void ready.send({ v: 1 }, { target: id });
      };
    });
  }

  sendCast(c: CastMsg) {
    if (!this.closed) void this.castA.send(c);
  }

  sendState(s: StateMsg) {
    if (!this.closed) void this.stateA.send(s);
  }

  /** Точки руки вместо видео: ~1 КБ/с и никакой картинки с камеры. */
  sendHand(pts: { x: number; y: number }[] | null) {
    if (this.closed) return;
    void this.handA.send({ lm: pts ? pts.flatMap((p) => [Math.round(p.x * 1e4), Math.round(p.y * 1e4)]) : null });
  }

  sendForming(g: GestureId | null) {
    if (!this.closed) void this.formingA.send({ g });
  }

  /** Я проиграл — сообщаем сопернику. */
  sendDefeat() {
    if (!this.closed) void this.endA.send({ loser: 'me' });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    setTimeout(() => void this.room.leave(), 500);
  }
}
