import type { SpellId } from '../gestures/types';
import { localize, tr } from '../i18n';
import { updateSave, type SaveData } from '../store/saveStore';
import { Battle, type BattleEvent } from './combat';
import type { LevelDef } from './data/levels';
import type { Loadout } from './economy';

/**
 * Вводный учебный бой: огненный шар → щит → учебная дуэль.
 * Переходы — только по событиям боевого движка (принятый каст, заблокированный снаряд,
 * конец боя). Здесь нет наград: ни монет, ни рекордов, ни статистики, ни лидерборда.
 */
export type TutorialStage = 'intro' | 'fireball' | 'shield' | 'duel' | 'duelLost' | 'done';

export const TUTORIAL = {
  /** Пауза с подтверждением «Получилось!» перед следующим этапом. */
  confirmMs: 1800,
  /** Время прочитать инструкцию щита до первого выстрела. */
  shieldFirstShotMs: 1500,
  /** Заметное предупреждение перед учебным снарядом. */
  shieldWarnMs: 2000,
  /** Медленный учебный снаряд (обычный огненный шар летит 650 мс). */
  shieldTravelMs: 2200,
  /** Пауза перед повтором, если щит не успел. */
  shieldRetryMs: 2200,
  /** На тренировочных этапах HP игрока и манекена не опускается ниже — проиграть нельзя. */
  practiceMinHp: 30,
};

/** Разрешено в обучении: только освоенный огонь (щит — удерживаемая поза, не заклинание). */
const ALLOWED: SpellId[] = ['fireball'];

const base = { id: 1, portraitOf: 1, arena: 'forest', shieldChance: 0, shieldReact: 0, reward: 0, spellWeights: { fireball: 1 } };

/** Этапы 1–2: манекен не атакует сам (бот выключен), снаряды выпускает сценарий. */
export const PRACTICE_LEVEL: LevelDef = {
  ...base,
  name: 'Учебный зал',
  enemyName: 'Учебный манекен',
  enemyPortrait: '🎯',
  hp: 100,
  dmgMul: 0.3,
  castInterval: 60000,
  telegraphMs: TUTORIAL.shieldWarnMs,
};

/** Этап 3: слабый противник с редкими медленно телеграфируемыми атаками. */
export const DUEL_LEVEL: LevelDef = {
  ...base,
  name: 'Учебная дуэль',
  enemyName: 'Ученик-отступник',
  enemyPortrait: '🧙',
  hp: 45,
  dmgMul: 0.45,
  castInterval: 5200,
  telegraphMs: 1800,
};

localize([PRACTICE_LEVEL, DUEL_LEVEL]);

export type TutorialEvent =
  | { type: 'stage'; stage: TutorialStage }
  | { type: 'notice'; text: string; kind: 'good' | 'bad' | 'info' }
  | { type: 'battle'; event: BattleEvent };

type Listener = (e: TutorialEvent) => void;

const ACTIVE: TutorialStage[] = ['fireball', 'shield', 'duel'];
export const isActiveStage = (s: TutorialStage) => ACTIVE.includes(s);

export class TutorialRun {
  stage: TutorialStage = 'intro';
  battle: Battle | null = null;
  /** Предупреждение о летящем учебном снаряде (часы боя). */
  warning: { start: number; end: number } | null = null;
  /** Сколько раз щит не успел. */
  shieldMisses = 0;
  /** Этап выполнен, ждём паузу подтверждения. */
  confirmed = false;

  private advanceAt = Infinity;
  private nextShotAt = Infinity;
  private shotInFlight = false;
  private offBattle: (() => void) | null = null;
  private listeners = new Set<Listener>();
  private disposed = false;

