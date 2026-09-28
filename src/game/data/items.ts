import type { SpellId } from '../../gestures/types';

export interface StaffDef {
  id: string;
  kind: 'staff';
  name: string;
  icon: string;
  color: string;
  price: number;
  effect: string;
  /** Множители урона по спеллам. */
  spellMul?: Partial<Record<SpellId, number>>;
  /** Множитель всего урона. */
  allMul?: number;
  /** Множитель стоимости маны. */
  manaMul?: number;
  /** Доп. длительность замедления льдом. */
  slowBonusMs?: number;
  /** Пробитие щита молнией (вместо 50%). */
  lightningPierce?: number;
}

export interface ShieldDef {
  id: string;
  kind: 'shield';
  name: string;
  icon: string;
  color: string;
  price: number;
  effect: string;
  durability: number;
  brokenCooldownMs: number;
  /** Доля поглощённого урона, отражаемая обратно. */
  reflect: number;
}

export type ItemDef = StaffDef | ShieldDef;

export const STAFFS: StaffDef[] = [
  { id: 'staff_apprentice', kind: 'staff', name: 'Ученический посох', icon: '🪄', color: '#b89868', price: 0, effect: 'Базовый: ×1.0' },
  { id: 'staff_oak', kind: 'staff', name: 'Дубовый посох', icon: '🌳', color: '#c9803a', price: 200, effect: 'Огонь +10%', spellMul: { fireball: 1.1 } },
  { id: 'staff_ice', kind: 'staff', name: 'Ледяной кристалл', icon: '💎', color: '#8fe3ff', price: 400, effect: 'Лёд +20%, замедление +1 с', spellMul: { ice: 1.2 }, slowBonusMs: 1000 },
  { id: 'staff_thunder', kind: 'staff', name: 'Громовой посох', icon: '🌩️', color: '#e9e45b', price: 700, effect: 'Молния +25%, пробитие щита 60%', spellMul: { lightning: 1.25 }, lightningPierce: 0.6 },
  { id: 'staff_archmage', kind: 'staff', name: 'Посох Архимага', icon: '🔮', color: '#c58bff', price: 1200, effect: 'Весь урон +20%, мана −15%', allMul: 1.2, manaMul: 0.85 },
];

export const SHIELDS: ShieldDef[] = [
  { id: 'shield_basic', kind: 'shield', name: 'Базовый щит', icon: '🛡️', color: '#7fa8ff', price: 0, effect: 'Прочность 100', durability: 100, brokenCooldownMs: 6000, reflect: 0 },
  { id: 'shield_rune', kind: 'shield', name: 'Рунический щит', icon: '🔷', color: '#5fe0ff', price: 300, effect: 'Прочность 160, восстановление после поломки 4 с', durability: 160, brokenCooldownMs: 4000, reflect: 0 },
  { id: 'shield_aegis', kind: 'shield', name: 'Эгида', icon: '🌟', color: '#f2c35b', price: 900, effect: 'Прочность 250, отражает 20% урона', durability: 250, brokenCooldownMs: 6000, reflect: 0.2 },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(
  [...STAFFS, ...SHIELDS].map((i) => [i.id, i]),
);
