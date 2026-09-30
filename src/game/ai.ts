import type { SpellId } from '../gestures/types';
import type { Battle } from './combat';
import { COMBAT } from './data/spells';

/**
 * Бот: idle → выбор спелла (веса уровня) → телеграф (руна заряда) → каст.
 * Телеграф даёт игроку окно поднять щит. С вероятностью shieldReact бот сам
 * ставит щит, когда игрок заряжает атаку.
 */
export class BotAI {
  state: 'idle' | 'telegraph' = 'idle';
  telegraph: { spell: SpellId; start: number; end: number } | null = null;
  speedMul = 1;
  private nextCastAt = 2000;
  private shieldUntil = 0;
  private reacted = false;

  constructor(private battle: Battle) {}

  private pickSpell(): SpellId {
    const b = this.battle;
    // горит — гасит себя льдом, если умеет
    const burning = b.enemy.burningUntil > b.t;
    const entries = (Object.entries(b.level.spellWeights) as [SpellId, number][]).map(
      ([s, w]) => [s, burning && s === 'ice' ? w * 4 : w] as [SpellId, number],
    );
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = this.battle.rng() * total;
    for (const [spell, w] of entries) {
      r -= w;
      if (r <= 0) return spell;
    }
    return entries[0][0];
  }

  private raiseShield() {
    const b = this.battle;
    if (b.enemy.shield.brokenUntil) return;
    this.shieldUntil = b.t + COMBAT.botShieldMs;
    b.setShield('enemy', true);
  }

  /** Особая атака противника: обычный каст не раньше чем через ms. */
  delay(ms: number) {
    this.nextCastAt = Math.max(this.nextCastAt, this.battle.t + ms);
  }

  interrupt() {
    if (this.state !== 'telegraph') return;
    this.state = 'idle';
    this.telegraph = null;
    this.nextCastAt = this.battle.t + 1200;
  }

  tick(playerCharging: boolean) {
    const b = this.battle;
    const { level, enemy, t } = b;
    const slow = t < enemy.slowedUntil ? 1 + enemy.slowFactor : 1;

    if (enemy.shield.up && t >= this.shieldUntil) b.setShield('enemy', false);

    // ледяная тюрьма: заморожен — не колдует и не телеграфирует
    if (t < enemy.frozenUntil) {
      this.nextCastAt = Math.max(this.nextCastAt, enemy.frozenUntil + 400);
      return;
    }

    // оглушён «Паровым взрывом» — не колдует
    if (t < enemy.stunnedUntil) {
      this.nextCastAt = Math.max(this.nextCastAt, enemy.stunnedUntil + 300);
      return;
    }

    // особая механика (подготовка, замах, оглушение) — бот ждёт
    if (b.trait?.holdsBot) {
      this.nextCastAt = Math.max(this.nextCastAt, t + 600);
      return;
    }

    if (playerCharging && !this.reacted) {
      this.reacted = true;
      if (b.rng() < level.shieldReact) this.raiseShield();
    } else if (!playerCharging) {
      this.reacted = false;
    }

    if (this.state === 'idle' && t >= this.nextCastAt) {
      if (level.shieldChance && b.rng() < level.shieldChance && !enemy.shield.up) {
        this.raiseShield();
        this.nextCastAt = t + level.castInterval * 0.6 * this.speedMul;
        return;
      }
      const spell = this.pickSpell();
      // во второй фазе босса телеграф короче
      const ms = level.telegraphMs * (this.speedMul < 1 ? 0.8 : 1) * slow;
      this.state = 'telegraph';
      this.telegraph = { spell, start: t, end: t + ms };
      b.emit({ type: 'telegraph', spell, ms });
    }

    if (this.state === 'telegraph' && this.telegraph && t >= this.telegraph.end) {
      b.enemyCast(this.telegraph.spell);
      this.state = 'idle';
      this.telegraph = null;
      this.nextCastAt = t + level.castInterval * this.speedMul * slow * (0.85 + 0.3 * b.rng());
    }
  }
}
