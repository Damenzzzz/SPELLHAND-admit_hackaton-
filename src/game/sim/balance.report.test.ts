import { describe, it } from 'vitest';
import { GHOST_LEVEL, LEVELS } from '../data/levels';
import { SHIELDS, STAFFS } from '../data/items';
import { dailyChallenge } from '../data/daily';
import { battleReward, DAILY_REPLAY_MUL } from '../economy';
import { HUMAN, runMany, simulate, type Strategy } from './balanceSim';
import { SPELLS } from '../data/spells';
import { combineModifiers, modifiersOf, MUTATORS } from '../data/modifiers';

/**
 * Отчёт баланса — диагностика, а не проверка: BALANCE_REPORT=1 npx vitest run src/game/sim
 * N боёв на уровень и стратегию с фиксированными seed.
 */
const N = Number(process.env.BALANCE_N ?? 30);
const STRATS: Strategy[] = ['fireOnly', 'mixed', 'defensive', 'combo'];
const BASIC = { staff: STAFFS[0], shield: SHIELDS[0] };
const staff = (id: string) => STAFFS.find((s) => s.id === id)!;
const shield = (id: string) => SHIELDS.find((s) => s.id === id)!;
/** Время вне боя на повтор: отсчёт 3 с + итоги + навигация жестами ≈ 15 с. */
const OVERHEAD_S = 15;

describe.skipIf(!process.env.BALANCE_REPORT)('отчёт баланса', () => {
  it('кампания: стратегии по уровням (базовое снаряжение)', () => {
    const rows: Record<string, string> = {};
    for (const l of LEVELS) {
      const cells = STRATS.map((s) => {
        const r = runMany(l, BASIC, s, N);
        return `${s}: ${Math.round(r.winRate * 100)}% ${r.medianS}s hp${r.avgHpLeft}${r.timeoutRate ? ` T${Math.round(r.timeoutRate * 100)}%` : ''}`;
      });
      rows[`L${l.id} ${l.enemyName}`] = cells.join(' | ');
    }
    console.log('\n' + Object.entries(rows).map(([k, v]) => `${k.padEnd(28)} ${v}`).join('\n'));
  });

  it('доли заклинаний (mixed / defensive / combo, уровень 7)', () => {
    for (const s of ['mixed', 'defensive', 'combo'] as Strategy[]) console.log(s, JSON.stringify(runMany(LEVELS[6], BASIC, s, N).shareOfCasts));
  });

  it('снаряжение: посохи и щиты на уровнях 5, 8, 10 (стратегия defensive)', () => {
    const loadouts: [string, typeof BASIC][] = [
      ['basic', BASIC],
      ['oak', { ...BASIC, staff: staff('staff_oak') }],
      ['ice', { ...BASIC, staff: staff('staff_ice') }],
      ['thunder', { ...BASIC, staff: staff('staff_thunder') }],
      ['archmage', { ...BASIC, staff: staff('staff_archmage') }],
      ['rune shield', { ...BASIC, shield: shield('shield_rune') }],
      ['aegis', { ...BASIC, shield: shield('shield_aegis') }],
    ];
    for (const [name, lo] of loadouts) {
      const cells = [5, 8, 10].map((id) => {
        const r = runMany(LEVELS[id - 1], lo, 'defensive', N);
        return `L${id}: ${Math.round(r.winRate * 100)}% ${r.medianS}s hp${r.avgHpLeft}`;
      });
      console.log(name.padEnd(12), cells.join(' | '));
    }
  });

  it('экономика: монеты в минуту по режимам (defensive, базовое снаряжение, точность 0.85)', () => {
    const acc = 0.85;
    const perMin = (coins: number, winRate: number, medianS: number) => Math.round((coins * winRate * 60) / (medianS + OVERHEAD_S));
    const lines: string[] = [];
    for (const l of LEVELS) {
      const r = runMany(l, BASIC, 'defensive', N);
      lines.push(`campaign L${l.id}: first ${battleReward(l.id, true, acc, true)} replay ${battleReward(l.id, true, acc, false)} → replay ${perMin(battleReward(l.id, true, acc, false), r.winRate, r.medianS)}/min`);
    }
    const g = runMany(GHOST_LEVEL, BASIC, 'defensive', N);
    // Призрак появляется только после 20 с безуспешного поиска соперника
    lines.push(`ghost: ${Math.round(GHOST_LEVEL.reward * (1 + 0.5 * acc))} per win → ${perMin(Math.round(GHOST_LEVEL.reward * (1 + 0.5 * acc)), g.winRate, g.medianS + 20)}/min`);
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      const d = dailyChallenge(day);
      const r = runMany(d.level, BASIC, 'defensive', N);
      const coins = Math.round(d.level.reward * (1 + 0.5 * acc));
      const replay = Math.round(coins * DAILY_REPLAY_MUL);
      lines.push(`daily ${day} (${d.modifier.id}, base L${LEVELS.find((x) => x.enemyName === d.level.enemyName)?.id}): first ${coins}, replay ${replay}, win ${Math.round(r.winRate * 100)}% → replay ${perMin(replay, r.winRate, r.medianS)}/min`);
    }
    const total = LEVELS.reduce((a, l) => a + battleReward(l.id, true, acc, true), 0);
    lines.push(`all first wins: ${total}; all items: ${[...STAFFS, ...SHIELDS].reduce((a, i) => a + i.price, 0)}`);
    console.log('\n' + lines.join('\n'));
  });

  it('время реакции: успевает ли щит на телеграф (окно = телеграф + полёт; игроку нужно реакция + кулак + подтверждение)', () => {
    const need = [HUMAN.react[0] + HUMAN.form.fist + HUMAN.arm, HUMAN.react[1] + HUMAN.form.fist + HUMAN.arm];
    const lines = [`human needs ${need[0]}–${need[1]} ms`];
    for (const l of [...LEVELS]) {
      const win = (s: keyof typeof SPELLS) => l.telegraphMs + SPELLS[s].travelMs;
      const enr = l.boss?.enrage ? ` enraged lightning ${Math.round(l.telegraphMs * 0.8) + SPELLS.lightning.travelMs}` : '';
      lines.push(`L${l.id}: telegraph ${l.telegraphMs} interval ${l.castInterval} → lightning ${win('lightning')} ice ${win('ice')} fire ${win('fireball')}${enr}`);
    }
    console.log('\n' + lines.join('\n'));
  });

  it('мутаторы: L4 и L8, повтор кампании (defensive)', () => {
    for (const id of [4, 8]) {
      const base = LEVELS[id - 1];
      const combos: [string, string[]][] = [['none', []], ...MUTATORS.map((m) => [m.id, [m.id]] as [string, string[]]), ['glass+tank+fast', ['glass', 'tank', 'fast_enemy']]];
      for (const [name, ids] of combos) {
        const m = combineModifiers(modifiersOf(ids));
        const lvl = m.apply(base);
        const res = Array.from({ length: N }, (_, i) => {
          const r = simulate(lvl, BASIC, 'defensive', i + 1, 240000, m);
          return r;
        });
        const wr = res.filter((x) => x.won).length / N;
        const med = res.map((x) => x.durationMs).sort((a, b) => a - b)[Math.floor(N / 2)] / 1000;
        const coins = battleReward(id, true, 0.85, false, m.reward);
        console.log(`L${id} ${name.padEnd(16)} win ${Math.round(wr * 100)}% ${med.toFixed(1)}s replay ${coins} → ${Math.round((coins * wr * 60) / (med + OVERHEAD_S))}/min`);
      }
    }
  });
});
