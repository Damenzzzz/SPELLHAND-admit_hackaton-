import type { TrackedHand } from '../store/visionStore';
import { computeFeatures, type FingerId, type HandFeatures } from '../vision/features';
import { LandmarkFilter } from '../vision/oneEuro';
import { GESTURE_CONFIG as C } from './config';
import { HandIdentity } from './handIdentity';
import { applyPersonal } from './personal';
import { RuneTracker, type RuneEvent } from './runes/tracker';
import { MotionTrack } from './motion';
import { TEMPLATES, TEMPLATE_BY_ID } from './templates';
import type { ConstraintResult, GestureId, GestureTemplate, TemplateScore } from './types';

export interface Hint {
  kind: 'context' | 'pose' | 'motion';
  /** Причина провала для HUD: форма руки / движение / кадр / свет. */
  category: FailCategory;
  gesture?: GestureId;
  lines: string[];
  /** Пальцы для красной подсветки на руке handIdx. */
  fingers: FingerId[];
  handIdx: number;
  /** Стабильный ключ — чтобы UI не перерисовывался каждый кадр. */
  key: string;
}

export type FailCategory = 'shape' | 'motion' | 'frame' | 'light';

export type GestureEvent =
  | {
      type: 'cast';
      gesture: GestureId;
      quality: number;
      /** 0..1 — заряд огненного шара. */
      charge: number;
      /** Номер ледяного осколка в серии (1..3). */
      shard: number;
      handIdx: number;
      t: number;
      /** Самое слабое ограничение позы на момент каста (для «Слабо: …»). */
      weakest?: { id: string; hint: string; score: number };
    }
  | { type: 'misfire'; gesture: GestureId; id: string; text: string; t: number }
  /** Огненный шар держали слишком долго — взорвался в руке. */
  | { type: 'overcharge'; gesture: GestureId; t: number }
  | RuneEvent
  | {
      type: 'nearMiss';
      gesture: GestureId;
      constraints: { id: string; hint: string }[];
      t: number;
    };

export interface GestureSnapshot {
  t: number;
  hands: HandFeatures[];
  scores: Record<GestureId, TemplateScore>;
  best: GestureId | null;
  bestScore: number;
  /** Взведённая (стабильно распознанная) поза. */
  active: GestureId | null;
  activeSince: number;
  activeHandIdx: number;
  /** Сглаженное качество активной позы 0..1. */
  quality: number;
  /** Заряд огненного шара 0..1. */
  charge: number;
  /** 0..1 — опасность перезаряда (после полного заряда до взрыва в руке). */
  overcharge: number;
  /** Перо руны: опущено ли и след кончика (нормированные координаты кадра). */
  rune: { penDown: boolean; trail: { x: number; y: number }[] };
  hint: Hint | null;
  debug: { growth: number; vx: number; vy: number; tipVy: number };
}

type Listener = (e: GestureEvent) => void;

const CONTEXT = {
  noHands: 'Покажи руку камере',
  tooClose: 'Отойди на шаг назад',
  tooFar: 'Подойди ближе к камере',
  lowLight: 'Мало света — повернись к окну или лампе',
};

function evalTemplate(tpl: GestureTemplate, hands: HandFeatures[]): TemplateScore {
  const run = (
    h: HandFeatures,
    other: HandFeatures | null,
  ): { score: number; results: ConstraintResult[]; intent: boolean } => {
    let sum = 0;
    let wsum = 0;
    const results = tpl.pose.map((c) => {
      const s = c.score(h, { other });
      sum += c.weight * s;
      wsum += c.weight;
      return { id: c.id, label: c.label, hint: c.hint, score: s, fingers: c.fingers ?? [] };
    });
    return { score: sum / wsum, results, intent: tpl.intent(h, { other }) };
  };

  if (hands.length === 0) {
    return {
      id: tpl.id,
      score: 0,
      handIdx: -1,
      intent: false,
      results: tpl.pose.map((c) => ({ id: c.id, label: c.label, hint: c.hint, score: 0, fingers: c.fingers ?? [] })),
    };
  }

  if (tpl.hands === 2) {
    return { id: tpl.id, handIdx: 0, ...run(hands[0], hands[1] ?? null) };
  }

  let best: TemplateScore | null = null;
  hands.forEach((h, i) => {
    const r = run(h, null);
    if (!best || r.score > best.score) best = { id: tpl.id, handIdx: i, ...r };
  });
  return best!;
}

