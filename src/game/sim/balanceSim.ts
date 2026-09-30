import { Battle } from '../combat';
import type { LevelDef } from '../data/levels';
import { SPELLS } from '../data/spells';
import type { Loadout } from '../economy';
import type { SpellId } from '../../gestures/types';

/**
 * Диагностическая симуляция баланса: настоящий движок боя + модель игрока с физическим
 * временем жестов. Не доказывает, что игра приятна, — только показывает перекосы.
 *
 * Модель игрока (мс, по тюнингу распознавателя и README):
 *  - сложить позу после решения: FORM (ладонь/кулак ~400, две руки ~650, рука над головой ~600);
 *  - подтверждение позы распознавателем: ARM = 130;
 *  - огонь: удержание до заряда 1000 ± 250, толчок 150; лёд: кивок 300 на осколок;
 *    молния: взмах 200; ветер: взмах 250; лечение: держать 2000;
 *  - промах жеста (near-miss / осечка): P_FAIL = 15%, тратит ~900 мс, мана не тратится;
 *  - качество жеста ~ 0.8–0.95;
 *  - реакция на телеграф: 350 ± 100 мс увидеть + 250 сложить кулак + ARM.
 */
export const HUMAN = {
  arm: 130,
  form: { palm: 400, fist: 250, twoHands: 650, overhead: 600 },
  fireHold: [750, 1250] as [number, number],
  push: 150,
  flick: 300,
  swipe: 200,
  windSwipe: 250,
  healHold: 2000,
  pFail: 0.15,
  failCost: 900,
  react: [250, 450] as [number, number],
  quality: [0.8, 0.95] as [number, number],
  /** Пауза между действиями (опустить руку, решить). */
  gap: 200,
};

export type Strategy = 'fireOnly' | 'mixed' | 'defensive' | 'combo';

export interface SimResult {
  won: boolean;
  timeout: boolean;
  durationMs: number;
  hpLeft: number;
  casts: Partial<Record<SpellId | 'shield' | 'heal', number>>;
  blocked: number;
  damageTaken: number;
}

