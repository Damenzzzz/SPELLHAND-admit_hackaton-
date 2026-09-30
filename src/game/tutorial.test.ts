import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSave, type SaveData } from '../store/saveStore';
import { Battle, type BattleEvent } from './combat';
import { LEVEL_BY_ID } from './data/levels';
import { SHIELDS, STAFFS } from './data/items';
import {
  DUEL_LEVEL,
  hasProgress,
  markTutorial,
  PRESENCE,
  PresenceWatch,
  shouldOfferTutorial,
  TUTORIAL,
  TutorialRun,
  type TutorialEvent,
} from './tutorial';

const loadout = { staff: STAFFS[0], shield: SHIELDS[0] };
const seeded = () => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

const fresh = (): SaveData => ({
  coins: 0, unlocked: 1, owned: ['staff_apprentice', 'shield_basic'],
  equipped: { staff: 'staff_apprentice', shield: 'shield_basic' }, records: {},
  learned: [], palmSign: 1, nickname: 'Маг', online: { wins: 0, losses: 0 },
});

const initial = useSave.getState();
beforeEach(() => useSave.setState(fresh(), true));
afterEach(() => useSave.setState(initial, true));

const idle = { shield: false, charging: false };
function run(r: TutorialRun, ms: number, input = idle, until?: () => boolean) {
  for (let t = 0; t < ms; t += 16) {
    r.tick(16, input);
    if (until?.()) return;
  }
}

function started() {
  const r = new TutorialRun(loadout, seeded());
  const events: TutorialEvent[] = [];
  r.on((e) => events.push(e));
  r.start();
  return { r, events };
}

/** Доводит обучение до учебной дуэли настоящими событиями движка. */
function toDuel() {
  const s = started();
  s.r.playerCast('fireball', 1, 1, 1);
  run(s.r, TUTORIAL.confirmMs + 100);
  run(s.r, 10000, { shield: true, charging: false }, () => s.r.stage === 'duel');
  return s;
}