/**
 * Кандидат для подсказки near-miss: шаблоны, которые игрок явно пытается показать
 * (intent), в диапазоне [nearMiss; recognize); двуручные — в приоритете.
 */
function nearMissCandidate(scores: Record<GestureId, TemplateScore>): TemplateScore | null {
  const inRange = Object.values(scores)
    .filter((s) => s.intent && s.score >= C.nearMiss && s.score < C.recognize)
    .sort((a, b) => b.score - a.score);
  return inRange.find((s) => TEMPLATE_BY_ID[s.id].hands === 2) ?? inRange[0] ?? null;
}

/**
 * Распознаватель: скоринг шаблонов → стабилизация → движение-триггер → события.
 * Никакой обученной модели: только геометрия landmarks и ограничения из templates.ts.
 */
export class GestureEngine {
  private filters = new Map<string, LandmarkFilter>();
  private tracks = new Map<string, MotionTrack>();
  private keys: string[] = [];
  private listeners = new Set<Listener>();
  private identity = new HandIdentity();
  private runes = new RuneTracker();
  private lastScores: Record<GestureId, TemplateScore> | null = null;

  // стабилизация
  private candidate: GestureId | null = null;
  private stable = 0;
  private active: GestureId | null = null;
  private activeSince = 0;
  private activeKey = '';
  private lowFrames = 0;
  private quality = 0;
  private locks = new Map<GestureId, number>();

  // окно «после потери позы»
  private grace: { gesture: GestureId; key: string; until: number; quality: number; charge: number } | null =
    null;

  // движение
  private shards = 0;
  private lastFlick = -Infinity;
  private weak: { gesture: GestureId; since: number } | null = null;
  private motionHint: { hint: Hint; until: number } | null = null;
  private lastMisfire = -Infinity;

  // near-miss
  private nm: { id: GestureId; since: number; reported: boolean } | null = null;

