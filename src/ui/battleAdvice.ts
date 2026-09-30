import type { Battle } from '../game/combat';
import type { SpellId } from '../gestures/types';
import { tr } from '../i18n';

/** Совет к телеграфу врага, согласованный с состоянием щита (сломан, запрещён, идёт лечение). */
export function telegraphAdvice(battle: Battle, spell: SpellId): string {
  const block = battle.holdBlocker('shield');
  if (!block) {
    return spell === 'lightning' ? tr('Щит держит только половину', 'A shield only blocks half') : tr('Подними щит — сожми кулак', 'Raise your shield — make a fist');
  }
  if (battle.player.healing) return tr('Отпусти лечение и сожми кулак', 'Release healing and make a fist');
  return tr(`${block.reason} — лечись или уклоняйся`, `${block.reason} — heal or dodge`);
}

/** Чем тушить горение: лёд — только если модификатор его не запретил. */
export const canUseIce = (battle: Battle) => !battle.allowedSpells || battle.allowedSpells.includes('ice');