describe('обучение: этапы', () => {
  it('начинается со вступления и переходит к огненному шару по «Начать»', () => {
    const r = new TutorialRun(loadout, seeded());
    expect(r.stage).toBe('intro');
    expect(r.battle).toBeNull();
    r.start();
    expect(r.stage).toBe('fireball');
  });

  it('на этапе огня противник не атакует', () => {
    const { r, events } = started();
    run(r, 15000);
    const enemyActs = events.filter((e) => e.type === 'battle' && (e.event.type === 'telegraph' || (e.event.type === 'cast' && e.event.side === 'enemy')));
    expect(enemyActs).toEqual([]);
    expect(r.battle!.player.hp).toBe(r.battle!.player.maxHp);
    expect(r.stage).toBe('fireball');
  });

  it('огненный шар засчитывается только когда движок принял каст', () => {
    const { r, events } = started();
    // чужое заклинание в обучении запрещено, без маны каст отклоняется — этап не пройден
    expect(r.playerCast('ice', 1, 1, 1)).toBe(false);
    r.battle!.player.mana = 0;
    expect(r.playerCast('fireball', 1, 1, 1)).toBe(false);
    run(r, TUTORIAL.confirmMs + 200);
    expect(r.stage).toBe('fireball');

    r.battle!.player.mana = r.battle!.player.maxMana;
    expect(r.playerCast('fireball', 1, 1, 1)).toBe(true);
    expect(events).toContainEqual({ type: 'notice', text: 'Получилось! Теперь защита', kind: 'good' });
    expect(r.stage).toBe('fireball'); // подтверждение держится confirmMs
    run(r, TUTORIAL.confirmMs + 50);
    expect(r.stage).toBe('shield');
  });

  it('щит: медленный снаряд с предупреждением; промах не наказывает и даёт повтор', () => {
    const { r, events } = started();
    r.playerCast('fireball', 1, 1, 1);
    run(r, TUTORIAL.confirmMs + 50);
    expect(r.stage).toBe('shield');

    run(r, TUTORIAL.shieldFirstShotMs + 100);
    expect(r.warning).not.toBeNull();
    const shotAt = r.warning!.start;
    run(r, TUTORIAL.shieldWarnMs, idle, () => r.battle!.projectiles.length > 0);
    const shot = r.battle!.projectiles[0];
    expect(shot.to).toBe('player');
    expect(shot.hitT - shot.spawnT).toBe(TUTORIAL.shieldTravelMs);
    expect(shot.spawnT - shotAt).toBeGreaterThanOrEqual(TUTORIAL.shieldWarnMs - 20);

    run(r, TUTORIAL.shieldTravelMs + 100);
    expect(r.shieldMisses).toBe(1);
    expect(r.stage).toBe('shield');
    expect(r.battle!.player.hp).toBe(r.battle!.player.maxHp);
    expect(r.battle!.over).toBe(false);
    expect(events).toContainEqual({ type: 'notice', text: 'Не успел — попробуй ещё раз', kind: 'bad' });

    // повтор: держим щит — снаряд заблокирован, дальше учебная дуэль
    run(r, 10000, { shield: true, charging: false }, () => r.confirmed);
    expect(events.some((e) => e.type === 'battle' && e.event.type === 'hit' && e.event.target === 'player' && e.event.blocked)).toBe(true);
    run(r, TUTORIAL.confirmMs + 50, { shield: true, charging: false });
    expect(r.stage).toBe('duel');
  });

  it('дуэль: слабый противник атакует сам; поражение повторяет только дуэль', () => {
    const { r, events } = toDuel();
    expect(r.stage).toBe('duel');
    const duel = r.battle!;
    expect(duel.enemy.maxHp).toBe(DUEL_LEVEL.hp);
    run(r, 12000);
    expect(events.some((e) => e.type === 'battle' && e.event.type === 'cast' && e.event.side === 'enemy')).toBe(true);

    duel.player.hp = 0;
    run(r, 32);
    expect(r.stage).toBe('duelLost');
    expect(useSave.getState().tutorial).toBeUndefined();

    r.retryDuel();
    expect(r.stage).toBe('duel');
    expect(r.battle).not.toBe(duel);
    expect(r.battle!.enemy.hp).toBe(DUEL_LEVEL.hp);
    expect(r.battle!.player.hp).toBe(r.battle!.player.maxHp);
    expect(events.filter((e) => e.type === 'stage' && e.stage === 'fireball')).toHaveLength(1);
  });

  it('победа в дуэли завершает обучение и сохраняет это', () => {
    const { r } = toDuel();
    const b = r.battle!;
    b.enemy.hp = 1;
    r.playerCast('fireball', 1, 1, 1);
    run(r, 2000, idle, () => r.stage === 'done');
    expect(r.stage).toBe('done');
    expect(useSave.getState().tutorial?.status).toBe('completed');
  });

  it('dispose снимает подписки: события старого боя больше не приходят', () => {
    const { r, events } = started();
    const b = r.battle!;
    r.dispose();
    const n = events.length;
    b.playerCast('fireball', 1, 1, 1);
    expect(events).toHaveLength(n);
    r.start();
    expect(r.stage).toBe('fireball');
    expect(r.battle).toBe(b);
  });
});

describe('обучение: без наград', () => {
  it('весь сценарий не меняет монеты, рекорды, достижения, историю и приёмы', () => {
    const before = structuredClone(useSave.getState());
    const { r } = toDuel();
    r.battle!.player.hp = 0;
    run(r, 32);
    r.retryDuel();
    r.battle!.enemy.hp = 1;
    r.playerCast('fireball', 1, 1, 1);
    run(r, 2000, idle, () => r.stage === 'done');
    expect(r.stage).toBe('done');
    const { tutorial, ...after } = useSave.getState();
    expect(tutorial?.status).toBe('completed');
    expect(after).toEqual(before);
  });
});