export function rngOf(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

type Action =
  | { kind: 'cast'; spell: SpellId; readyAt: number; charging: boolean; holdUntil?: number; shards?: number }
  | { kind: 'shield'; until: number; upAt: number }
  | { kind: 'heal'; until: number; upAt: number }
  | { kind: 'wait'; until: number };

const TICK = 16;

export function simulate(
  level: LevelDef,
  loadout: Loadout,
  strategy: Strategy,
  seed: number,
  capMs = 240000,
  mods?: { allowed: SpellId[] | null; playerDmgMul: number; noShield: boolean },
): SimResult {
  const b = new Battle(level, loadout, rngOf(seed * 7919 + 1));
  if (mods) b.applyModifiers(mods);
  const r = rngOf(seed * 104729 + 7);
  const between = ([a, z]: [number, number]) => a + (z - a) * r();
  const res: SimResult = { won: false, timeout: false, durationMs: 0, hpLeft: 0, casts: {}, blocked: 0, damageTaken: 0 };
  b.on((e) => {
    if (e.type === 'hit' && e.target === 'player') {
      if (e.blocked) res.blocked++;
      res.damageTaken += e.hpDamage;
    }
  });
  let act: Action = { kind: 'wait', until: 300 };
  let seenTelegraph: number | null = null;
  const manaCost = (s: SpellId) => SPELLS[s].mana * (loadout.staff.manaMul ?? 1);
  const ready = (s: SpellId) => b.castBlocker(s) === null;
  const defensive = strategy === 'defensive' || strategy === 'combo';

  /** Начать атаку: время до каста = сложить позу + подтверждение + движение (+ промах). */
  const startCast = (spell: SpellId, now: number): Action => {
    const form = spell === 'wind' ? HUMAN.form.twoHands : spell === 'lightning' ? HUMAN.form.overhead : HUMAN.form.palm;
    let t = now + form + HUMAN.arm;
    if (r() < HUMAN.pFail) t += HUMAN.failCost;
    if (spell === 'fireball') {
      const hold = between(HUMAN.fireHold);
      return { kind: 'cast', spell, readyAt: t + hold + HUMAN.push, charging: true, holdUntil: t };
    }
    const motion = spell === 'ice' ? HUMAN.flick : spell === 'wind' ? HUMAN.windSwipe : HUMAN.swipe;
    return { kind: 'cast', spell, readyAt: t + motion, charging: spell === 'lightning', shards: spell === 'ice' ? 3 : 1 };
  };

  const choose = (now: number): Action => {
    const hp = b.player.hp / b.player.maxHp;
    if (defensive && hp < 0.5 && b.holdBlocker('heal') === null && b.player.mana >= manaCost('heal') + 10) {
      return { kind: 'heal', upAt: now + HUMAN.form.twoHands + HUMAN.arm, until: now + HUMAN.form.twoHands + HUMAN.arm + HUMAN.healHold };
    }
    const enemyShield = b.enemy.shield.up;
    const pick = (): SpellId | null => {
      if (strategy === 'fireOnly') return ready('fireball') ? 'fireball' : null;
      if (strategy === 'combo') {
        const ch = b.comboChain;
        if (ch && b.t - ch.t < 1500) {
          // продолжить пару, если рецепт готов
          const next = b.comboHint()?.options.find((o) => o.status === 'ready');
          if (next && ready(next.def.then)) return next.def.then;
        }
        if (ready('fireball') && ready('lightning') && b.player.mana >= manaCost('fireball') + manaCost('lightning')) return 'fireball';
      }
      if (enemyShield && ready('wind')) return 'wind';
      if (ready('lightning') && b.player.mana >= manaCost('lightning') + 10) return 'lightning';
      if (ready('ice') && b.enemy.slowedUntil < b.t + 500) return 'ice';
      return ready('fireball') ? 'fireball' : ready('ice') ? 'ice' : null;
    };
    const s = pick();
    return s ? startCast(s, now) : { kind: 'wait', until: now + 250 };
  };

  while (!b.over && b.t < capMs) {
    const now = b.t;
    const tg = b.bot.telegraph;
    // защита: увидел телеграф → реакция → кулак. Атаку в процессе бросает (кроме почти готового выстрела).
    if (defensive && tg && seenTelegraph !== tg.start) {
      seenTelegraph = tg.start;
      const casting = act.kind === 'cast' && act.readyAt - now < 250;
      if (!casting && act.kind !== 'heal') {
        const upAt = now + between(HUMAN.react) + HUMAN.form.fist + HUMAN.arm;
        const travel = SPELLS[tg.spell].travelMs + ((SPELLS[tg.spell].hits ?? 1) - 1) * 220;
        act = { kind: 'shield', upAt, until: Math.max(upAt + 300, tg.end + travel + 150) };
      }
    }

    let shieldHeld = false;
    let healHeld = false;
    let charging = false;
    if (act.kind === 'shield') {
      shieldHeld = now >= act.upAt;
      if (now >= act.until) act = { kind: 'wait', until: now + HUMAN.gap };
    } else if (act.kind === 'heal') {
      healHeld = now >= act.upAt;
      if (now >= act.until) act = { kind: 'wait', until: now + HUMAN.gap };
    } else if (act.kind === 'cast') {
      charging = act.charging && now >= (act.holdUntil ?? now);
      if (now >= act.readyAt) {
        // умный игрок не бьёт огнём в поднятый щит, пока заряд не грозит перегревом
        const held = act.holdUntil !== undefined ? now - act.holdUntil : 0;
        if (act.spell === 'fireball' && b.enemy.shield.up && strategy !== 'fireOnly' && held < 1900) {
          // ждём
        } else {
          const q = between(HUMAN.quality);
          const chargeV = act.spell === 'fireball' ? Math.max(0, Math.min(1, (held - 500) / 1000)) : 1;
          if (b.playerCast(act.spell, q, chargeV, 1)) {
            res.casts[act.spell] = (res.casts[act.spell] ?? 0) + 1;
            if (act.spell === 'ice') {
              // осколки 2 и 3 — отдельные кивки
              let t2 = now;
              for (let k = 2; k <= 3; k++) {
                t2 += HUMAN.flick;
                while (b.t < t2 && !b.over) b.tick(TICK, false);
                b.playerCast('ice', q, 1, k);
              }
            }
          }
          act = { kind: 'wait', until: b.t + HUMAN.gap };
        }
      }
    } else if (now >= act.until) {
      act = choose(now);
    }

    b.setPlayerHolds(shieldHeld, healHeld);
    if (act.kind === 'shield' && shieldHeld) res.casts.shield = (res.casts.shield ?? 0) + (now - TICK < act.upAt ? 1 : 0);
    if (act.kind === 'heal' && healHeld && now - TICK < act.upAt) res.casts.heal = (res.casts.heal ?? 0) + 1;
    b.tick(TICK, charging);
  }
  res.won = b.winner === 'player';
  res.timeout = !b.over;
  res.durationMs = b.t;
  res.hpLeft = Math.max(0, b.player.hp);
  return res;
}

export interface Summary {
  winRate: number;
  timeoutRate: number;
  medianS: number;
  avgHpLeft: number;
  shareOfCasts: Partial<Record<string, number>>;
}

export function summarize(results: SimResult[]): Summary {
  const wins = results.filter((x) => x.won);
  const durs = results.map((x) => x.durationMs).sort((a, b) => a - b);
  const casts: Record<string, number> = {};
  for (const x of results) for (const [k, v] of Object.entries(x.casts)) casts[k] = (casts[k] ?? 0) + (v ?? 0);
  const total = Object.values(casts).reduce((a, b) => a + b, 0) || 1;
  return {
    winRate: wins.length / results.length,
    timeoutRate: results.filter((x) => x.timeout).length / results.length,
    medianS: Math.round(durs[Math.floor(durs.length / 2)] / 100) / 10,
    avgHpLeft: Math.round(wins.reduce((a, x) => a + x.hpLeft, 0) / (wins.length || 1)),
    shareOfCasts: Object.fromEntries(Object.entries(casts).map(([k, v]) => [k, Math.round((v / total) * 100)])),
  };
}

export function runMany(level: LevelDef, loadout: Loadout, strategy: Strategy, n: number, capMs?: number) {
  return summarize(Array.from({ length: n }, (_, i) => simulate(level, loadout, strategy, i + 1, capMs)));
}
