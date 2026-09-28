import { ASSETS } from '../game/data/assets';
import { TEMPLATE_BY_ID } from '../gestures/templates';
import type { GestureId } from '../gestures/types';
import { AssetImg } from './AssetImg';

export function SpellIcon({ id, className }: { id: GestureId; className?: string }) {
  return (
    <AssetImg
      src={ASSETS.spell(id)}
      fallback={TEMPLATE_BY_ID[id].icon}
      alt={TEMPLATE_BY_ID[id].name}
      className={`spell-img ${className ?? ''}`}
    />
  );
}
