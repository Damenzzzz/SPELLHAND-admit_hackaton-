import type { GestureId } from '../../gestures/types';
import { LEVELS } from './levels';
import { SHIELDS, STAFFS } from './items';

/**
 * Пути к сгенерированным ассетам (scripts/assets.manifest.json → public/assets).
 * Если файла нет, UI откатывается на эмодзи-заглушку.
 */
const A = `${import.meta.env.BASE_URL}assets/`;
const GESTURES: GestureId[] = ['fireball', 'ice', 'lightning', 'wind', 'heal', 'shield'];

export const ASSETS = {
  logo: `${A}images/logo.webp`,
  menuBg: `${A}images/menu_bg.webp`,
  arena: (arena: string) => `${A}images/arenas/${arena}.webp`,
  enemy: (level: number) => `${A}images/enemies/${level}.webp`,
  spell: (g: GestureId) => `${A}images/spells/${g}.webp`,
  staffIcon: (id: string) => `${A}images/staffs/${id}.webp`,
  staffModel: (id: string) => `${A}models/${id}.glb`,
  rune: (shieldId: string) => `${A}images/runes/${shieldId}.webp`,
};

export const PRELOAD_IMAGES: string[] = [
  ASSETS.logo,
  ASSETS.menuBg,
  ...LEVELS.map((l) => ASSETS.arena(l.arena)),
  ...LEVELS.map((l) => ASSETS.enemy(l.id)),
  ...GESTURES.map(ASSETS.spell),
  ...STAFFS.map((s) => ASSETS.staffIcon(s.id)),
  ...SHIELDS.map((s) => ASSETS.rune(s.id)),
];

export const PRELOAD_MODELS: string[] = STAFFS.map((s) => ASSETS.staffModel(s.id));
