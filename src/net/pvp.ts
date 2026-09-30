import { joinRoom, type Room } from 'trystero';
import type { ComboId } from '../game/data/combos';
import type { GestureId, SpellId } from '../gestures/types';
import { APP_ID } from './config';
import type { MatchFound } from './matchmaking';
import { tr } from '../i18n';

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
  // --- необязательные поля (старый клиент их не шлёт — касты работают как раньше) ---
  /** id снаряда у отправителя: получатель не применяет повтор. */
  cid?: number;
  /** Поджог цели (огненный шар, «Огненный вихрь»). */
  burn?: boolean;
  /** Завершающая атака комбинации; урон `damage` уже включает её бонус. */
  combo?: ComboId | null;
  /** «Паровой взрыв»: получатель проверяет своё горение при попадании. */
  steam?: { bonusDamage: number; stunMs: number } | null;
};

/** Получатель → отправитель: сработал ли условный эффект комбинации. */
export type FxMsg = { cid: number; ok: boolean };

export type StateMsg = {
  hp: number;
  maxHp: number;
  mana: number;
  shieldUp: boolean;
  durability: number;
  shieldMax: number;
  staff: string;
  /** Горит ли отправитель — подсказка «Парового взрыва» у соперника. */
  burning?: boolean;
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
  /** Ответ получателя об условном эффекте моей комбинации. */
  onFx: ((f: FxMsg) => void) | null = null;

  private castA;
  private stateA;
  private endA;
  private formingA;
  private handA;
  private fxA;
  private closed = false;
  private stopConnecting: () => void = () => {};

  /** Резолвится временем старта (Date.now()-шкала) или null, если соперник не подключился. */
  readonly started: Promise<number | null>;

  constructor(readonly match: MatchFound) {
    this.room = joinRoom({ appId: APP_ID, password: match.password }, `match-${match.roomId}`, {
      onPeerHandshake: async (peerId) => {
        if (peerId !== match.opponentId) throw new Error(tr('Эта дуэль уже занята.', 'This duel is already taken.'));
      },
    });
    const ready = this.room.makeAction<{ v: number }>('ready');
    const countdown = this.room.makeAction<{ startAt: number }>('countdown');
    this.castA = this.room.makeAction<CastMsg>('cast');
    this.stateA = this.room.makeAction<StateMsg>('state');
    this.endA = this.room.makeAction<{ loser: string }>('end');
    this.formingA = this.room.makeAction<{ g: GestureId | null }>('forming');
    this.formingA.onMessage = ({ g }, { peerId }) => {
      if (!this.closed && peerId === match.opponentId) this.onForming?.(g);
    };
    this.fxA = this.room.makeAction<FxMsg>('fx');
    this.fxA.onMessage = (f, { peerId }) => {
      if (!this.closed && peerId === match.opponentId) this.onFx?.(f);
    };
    this.handA = this.room.makeAction<{ lm: number[] | null }>('hand');
    this.handA.onMessage = ({ lm }, { peerId }) => {
      if (!this.closed && peerId === match.opponentId) this.onHand?.(lm);
    };

    this.castA.onMessage = (c, { peerId }) => {
      if (!this.closed && peerId === match.opponentId) this.onCast?.(c);
    };
    this.stateA.onMessage = (s, { peerId }) => {
      if (!this.closed && peerId === match.opponentId) this.onState?.(s);
    };
    this.endA.onMessage = (_, { peerId }) => {
      if (!this.closed && peerId === match.opponentId) this.onEnd?.(true);
    };
    this.room.onPeerLeave = (id) => {
      if (this.closed || id !== match.opponentId) return;
      this.stopConnecting();
      this.onLeave?.();
    };

    this.started = new Promise((resolve) => {
      let settled = false;
      let starting = false;
      const go = (startAt: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(retry);
        resolve(startAt);
      };
      const timer = setTimeout(() => go(null), CONNECT_TIMEOUT_MS);
      const sendReady = () => {
        if (!settled && !this.closed && this.room.getPeers()[match.opponentId]) {
          void ready.send({ v: 1 }, { target: match.opponentId }).catch(() => go(null));
        }
      };
      const retry = setInterval(sendReady, 1000);
      this.stopConnecting = () => go(null);
      countdown.onMessage = ({ startAt }, { peerId }) => {
        if (!this.closed && !match.initiator && peerId === match.opponentId && Number.isFinite(startAt)) go(startAt);
      };
      ready.onMessage = (_, { peerId }) => {
        // инициатор назначает общее время старта
        if (settled || starting || this.closed || !match.initiator || peerId !== match.opponentId) return;
        starting = true;
        const startAt = Date.now() + START_DELAY_MS;
        void countdown.send({ startAt }, { target: match.opponentId })
          .then(() => go(startAt)).catch(() => go(null));
      };
      this.room.onPeerJoin = (id) => {
        if (id === match.opponentId) sendReady();
      };
    });
  }

  sendCast(c: CastMsg) {
    if (!this.closed) void this.castA.send(c, { target: this.match.opponentId });
  }

  sendFx(f: FxMsg) {
    if (!this.closed) void this.fxA.send(f, { target: this.match.opponentId });
  }

  sendState(s: StateMsg) {
    if (!this.closed) void this.stateA.send(s, { target: this.match.opponentId });
  }

  /** Точки руки вместо видео: ~1 КБ/с и никакой картинки с камеры. */
  sendHand(pts: { x: number; y: number }[] | null) {
    if (this.closed) return;
    void this.handA.send({ lm: pts ? pts.flatMap((p) => [Math.round(p.x * 1e4), Math.round(p.y * 1e4)]) : null }, { target: this.match.opponentId });
  }

  sendForming(g: GestureId | null) {
    if (!this.closed) void this.formingA.send({ g }, { target: this.match.opponentId });
  }

  /** Я проиграл — сообщаем сопернику. */
  sendDefeat() {
    if (!this.closed) void this.endA.send({ loser: 'me' }, { target: this.match.opponentId });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopConnecting();
    setTimeout(() => void this.room.leave(), 500);
  }
}
