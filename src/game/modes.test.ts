import { describe, expect, it } from 'vitest';
import { Battle } from './combat';
import { LEVEL_BY_ID, LEVELS } from './data/levels';
import { SHIELDS, STAFFS } from './data/items';
import { combineModifiers, DAILY_POOL, modifiersOf, MUTATORS } from './data/modifiers';
import { survivalCoins, survivalLevel } from './data/survival';
import { battleReward } from './economy';
import { levelStars, starsFor } from './stars';

const loadout = { staff: STAFFS[0], shield: SHIELDS[0] };

describe('звёзды', () => {
  it('★ победа, ★ точность ≥ 80%, ★ ≥ 50% HP', () => {
    expect(starsFor(false, 1, 1)).toBe(0);
    expect(starsFor(true, 0.5, 0.2)).toBe(1);
    expect(starsFor(true, 0.8, 0.2)).toBe(2);
    expect(starsFor(true, 0.5, 0.5)).toBe(2);
    expect(starsFor(true, 0.95, 0.9)).toBe(3);
  });
  it('лучшие звёзды уровня не падают, без побед — 0', () => {
    expect(levelStars(undefined)).toBe(0);
    expect(levelStars({ wins: 0, bestAccuracy: 1, bestTimeMs: 1 })).toBe(0);
    expect(levelStars({ wins: 2, bestAccuracy: 0.5, bestTimeMs: 1, stars: 3 })).toBe(3);
  });
});

describe('мутаторы', () => {
  it('пул испытания дня не изменился — выбор дня детерминирован как раньше', () => {
    expect(DAILY_POOL.map((m) => m.id)).toEqual(['fire_only', 'no_fire', 'fast_enemy', 'short_telegraph', 'tank', 'glass', 'shielder']);
  });
  it('складываются: уровень, урон игрока, щит и бонус монет', () => {
    const m = combineModifiers(modifiersOf(['glass', 'tank', 'no_shield']));
    const l = m.apply(LEVEL_BY_ID[3]);
    expect(l.hp).toBe(Math.round(LEVEL_BY_ID[3].hp * 1.5));
    expect(l.dmgMul).toBeCloseTo(LEVEL_BY_ID[3].dmgMul * 2);
    expect(m.playerDmgMul).toBe(2);
    expect(m.noShield).toBe(true);
    expect(m.reward).toBeCloseTo(1);
    expect(battleReward(3, true, 0, true, m.reward)).toBe(battleReward(3, true, 0, true) * 2);
  });
  it('«стеклянная пушка» удваивает урон игрока, «без щита» не даёт поднять щит', () => {
    const plain = new Battle(LEVEL_BY_ID[1], loadout, () => 0.5);
    const glass = new Battle(LEVEL_BY_ID[1], loadout, () => 0.5);
    glass.applyModifiers(combineModifiers(modifiersOf(['glass', 'no_shield'])));
    plain.playerCast('fireball', 1, 1, 1);
    glass.playerCast('fireball', 1, 1, 1);
    expect(glass.projectiles[0].damage).toBe(plain.projectiles[0].damage * 2);
    glass.setPlayerHolds(true, false);
    expect(glass.player.shield.up).toBe(false);
  });
  it('«только лёд» запрещает остальные заклинания', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, () => 0.5);
    b.applyModifiers(combineModifiers(MUTATORS.filter((m) => m.id === 'ice_only')));
    expect(b.playerCast('fireball', 1, 1, 1)).toBe(false);
    expect(b.playerCast('ice', 1, 0, 1)).toBe(true);
  });
});

describe('башня выживания', () => {
  it('враги идут по кругу кампании и усиливаются на каждом круге', () => {
    expect(survivalLevel(1).enemyName).toBe(LEVELS[0].enemyName);
    const first = survivalLevel(3);
    const second = survivalLevel(3 + LEVELS.length);
    expect(second.enemyName).toBe(first.enemyName);
    expect(second.hp).toBeGreaterThan(first.hp);
    expect(second.dmgMul).toBeGreaterThan(first.dmgMul);
    expect(survivalLevel(95).castInterval).toBeGreaterThanOrEqual(900);
  });
  it('монеты растут с волнами и точностью', () => {
    expect(survivalCoins(0, 1)).toBe(0);
    expect(survivalCoins(3, 0)).toBe(20 + 25 + 30);
    expect(survivalCoins(3, 1)).toBeGreaterThan(survivalCoins(3, 0.5));
  });
});
