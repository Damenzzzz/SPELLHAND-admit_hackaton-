import type { SpellId } from '../../gestures/types';
import type { LevelDef } from './levels';
import { localize } from '../../i18n';

/** Модификатор боя — данные, а не код. Общий для испытания дня и мутаторов кампании. */
export interface Modifier {
  id: string;
  icon: string;
  text: string;
  apply?: (l: LevelDef) => LevelDef;
  /** Разрешённые заклинания игрока (нет — все). */
  allowed?: SpellId[];
  /** Множитель урона игрока. */
  playerDmgMul?: number;
  /** Игрок не может поднять щит. */
  noShield?: boolean;
  /** Бонус к монетам за победу в кампании (доля). */
  reward: number;
}

export const MODIFIERS: Record<string, Modifier> = {
  fire_only: { id: 'fire_only', icon: '🔥', text: 'Только огонь и щит', allowed: ['fireball'], reward: 0.3 },
  no_fire: { id: 'no_fire', icon: '🚫', text: 'Без огня — лёд, молния и ветер', allowed: ['ice', 'lightning', 'wind', 'heal'], reward: 0.2 },
  ice_only: { id: 'ice_only', icon: '❄️', text: 'Только лёд и щит', allowed: ['ice'], reward: 0.4 },
  fast_enemy: { id: 'fast_enemy', icon: '⏩', text: 'Враг колдует на 25% быстрее', apply: (l) => ({ ...l, castInterval: l.castInterval * 0.75 }), reward: 0.25 },
  short_telegraph: { id: 'short_telegraph', icon: '👁️', text: 'Телеграф врага вдвое короче — щит только на реакцию', apply: (l) => ({ ...l, telegraphMs: l.telegraphMs * 0.5 }), reward: 0.25 },
  tank: { id: 'tank', icon: '🐘', text: 'У врага +50% HP', apply: (l) => ({ ...l, hp: Math.round(l.hp * 1.5) }), reward: 0.3 },
  glass: { id: 'glass', icon: '💥', text: 'Оба бьют вдвое сильнее', apply: (l) => ({ ...l, dmgMul: l.dmgMul * 2 }), playerDmgMul: 2, reward: 0.2 },
  shielder: { id: 'shielder', icon: '🛡️', text: 'Враг прячется за щитом — пробивай молнией и ветром', apply: (l) => ({ ...l, shieldChance: 0.6, shieldReact: 0.8 }), reward: 0.25 },
  no_shield: { id: 'no_shield', icon: '💔', text: 'Без щита — только уклонение и лечение', noShield: true, reward: 0.5 },
};

/** Пул испытания дня. Порядок не менять: по нему детерминированно выбирается модификатор дня. */
export const DAILY_POOL = ['fire_only', 'no_fire', 'fast_enemy', 'short_telegraph', 'tank', 'glass', 'shielder'].map((id) => MODIFIERS[id]);

/** Мутаторы, которые игрок сам включает в кампании. */
export const MUTATORS = ['ice_only', 'glass', 'no_shield', 'fast_enemy', 'tank'].map((id) => MODIFIERS[id]);

export const modifiersOf = (ids: readonly string[]) => ids.map((id) => MODIFIERS[id]).filter(Boolean);

/** Сводный эффект нескольких модификаторов. */
export function combineModifiers(mods: readonly Modifier[]) {
  let allowed: SpellId[] | null = null;
  for (const m of mods) {
    if (!m.allowed) continue;
    allowed = allowed ? allowed.filter((s) => m.allowed!.includes(s)) : [...m.allowed];
  }
  return {
    apply: (l: LevelDef) => mods.reduce((acc, m) => (m.apply ? m.apply(acc) : acc), l),
    allowed,
    playerDmgMul: mods.reduce((a, m) => a * (m.playerDmgMul ?? 1), 1),
    noShield: mods.some((m) => m.noShield),
    reward: mods.reduce((a, m) => a + m.reward, 0),
  };
}

localize(MODIFIERS);