  // dev
  private devHold: GestureId | null = null;
  private devHoldSince = 0;

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GestureEvent) {
    this.listeners.forEach((fn) => fn(e));
  }

  /** dev-режим: держать позу с клавиатуры. */
  setDevHold(g: GestureId | null) {
    if (g !== this.devHold) this.devHoldSince = performance.now();
    this.devHold = g;
  }

  /** dev-режим: мгновенный каст с клавиатуры. */
  devCast(g: GestureId) {
    this.emit({ type: 'cast', gesture: g, quality: 0.92, charge: 1, shard: 1, handIdx: 0, t: performance.now() });
  }

  update(tracked: TrackedHand[], aspect: number, brightness: number, now: number): GestureSnapshot {
    const { keys, handedness, alive } = this.identity.assign(tracked, now);
    for (const k of this.keys) {
      if (!alive.includes(k)) {
        this.filters.delete(k);
        this.tracks.get(k)?.clear();
        this.tracks.delete(k);
      }
    }
    this.keys = alive;

    const hands = tracked.map((h, i) => {
      const key = keys[i];
      let filter = this.filters.get(key);
      if (!filter) this.filters.set(key, (filter = new LandmarkFilter()));
      const pts = filter.apply(h.landmarks, now / 1000);
      const f = computeFeatures(pts, handedness[i], h.score, aspect);
      let track = this.tracks.get(key);
      if (!track) this.tracks.set(key, (track = new MotionTrack()));
      track.push(f, now);
      return f;
    });

    const scores = {} as Record<GestureId, TemplateScore>;
    for (const tpl of TEMPLATES) scores[tpl.id] = evalTemplate(tpl, hands);
    applyPersonal(scores, hands);
    this.lastScores = scores;

    // руна: пока перо опущено, обычные жесты не взводятся (росчерк ≠ огненный шар)
    const rune = this.runes.update(hands, now);
    if (rune.event) this.onRuneEvent(rune.event, now);
    if (rune.penDown) {
      this.candidate = null;
      this.stable = 0;
      if (this.active) this.deactivate(now, false);
    }

    // лучший шаблон; двуручные в приоритете, если распознаны (две ладони = ветер/лечение, а не 2 огненных шара)
    const all = Object.values(scores).sort((a, b) => b.score - a.score);
    const twoHandTop = all.find((s) => TEMPLATE_BY_ID[s.id].hands === 2 && s.score >= C.recognize);
    const best = hands.length ? (twoHandTop ?? all[0]) : null;

    if (!rune.penDown) this.stabilize(best, scores, keys, now);
    this.checkOvercharge(now);

    const activeIdx = this.active ? keys.indexOf(this.activeKey) : -1;
    const debug = this.detectMotion(keys, now);

    const charge =
      this.active === 'fireball'
        ? Math.max(0, Math.min(1, (now - this.activeSince - C.chargeMinMs) / (C.chargeMaxMs - C.chargeMinMs)))
        : 0;
    const overcharge =
      this.active === 'fireball'
        ? Math.max(0, Math.min(1, (now - this.activeSince - C.chargeMaxMs) / (C.overchargeMs - C.chargeMaxMs)))
        : 0;

    const hint = rune.penDown ? null : this.buildHint(hands, nearMissCandidate(scores), brightness, now);

    const devActive = this.devHold;
    return {
      t: now,
      hands,
      scores,
      best: best?.id ?? null,
      bestScore: best?.score ?? 0,
      active: devActive ?? this.active,
      activeSince: devActive ? this.devHoldSince : this.activeSince,
      activeHandIdx: activeIdx,
      quality: devActive ? 0.92 : this.quality,
      charge: devActive === 'fireball' ? 1 : charge,
      overcharge: devActive ? 0 : overcharge,
      rune: { penDown: rune.penDown, trail: rune.trail },
      hint,
      debug,
    };
  }

  private onRuneEvent(e: RuneEvent, now: number) {
    this.emit(e);
    if (e.type === 'runeFail') {
      this.motionHint = {
        until: now + 2000,
        hint: { kind: 'motion', category: 'motion', lines: [e.reason], fingers: [], handIdx: -1, key: `rune:${now}` },
      };
    }
  }

  /** Перезаряд: шар держат дольше overchargeMs — срыв, поза снимается и блокируется. */
  private checkOvercharge(now: number) {
    if (this.active !== 'fireball' || now - this.activeSince < C.overchargeMs) return;
    this.emit({ type: 'overcharge', gesture: 'fireball', t: now });
    this.locks.set('fireball', now + 1000);
    this.deactivate(now, false);
    this.candidate = null;
    this.stable = 0;
    this.motionHint = {
      until: now + 1500,
      hint: {
        kind: 'motion',
        category: 'motion',
        gesture: 'fireball',
        lines: ['Перезаряд! Толкай шар, пока он не раскалился'],
        fingers: [],
        handIdx: -1,
        key: `overcharge:${now}`,
      },
    };
  }

  private locked(g: GestureId, now: number) {
    return (this.locks.get(g) ?? 0) > now;
  }

  private stabilize(
    best: TemplateScore | null,
    scores: Record<GestureId, TemplateScore>,
    keys: string[],
    now: number,
  ) {
    if (best && best.score >= C.recognize && !this.locked(best.id, now)) {
      if (this.candidate === best.id) this.stable++;
      else {
        this.candidate = best.id;
        this.stable = 1;
      }
    } else {
      this.candidate = null;
      this.stable = 0;
    }

    if (this.active) {
      const s = scores[this.active].score;
      this.lowFrames = s < C.release ? this.lowFrames + 1 : 0;
      this.quality = this.quality * 0.85 + s * 0.15;
      const switching = this.candidate && this.candidate !== this.active && this.stable >= C.stableFrames;
      if (this.lowFrames >= C.releaseFrames || switching || !this.keys.includes(this.activeKey)) {
        this.deactivate(now, true);
      }
    }

    if (!this.active && this.candidate && this.stable >= C.stableFrames) {
      const s = scores[this.candidate];
      this.active = this.candidate;
      this.activeSince = now;
      this.activeKey = keys[s.handIdx] ?? keys[0];
      this.quality = s.score;
      this.lowFrames = 0;
      this.shards = 0;
      this.grace = null;
      this.nm = null;
    }
  }

  private deactivate(now: number, withGrace: boolean) {
    if (this.active && withGrace) {
      const held = now - this.activeSince;
      this.grace = {
        gesture: this.active,
        key: this.activeKey,
        until: now + C.motionGraceMs,
        quality: this.quality,
        charge: Math.max(0, Math.min(1, (held - C.chargeMinMs) / (C.chargeMaxMs - C.chargeMinMs))),
      };
    } else {
      this.grace = null;
    }
    this.active = null;
    this.lowFrames = 0;
  }

  private cast(g: GestureId, handKey: string, keys: string[], now: number, quality: number, charge: number) {
    this.weak = null;
    const shard = g === 'ice' ? ++this.shards : 1;
    const results = this.lastScores?.[g]?.results ?? [];
    const w = results.reduce<(typeof results)[number] | null>((a, r) => (!a || r.score < a.score ? r : a), null);
    this.emit({
      type: 'cast',
      gesture: g,
      quality,
      charge,
      shard,
      handIdx: Math.max(0, keys.indexOf(handKey)),
      t: now,
      weakest: w ? { id: w.id, hint: w.hint, score: w.score } : undefined,
    });
    const seriesDone = g !== 'ice' || this.shards >= C.maxShards;
    if (seriesDone) {
      this.locks.set(g, now + C.castLockMs);
      this.deactivate(now, false);
      this.candidate = null;
      this.stable = 0;
    }
  }

  private markWeak(g: GestureId, now: number) {
    if (!this.weak || this.weak.gesture !== g) this.weak = { gesture: g, since: now };
  }

  private detectMotion(keys: string[], now: number) {
    const debug = { growth: 0, vx: 0, vy: 0, tipVy: 0 };
    const armed = this.active
      ? {
          gesture: this.active,
          key: this.activeKey,
          quality: this.quality,
          charge: Math.max(
            0,
            Math.min(1, (now - this.activeSince - C.chargeMinMs) / (C.chargeMaxMs - C.chargeMinMs)),
          ),
        }
      : this.grace && this.grace.until > now
        ? this.grace
        : null;

    if (!armed) {
      this.resolveWeak(now);
      return debug;
    }

    const track = this.tracks.get(armed.key);
    if (!track || track.size < 3) return debug;

    const kind = TEMPLATE_BY_ID[armed.gesture].motion.kind;
    const g = armed.gesture;
    debug.growth = track.pushGrowth();
    const v = track.velocity();
    debug.vx = v.vx;
    debug.vy = v.vy;
    debug.tipVy = track.tipVelocityY();

    // рука пропала из кадра прямо во время быстрого движения (смаз, ушла за край) —
    // это и есть толчок/взмах, а не потеря жеста
    const vanished = !keys.includes(armed.key);

    if (kind === 'push') {
      if (debug.growth >= C.pushGrowth || (vanished && debug.growth >= C.pushWeak)) {
        this.cast(g, armed.key, keys, now, armed.quality, armed.charge);
      } else if (debug.growth >= C.pushWeak) this.markWeak(g, now);
    } else if (kind === 'swipeDown') {
      if (v.vy >= C.swipeDown || (vanished && v.vy >= C.swipeDownWeak)) {
        this.cast(g, armed.key, keys, now, armed.quality, 1);
      } else if (v.vy >= C.swipeDownWeak) this.markWeak(g, now);
    } else if (kind === 'flickDown') {
      if (debug.tipVy >= C.flickDown && now - this.lastFlick >= C.flickRefractoryMs) {
        this.lastFlick = now;
        this.cast(g, armed.key, keys, now, armed.quality, 1);
      } else if (debug.tipVy >= C.flickDownWeak && now - this.lastFlick >= C.flickRefractoryMs) {
        this.markWeak(g, now);
      }
    } else if (kind === 'swipeSide') {
      const otherKey = keys.find((k) => k !== armed.key);
      const other = otherKey ? this.tracks.get(otherKey)?.velocity() : null;
      if (other) {
        const same = Math.sign(v.vx) === Math.sign(other.vx);
        const slow = Math.min(Math.abs(v.vx), Math.abs(other.vx));
        const fast = Math.max(Math.abs(v.vx), Math.abs(other.vx));
        if (same && slow >= C.swipeSide) {
          this.cast(g, armed.key, keys, now, armed.quality, 1);
        } else if (fast >= C.swipeSideWeak) {
          this.markWeak(g, now);
        }
      }
    }

    this.resolveWeak(now);
    return debug;
  }

  /** Слабое движение без полноценного за weakResolveMs → осечка с объяснением. */
  private resolveWeak(now: number) {
    if (!this.weak || now - this.weak.since < C.weakResolveMs) return;
    const g = this.weak.gesture;
    this.weak = null;
    if (now - this.lastMisfire < 1000) return;
    this.lastMisfire = now;
    const text = TEMPLATE_BY_ID[g].motion.weakHint;
    this.emit({ type: 'misfire', gesture: g, id: `${g}_motion_weak`, text, t: now });
    this.motionHint = {
      until: now + 1500,
      hint: {
        kind: 'motion',
        category: 'motion',
        gesture: g,
        lines: [text],
        fingers: [],
        handIdx: -1,
        key: `motion:${g}:${now}`,
      },
    };
  }

  private buildHint(hands: HandFeatures[], best: TemplateScore | null, brightness: number, now: number): Hint | null {
    const ctx = (text: string, category: FailCategory = 'frame'): Hint => ({
      kind: 'context',
      category,
      lines: [text],
      fingers: [],
      handIdx: -1,
      key: `ctx:${text}`,
    });

    if (hands.length === 0) {
      this.nm = null;
      return ctx(CONTEXT.noHands);
    }
    // поза взведена (например, поднят щит) — советы по обстановке ей не мешают
    if (this.active) {
      this.nm = null;
      return null;
    }
    const maxPalm = Math.max(...hands.map((h) => h.palmSize));
    if (maxPalm > C.tooClose) return ctx(CONTEXT.tooClose);
    if (maxPalm < C.tooFar) return ctx(CONTEXT.tooFar);
    // только по яркости кадра: уверенность MediaPipe в handedness — не качество детекции,
    // на кулаке и руке боком она штатно падает
    if (brightness < C.lowBrightness) return ctx(CONTEXT.lowLight, 'light');

    if (this.motionHint && this.motionHint.until > now) return this.motionHint.hint;

    if (!best || best.score < C.nearMiss || best.score >= C.recognize) {
      this.nm = null;
      return null;
    }

    if (!this.nm || this.nm.id !== best.id) this.nm = { id: best.id, since: now, reported: false };
    if (now - this.nm.since < C.nearMissMs) return null;

    const sorted = [...best.results].sort((a, b) => a.score - b.score);
    let failing = sorted.filter((r) => r.score < C.constraintFail).slice(0, C.hintCount);
    if (!failing.length) failing = sorted.slice(0, 1);

    if (!this.nm.reported) {
      this.nm.reported = true;
      this.emit({
        type: 'nearMiss',
        gesture: best.id,
        constraints: failing.map((r) => ({ id: r.id, hint: r.hint })),
        t: now,
      });
    }

    return {
      kind: 'pose',
      // нет второй руки — это про кадр, а не про форму ладони
      category: failing.some((r) => r.id === 'two_hands') ? 'frame' : 'shape',
      gesture: best.id,
      lines: failing.map((r) => r.hint),
      fingers: failing.flatMap((r) => r.fingers),
      handIdx: best.handIdx,
      key: `pose:${best.id}:${failing.map((r) => r.id).join(',')}`,
    };
  }
}

export const gestureEngine = new GestureEngine();