describe('обучение: сохранение', () => {
  it('предлагается только новому игроку, который не прошёл и не пропустил его', () => {
    expect(shouldOfferTutorial(fresh())).toBe(true);
    expect(shouldOfferTutorial({ ...fresh(), tutorial: { status: 'skipped', at: 1 } })).toBe(false);
    expect(shouldOfferTutorial({ ...fresh(), tutorial: { status: 'completed', at: 1 } })).toBe(false);
    // старое сохранение без поля tutorial, но с прогрессом — не отправляем принудительно
    expect(shouldOfferTutorial({ ...fresh(), records: { 1: { wins: 1, bestAccuracy: 0.5, bestTimeMs: 1 } } })).toBe(false);
    expect(shouldOfferTutorial({ ...fresh(), learned: ['fireball'] })).toBe(false);
    expect(shouldOfferTutorial({ ...fresh(), coins: 10 })).toBe(false);
    expect(hasProgress({ ...fresh(), nickname: 'Другой', palmSign: -1, settings: { lang: 'en' } })).toBe(false);
  });

  it('пропуск сохраняется и не затирает пройденное обучение', () => {
    const { r } = started();
    r.skip();
    expect(useSave.getState().tutorial?.status).toBe('skipped');
    markTutorial('completed', 5);
    markTutorial('skipped', 6);
    expect(useSave.getState().tutorial).toEqual({ status: 'completed', at: 5 });
  });

  it('поле сохранения добавляется без потери старых данных', () => {
    useSave.setState({ ...fresh(), coins: 420, learned: ['shield'] }, true);
    markTutorial('skipped', 9);
    expect(useSave.getState()).toMatchObject({ coins: 420, learned: ['shield'], tutorial: { status: 'skipped', at: 9 } });
  });
});

describe('обучение: пауза при потере руки или камеры', () => {
  it('пауза после потери руки, возобновление после её возвращения', () => {
    const w = new PresenceWatch();
    const st = (handVisible: boolean, running: boolean, paused: 'hand' | 'camera' | null = null) => ({ handVisible, cameraOk: true, running, paused });
    expect(w.update(0, st(true, true))).toBeNull();
    expect(w.update(100, st(false, true))).toBeNull();
    expect(w.update(100 + PRESENCE.lostMs - 1, st(false, true))).toBeNull();
    expect(w.update(100 + PRESENCE.lostMs, st(false, true))).toEqual({ pause: 'hand' });
    expect(w.update(2000, st(true, false, 'hand'))).toBeNull();
    expect(w.update(2000 + PRESENCE.backMs, st(true, false, 'hand'))).toBe('resume');
  });

  it('потеря камеры ставит паузу сразу; без руки бой не возобновляется', () => {
    const w = new PresenceWatch();
    expect(w.update(0, { handVisible: true, cameraOk: false, running: true, paused: null })).toEqual({ pause: 'camera' });
    expect(w.update(5000, { handVisible: false, cameraOk: true, running: false, paused: 'camera' })).toBeNull();
    expect(w.update(9000, { handVisible: true, cameraOk: false, running: false, paused: 'camera' })).toBeNull();
  });
});

describe('движок: изоляция учебных правил', () => {
  it('обычный бой по-прежнему с ботом, стандартная скорость снаряда', () => {
    const b = new Battle(LEVEL_BY_ID[1], loadout, seeded());
    expect(b.botEnabled).toBe(true);
    const events: BattleEvent[] = [];
    b.on((e) => events.push(e));
    for (let i = 0; i < 400; i++) b.tick(16, false);
    expect(events.some((e) => e.type === 'telegraph')).toBe(true);
    b.enemyCast('fireball');
    const p = b.projectiles.at(-1)!;
    expect(p.hitT - p.spawnT).toBe(650);
  });
});
