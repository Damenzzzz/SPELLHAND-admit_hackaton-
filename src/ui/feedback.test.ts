import { describe, expect, it } from 'vitest';
import { Battle, type BattleEvent } from '../game/combat';
import { SHIELDS, STAFFS } from '../game/data/items';
import { LEVEL_BY_ID } from '../game/data/levels';
import type { SpellId } from '../gestures/types';
import { telegraphAdvice } from './battleAdvice';
import { armedState } from './ArmedStatus';
import { ToastQueue, TOAST_MAX, TOAST_MS } from './toastQueue';

const loadout = { staff: STAFFS[0], shield: SHIELDS[0] };
function setup() {
  const b = new Battle({ ...LEVEL_BY_ID[1], hp: 5000 }, loadout, () => 0.99);
  b.botEnabled = false;
  const rejects: Extract<BattleEvent, { type: 'reject' }>[] = [];
  b.on((e) => e.type === 'reject' && rejects.push(e));
  return { b, rejects };
}

describe('HUD и движок согласованы: причина до каста = причина отказа при касте', () => {
  const cases: [string, (b: Battle) => void, SpellId, string][] = [
    ['запрещено модификатором', (b) => b.applyModifiers({ allowed: ['ice'], playerDmgMul: 1, noShield: false }), 'fireball', 'banned'],
    ['оглушение', (b) => b.stun('player', 1000), 'fireball', 'stunned'],
    ['перезарядка', (b) => (b.player.cooldowns.lightning = b.t + 2500), 'lightning', 'cooldown'],
    ['заряд сбит ветром', (b) => (b.player.interruptedUntil = b.t + 800), 'fireball', 'interrupted'],
    ['мало маны', (b) => (b.player.mana = 5), 'wind', 'mana'],
  ];
  for (const [name, arrange, spell, kind] of cases) {
    it(name, () => {
      const { b, rejects } = setup();
      arrange(b);
      const shown = armedState(b, spell, 1, 0);
      const block = b.castBlocker(spell)!;
      expect(block.kind).toBe(kind);
      expect(shown.tone).toBe('blocked');
      expect(shown.text).toBe(block.reason);
      expect(b.playerCast(spell, 0.9, 1, 1)).toBe(false);
      expect(rejects.at(-1)).toMatchObject({ kind, reason: block.reason });
    });
  }

  it('готово — HUD не показывает отказ, и каст проходит', () => {
    const { b, rejects } = setup();
    expect(b.castBlocker('fireball')).toBeNull();
    expect(armedState(b, 'fireball', 0.4, 0)).toMatchObject({ tone: 'ready', bar: 0.4 });
    expect(b.playerCast('fireball', 0.9, 0.4, 1)).toBe(true);
    expect(rejects).toEqual([]);
  });

  it('2-й осколок льда не требует маны и перезарядки — HUD не пугает отказом', () => {
    const { b } = setup();
    b.playerCast('ice', 0.9, 1, 1);
    b.player.mana = 0;
    expect(b.castBlocker('ice')?.kind).toBe('cooldown');
    expect(b.castBlocker('ice', true)).toBeNull();
    expect(b.playerCast('ice', 0.9, 1, 2)).toBe(true);
  });

  it('открытая серия льда: HUD не пишет «перезарядка», пока движок принимает осколки 2–3', () => {
    const { b } = setup();
    b.playerCast('ice', 0.9, 1, 1);
    expect(armedState(b, 'ice', 0, 0)).toMatchObject({ tone: 'ready' });
    expect(armedState(b, 'ice', 0, 0).text).toContain('2/3');
    expect(b.playerCast('ice', 0.9, 1, 2)).toBe(true);
    expect(armedState(b, 'ice', 0, 0).text).toContain('3/3');
    expect(b.playerCast('ice', 0.9, 1, 3)).toBe(true);
    // серия исчерпана — теперь действительно перезарядка, и движок откажет новой серии
    expect(armedState(b, 'ice', 0, 0).tone).toBe('blocked');
    expect(b.playerCast('ice', 0.9, 1, 1)).toBe(false);
  });

  it('перегрев огня — отдельное предупреждение, не «готово»', () => {
    const { b } = setup();
    expect(armedState(b, 'fireball', 1, 0.3).tone).toBe('warn');
    expect(armedState(b, 'fireball', 1, 0).tone).toBe('ready');
  });
});

