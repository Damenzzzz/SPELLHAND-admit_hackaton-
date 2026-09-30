import { afterEach, describe, expect, it } from 'vitest';
import { useSave } from '../../store/saveStore';
import { dailyChallenge } from '../data/daily';
import { SHIELDS, STAFFS } from '../data/items';
import { GHOST_LEVEL, LEVELS, onlineLevel } from '../data/levels';
import { SPELLS } from '../data/spells';
import { applyDailyResult, DAILY_REPLAY_MUL } from '../economy';
import { HUMAN, simulate } from './balanceSim';

const initial = useSave.getState();
afterEach(() => useSave.setState(initial, true));
const BASIC = { staff: STAFFS[0], shield: SHIELDS[0] };

describe('награда испытания дня', () => {
  it('полная за первую победу дня, повтор — половина, новый день — снова полная', () => {
    useSave.setState({ ...initial, coins: 0, dailyRewardedOn: undefined }, true);
    const first = applyDailyResult('2026-10-01', true, 1, 200);
    expect(first).toMatchObject({ coins: 300, firstWin: true });
    const again = applyDailyResult('2026-10-01', true, 1, 200);
    expect(again).toMatchObject({ coins: 300 * DAILY_REPLAY_MUL, firstWin: false });
    const next = applyDailyResult('2026-10-02', true, 1, 200);
    expect(next).toMatchObject({ coins: 300, firstWin: true });
    expect(useSave.getState().coins).toBe(300 + 150 + 300);
  });

  it('поражение ничего не платит и не «тратит» первую победу дня', () => {
    useSave.setState({ ...initial, coins: 0, dailyRewardedOn: undefined }, true);
    expect(applyDailyResult('2026-10-05', false, 1, 200).coins).toBe(0);
    expect(useSave.getState().dailyRewardedOn).toBeUndefined();
    expect(applyDailyResult('2026-10-05', true, 1, 200).firstWin).toBe(true);
  });
});

describe('время реакции на телеграф', () => {
  // игроку нужно увидеть (до 450 мс) + сложить кулак + подтверждение позы
  const need = HUMAN.react[1] + HUMAN.form.fist + HUMAN.arm;

  it('на каждом уровне щит успевает даже на самую быструю атаку (молнию)', () => {
    for (const l of LEVELS) expect(l.telegraphMs + SPELLS.lightning.travelMs, `L${l.id}`).toBeGreaterThanOrEqual(need);
  });

  it('вторая фаза босса быстрее (телеграф ×0.8), но окно не короче среднего времени реакции', () => {
    const boss = LEVELS.find((l) => l.boss?.enrage)!;
    const avg = (HUMAN.react[0] + HUMAN.react[1]) / 2 + HUMAN.form.fist + HUMAN.arm;
    expect(boss.telegraphMs * 0.8 + SPELLS.lightning.travelMs).toBeGreaterThanOrEqual(avg);
  });

  it('темп обычных уровней не ускоряется скачками: интервал и телеграф не растут с 1 по 9', () => {
    const regular = LEVELS.slice(0, 9);
    regular.slice(1).forEach((l, i) => {
      expect(l.castInterval, `L${l.id}`).toBeLessThanOrEqual(regular[i].castInterval);
      expect(l.telegraphMs, `L${l.id}`).toBeLessThanOrEqual(regular[i].telegraphMs);
    });
  });
});

describe('модель боя: крайние случаи', () => {
  it('симуляция детерминирована при одном seed', () => {
    const a = simulate(LEVELS[4], BASIC, 'defensive', 7);
    const b = simulate(LEVELS[4], BASIC, 'defensive', 7);
    expect(b).toEqual(a);
  });

  it('защита и лечение не затягивают бой бесконечно: без таймаутов на всех уровнях', () => {
    for (const l of LEVELS) {
      for (const seed of [1, 2, 3]) {
        const r = simulate(l, BASIC, 'defensive', seed, 180000);
        expect(r.timeout, `L${l.id} seed ${seed}`).toBe(false);
      }
    }
  });

  it('дуэлянт: без парирования бой возможен (стойка режет урон не больше чем на 25%)', () => {
    const t = LEVELS[6].trait;
    expect(t?.kind).toBe('duelist');
    if (t?.kind !== 'duelist') return;
    expect(t.guardMul).toBeGreaterThanOrEqual(0.75);
    expect(t.exposedMul).toBeGreaterThan(1);
  });
});

describe('другие режимы: изменения видны явно', () => {
  it('PvP и Призрак не наследуют параметры уровней кампании', () => {
    expect(onlineLevel('Маг').telegraphMs).toBe(GHOST_LEVEL.telegraphMs);
    expect(GHOST_LEVEL.telegraphMs).toBe(900);
    expect(GHOST_LEVEL.castInterval).toBe(2200);
  });

  it('испытание дня берёт темп из своего базового уровня (включая новые телеграфы)', () => {
    for (let d = 1; d <= 28; d++) {
      const c = dailyChallenge(`2026-11-${String(d).padStart(2, '0')}`);
      const base = LEVELS.find((l) => l.enemyName === c.level.enemyName)!;
      const expected = c.modifier.id === 'short_telegraph' ? base.telegraphMs * 0.5 : base.telegraphMs;
      expect(c.level.telegraphMs).toBe(expected);
    }
  });
});