  constructor(
    private readonly loadout: Loadout,
    private readonly rng: () => number = Math.random,
  ) {}

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: TutorialEvent) {
    this.listeners.forEach((fn) => fn(e));
  }

  private setStage(stage: TutorialStage) {
    this.stage = stage;
    this.confirmed = false;
    this.advanceAt = Infinity;
    this.emit({ type: 'stage', stage });
  }

  /** Новый бой этапа; подписка на прошлый снимается. */
  private useBattle(level: LevelDef, botEnabled: boolean) {
    this.offBattle?.();
    const b = new Battle(level, this.loadout, this.rng);
    b.botEnabled = botEnabled;
    b.applyModifiers({ allowed: ALLOWED, playerDmgMul: 1, noShield: false });
    this.offBattle = b.on((e) => this.onBattle(e));
    this.battle = b;
    this.warning = null;
    this.shotInFlight = false;
    this.nextShotAt = Infinity;
  }

  /** «Начать»: этап огненного шара. */
  start() {
    if (this.stage !== 'intro' || this.disposed) return;
    this.useBattle(PRACTICE_LEVEL, false);
    this.setStage('fireball');
  }

  /** Повтор только учебной дуэли после поражения. */
  retryDuel() {
    if (this.stage !== 'duelLost' || this.disposed) return;
    this.startDuel();
  }

  private startDuel() {
    this.useBattle(DUEL_LEVEL, true);
    this.setStage('duel');
  }

  /** Каст игрока по событию распознавателя (как в обычном бою). */
  playerCast(spell: SpellId, quality: number, charge: number, shard: number): boolean {
    if (!this.battle || !isActiveStage(this.stage)) return false;
    return this.battle.playerCast(spell, quality, charge, shard);
  }

  /** Один кадр: удерживаемый щит, часы боя, сценарий этапа. */
  tick(dt: number, input: { shield: boolean; charging: boolean }) {
    const b = this.battle;
    if (!b || !isActiveStage(this.stage) || dt <= 0) return;
    b.setPlayerHolds(input.shield, false);
    b.tick(dt, input.charging);
    if (!this.battle || this.battle !== b) return;

    if (this.stage === 'fireball' || this.stage === 'shield') {
      // тренировка: ни игрок, ни манекен не проигрывают
      for (const f of [b.player, b.enemy]) f.hp = Math.max(f.hp, TUTORIAL.practiceMinHp);
    }

    if (this.confirmed && b.t >= this.advanceAt) {
      if (this.stage === 'fireball') {
        this.setStage('shield');
        this.nextShotAt = b.t + TUTORIAL.shieldFirstShotMs;
      } else if (this.stage === 'shield') this.startDuel();
      return;
    }

    if (this.stage === 'shield' && !this.confirmed) {
      if (!this.warning && !this.shotInFlight && b.t >= this.nextShotAt) {
        this.warning = { start: b.t, end: b.t + TUTORIAL.shieldWarnMs };
        b.emit({ type: 'telegraph', spell: 'fireball', ms: TUTORIAL.shieldWarnMs });
      } else if (this.warning && b.t >= this.warning.end) {
        this.warning = null;
        this.shotInFlight = true;
        b.enemyCast('fireball', TUTORIAL.shieldTravelMs);
      }
    }
  }

  private confirm(text: string) {
    this.confirmed = true;
    this.advanceAt = (this.battle?.t ?? 0) + TUTORIAL.confirmMs;
    this.emit({ type: 'notice', text, kind: 'good' });
  }

  private shieldMissed() {
    const b = this.battle!;
    this.shotInFlight = false;
    this.shieldMisses++;
    // промах не наказывается: HP возвращается, выстрел повторяется
    b.player.hp = b.player.maxHp;
    b.player.burningUntil = 0;
    this.nextShotAt = b.t + TUTORIAL.shieldRetryMs;
    this.emit({ type: 'notice', text: tr('Не успел — попробуй ещё раз', 'Too late — try again'), kind: 'bad' });
  }

  private onBattle(e: BattleEvent) {
    this.emit({ type: 'battle', event: e });
    if (this.stage === 'fireball' && !this.confirmed) {
      if (e.type === 'cast' && e.side === 'player' && e.spell === 'fireball') {
        this.confirm(tr('Получилось! Теперь защита', 'You did it! Now defense'));
      }
    } else if (this.stage === 'shield' && !this.confirmed && this.shotInFlight) {
      const blocked = (e.type === 'hit' && e.target === 'player' && e.blocked) || (e.type === 'parry' && e.side === 'player');
      if (blocked) {
        this.shotInFlight = false;
        this.confirm(tr('Щит выдержал! Теперь учебная дуэль', 'The shield held! Now a training duel'));
      } else if ((e.type === 'hit' && e.target === 'player') || e.type === 'dodged') this.shieldMissed();
    } else if (this.stage === 'duel' && e.type === 'end') {
      if (e.winner === 'player') {
        markTutorial('completed');
        this.setStage('done');
      } else this.setStage('duelLost');
    }
  }

  /** «Пропустить» на любом этапе. */
  skip() {
    markTutorial('skipped');
    this.dispose();
  }

  /** Снимает подписки: выход, пропуск, повторный запуск. */
  dispose() {
    this.disposed = true;
    this.offBattle?.();
    this.offBattle = null;
    this.listeners.clear();
  }
}

// --- сохранение ---

/** Есть ли у игрока прогресс: таких не отправляем в обучение автоматически. */
export function hasProgress(s: SaveData): boolean {
  return (
    s.coins > 0 ||
    Object.keys(s.records).length > 0 ||
    s.learned.length > 0 ||
    s.owned.length > 2 ||
    (s.history?.length ?? 0) > 0 ||
    s.online.wins + s.online.losses > 0 ||
    Object.keys(s.achievements ?? {}).length > 0 ||
    !!s.rushBest ||
    !!s.dailyBest ||
    !!s.survivalBest
  );
}

/** Предложить обучение после калибровки: только новому игроку, который его ещё не прошёл и не пропустил. */
export const shouldOfferTutorial = (s: SaveData) => !s.tutorial && !hasProgress(s);

/** Пропуск не затирает уже пройденное обучение (повтор из Академии). */
export function markTutorial(status: 'completed' | 'skipped', now = Date.now()) {
  updateSave((s) => (status === 'skipped' && s.tutorial?.status === 'completed' ? {} : { tutorial: { status, at: now } }));
}

/** Присутствие руки и камеры: учебный бой замирает, а не наказывает игрока. */
export const PRESENCE = { lostMs: 1000, backMs: 600 };

export type PauseReason = 'hand' | 'camera';

export class PresenceWatch {
  private lostSince = 0;
  private backSince = 0;

  /** running — бой идёт; paused — стоит на паузе из-за присутствия. Возвращает действие. */
  update(now: number, s: { handVisible: boolean; cameraOk: boolean; running: boolean; paused: PauseReason | null }):
    | { pause: PauseReason }
    | 'resume'
    | null {
    if (s.running) {
      this.backSince = 0;
      if (!s.cameraOk) return { pause: 'camera' };
      if (s.handVisible) {
        this.lostSince = 0;
        return null;
      }
      this.lostSince ||= now;
      return now - this.lostSince >= PRESENCE.lostMs ? { pause: 'hand' } : null;
    }
    this.lostSince = 0;
    if (!s.paused || !s.cameraOk || !s.handVisible) {
      this.backSince = 0;
      return null;
    }
    this.backSince ||= now;
    return now - this.backSince >= PRESENCE.backMs ? 'resume' : null;
  }
}