describe('щит и лечение: состояние удержания', () => {
  it('сломан, запрещён, во время лечения — причина; иначе «поднят»', () => {
    const { b } = setup();
    expect(armedState(b, 'shield', 0, 0).tone).toBe('ready');
    b.player.shield.brokenUntil = b.t + 3000;
    expect(b.holdBlocker('shield')?.kind).toBe('cooldown');
    expect(armedState(b, 'shield', 0, 0)).toMatchObject({ tone: 'blocked', text: b.holdBlocker('shield')!.reason });
    b.player.shield.brokenUntil = 0;
    b.shieldLocked = true;
    expect(b.holdBlocker('shield')?.kind).toBe('banned');
    b.shieldLocked = false;
    b.setPlayerHolds(false, true); // лечение пошло
    expect(b.holdBlocker('shield')?.kind).toBe('interrupted');
    expect(armedState(b, 'heal', 0, 0).tone).toBe('ready');
  });

  it('лечение: перезарядка и мана — те же причины, что у отказа движка', () => {
    const { b, rejects } = setup();
    b.player.mana = 5;
    expect(b.holdBlocker('heal')?.kind).toBe('mana');
    b.setPlayerHolds(false, true);
    expect(rejects.at(-1)).toMatchObject({ kind: 'mana', reason: b.holdBlocker('heal')!.reason });
  });
});

describe('совет к телеграфу врага не противоречит состоянию щита', () => {
  it('щит есть — «подними щит»; сломан/запрещён — причина и «лечись или уклоняйся»; лечение — «отпусти»', () => {
    const { b } = setup();
    expect(telegraphAdvice(b, 'fireball')).toContain('Подними щит');
    expect(telegraphAdvice(b, 'lightning')).toContain('половину');
    b.player.shield.brokenUntil = b.t + 2000;
    expect(telegraphAdvice(b, 'fireball')).toMatch(/Щит сломан.*лечись или уклоняйся/);
    b.player.shield.brokenUntil = 0;
    b.shieldLocked = true;
    expect(telegraphAdvice(b, 'fireball')).not.toContain('Подними щит');
    b.shieldLocked = false;
    b.setPlayerHolds(false, true);
    expect(telegraphAdvice(b, 'fireball')).toContain('Отпусти лечение');
  });
});

describe('очередь сообщений', () => {
  it('повтор с тем же ключом не дублируется: текст обновляется, показ продлевается', () => {
    const q = new ToastQueue();
    q.push(0, '⏳ Молния: Перезарядка 3.0 с', 'info', 'reject:lightning:cooldown');
    q.push(500, '⏳ Молния: Перезарядка 2.5 с', 'info', 'reject:lightning:cooldown');
    expect(q.items).toHaveLength(1);
    expect(q.items[0].text).toContain('2.5');
    expect(q.items[0].until).toBe(500 + TOAST_MS);
  });

  it('одинаковый текст подряд — счётчик ×N', () => {
    const q = new ToastQueue();
    q.push(0, 'Горишь!', 'bad', 'burn');
    q.push(100, 'Горишь!', 'bad', 'burn');
    q.push(200, 'Горишь!', 'bad', 'burn');
    expect(q.items).toEqual([expect.objectContaining({ count: 3 })]);
  });

  it('разные ключи — отдельные сообщения, не больше TOAST_MAX; истёкшие убираются', () => {
    const q = new ToastQueue();
    for (let i = 0; i < 5; i++) q.push(i, `m${i}`, 'info');
    expect(q.items.map((t) => t.text)).toEqual(['m2', 'm3', 'm4'].slice(-TOAST_MAX));
    expect(q.prune(10)).toBe(false);
    expect(q.prune(10 + TOAST_MS)).toBe(true);
    expect(q.items).toEqual([]);
    // после истечения тот же ключ — снова новое сообщение
    q.push(5000, 'm1', 'info');
    expect(q.items[0].count).toBe(1);
  });
});

describe('английский интерфейс индикатора', () => {
  it('тексты готовности и отказа переведены', async () => {
    const { useSave } = await import('../store/saveStore');
    const { updateSettings } = await import('../store/settingsStore');
    const prev = useSave.getState();
    try {
      updateSettings({ lang: 'en' });
      const { b } = setup();
      expect(armedState(b, 'fireball', 0.5, 0).text).toBe('Charge 50% — push your palm at the camera');
      b.player.mana = 0;
      expect(armedState(b, 'fireball', 0.5, 0).text).toBe('Not enough mana');
      expect(telegraphAdvice(b, 'fireball')).toBe('Raise your shield — make a fist');
    } finally {
      useSave.setState(prev, true);
    }
  });
});
