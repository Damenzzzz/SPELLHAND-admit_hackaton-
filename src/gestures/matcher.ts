import type { TrackedHand } from '../store/visionStore';
import { computeFeatures, type FingerId, type HandFeatures } from '../vision/features';
import { LandmarkFilter } from '../vision/oneEuro';
import { GESTURE_CONFIG as C } from './config';
import { MotionTrack } from './motion';
import { TEMPLATES, TEMPLATE_BY_ID } from './templates';
import type { ConstraintResult, GestureId, GestureTemplate, TemplateScore } from './types';

export interface Hint {
  kind: 'context' | 'pose' | 'motion';
  gesture?: GestureId;
  lines: string[];
  /** Пальцы для красной подсветки на руке handIdx. */
  fingers: FingerId[];
  handIdx: number;
  /** Стабильный ключ — чтобы UI не перерисовывался каждый кадр. */
  key: string;
}

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
    }
  | { type: 'misfire'; gesture: GestureId; id: string; text: string; t: number }
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
  const run = (h: HandFeatures, other: HandFeatures | null): { score: number; results: ConstraintResult[] } => {
    let sum = 0;
    let wsum = 0;
    const results = tpl.pose.map((c) => {
      const s = c.score(h, { other });
      sum += c.weight * s;
      wsum += c.weight;
      return { id: c.id, label: c.label, hint: c.hint, score: s, fingers: c.fingers ?? [] };
    });
    return { score: sum / wsum, results };
  };

  if (hands.length === 0) {
    return {
      id: tpl.id,
      score: 0,
      handIdx: -1,
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
 * Распознаватель: скоринг шаблонов → стабилизация → движение-триггер → события.
 * Никакой обученной модели: только геометрия landmarks и ограничения из templates.ts.
 */
export class GestureEngine {
  private filters = new Map<string, LandmarkFilter>();
  private tracks = new Map<string, MotionTrack>();
  private keys: string[] = [];
  private listeners = new Set<Listener>();

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
  private lastFlick = 0;
  private weak: { gesture: GestureId; since: number } | null = null;
  private motionHint: { hint: Hint; until: number } | null = null;
  private lastMisfire = 0;

  // near-miss
  private nm: { id: GestureId; since: number; reported: boolean } | null = null;

  // dev
  private devHold: GestureId | null = null;

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GestureEvent) {
    this.listeners.forEach((fn) => fn(e));
  }

  /** dev-режим: держать позу с клавиатуры. */
  setDevHold(g: GestureId | null) {
    this.devHold = g;
  }

  /** dev-режим: мгновенный каст с клавиатуры. */
  devCast(g: GestureId) {
    this.emit({ type: 'cast', gesture: g, quality: 0.92, charge: 1, shard: 1, handIdx: 0, t: performance.now() });
  }

  private assignKeys(hands: TrackedHand[]): string[] {
    const seen = new Map<string, number>();
    return hands.map((h) => {
      const n = seen.get(h.handedness) ?? 0;
      seen.set(h.handedness, n + 1);
      return n ? `${h.handedness}${n}` : h.handedness;
    });
  }

  update(tracked: TrackedHand[], aspect: number, brightness: number, now: number): GestureSnapshot {
    const keys = this.assignKeys(tracked);
    for (const k of this.keys) {
      if (!keys.includes(k)) {
        this.filters.delete(k);
        this.tracks.get(k)?.clear();
      }
    }
    this.keys = keys;

    const hands = tracked.map((h, i) => {
      const key = keys[i];
      let filter = this.filters.get(key);
      if (!filter) this.filters.set(key, (filter = new LandmarkFilter()));
      const pts = filter.apply(h.landmarks, now / 1000);
      const f = computeFeatures(pts, h.handedness, h.score, aspect);
      let track = this.tracks.get(key);
      if (!track) this.tracks.set(key, (track = new MotionTrack()));
      track.push(f, now);
      return f;
    });

    const scores = {} as Record<GestureId, TemplateScore>;
    for (const tpl of TEMPLATES) scores[tpl.id] = evalTemplate(tpl, hands);

    // лучший шаблон; двуручные в приоритете, если распознаны (две ладони = ветер/лечение, а не 2 огненных шара)
    const all = Object.values(scores).sort((a, b) => b.score - a.score);
    const twoHandTop = all.find((s) => TEMPLATE_BY_ID[s.id].hands === 2 && s.score >= C.recognize);
    const best = hands.length ? (twoHandTop ?? all[0]) : null;

    this.stabilize(best, scores, keys, now);

    const activeIdx = this.active ? keys.indexOf(this.activeKey) : -1;
    const debug = this.detectMotion(keys, now);

    const charge =
      this.active === 'fireball'
        ? Math.max(0, Math.min(1, (now - this.activeSince - C.chargeMinMs) / (C.chargeMaxMs - C.chargeMinMs)))
        : 0;

    const hint = this.buildHint(hands, best, brightness, now);

    const devActive = this.devHold;
    return {
      t: now,
      hands,
      scores,
      best: best?.id ?? null,
      bestScore: best?.score ?? 0,
      active: devActive ?? this.active,
      activeSince: devActive ? now : this.activeSince,
      activeHandIdx: activeIdx,
      quality: devActive ? 0.92 : this.quality,
      charge: devActive === 'fireball' ? 1 : charge,
      hint,
      debug,
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
      if (this.lowFrames >= C.releaseFrames || switching || !keys.includes(this.activeKey)) {
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
    this.emit({
      type: 'cast',
      gesture: g,
      quality,
      charge,
      shard,
      handIdx: Math.max(0, keys.indexOf(handKey)),
      t: now,
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

    if (kind === 'push') {
      if (debug.growth >= C.pushGrowth) this.cast(g, armed.key, keys, now, armed.quality, armed.charge);
      else if (debug.growth >= C.pushWeak) this.markWeak(g, now);
    } else if (kind === 'swipeDown') {
      if (v.vy >= C.swipeDown) this.cast(g, armed.key, keys, now, armed.quality, 1);
      else if (v.vy >= C.swipeDownWeak) this.markWeak(g, now);
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
      hint: { kind: 'motion', gesture: g, lines: [text], fingers: [], handIdx: -1, key: `motion:${g}:${now}` },
    };
  }

  private buildHint(hands: HandFeatures[], best: TemplateScore | null, brightness: number, now: number): Hint | null {
    const ctx = (text: string): Hint => ({ kind: 'context', lines: [text], fingers: [], handIdx: -1, key: `ctx:${text}` });

    if (hands.length === 0) {
      this.nm = null;
      return ctx(CONTEXT.noHands);
    }
    const maxPalm = Math.max(...hands.map((h) => h.palmSize));
    if (maxPalm > C.tooClose) return ctx(CONTEXT.tooClose);
    if (maxPalm < C.tooFar) return ctx(CONTEXT.tooFar);
    if (brightness < C.lowBrightness || Math.min(...hands.map((h) => h.confidence)) < C.lowConfidence) {
      return ctx(CONTEXT.lowLight);
    }

    if (this.motionHint && this.motionHint.until > now) return this.motionHint.hint;

    if (this.active || !best || best.score < C.nearMiss || best.score >= C.recognize) {
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
      gesture: best.id,
      lines: failing.map((r) => r.hint),
      fingers: failing.flatMap((r) => r.fingers),
      handIdx: best.handIdx,
      key: `pose:${best.id}:${failing.map((r) => r.id).join(',')}`,
    };
  }
}

export const gestureEngine = new GestureEngine();
