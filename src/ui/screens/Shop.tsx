import { lazy, Suspense, useState } from 'react';
import { ASSETS } from '../../game/data/assets';
import { SHIELDS, STAFFS, type ItemDef } from '../../game/data/items';
import { buyItem, equipItem } from '../../game/economy';
import { sfx } from '../../game/sfx';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { AssetImg } from '../AssetImg';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';

const StaffPreview = lazy(() => import('../../render/StaffPreview'));

/** Магазин: покупка и экипировка посохов и щитов наведением пальца. */
export function Shop() {
  const go = useGame((s) => s.go);
  const [tab, setTab] = useState<'staff' | 'shield'>('staff');
  const { coins, owned, equipped } = useSave();
  const [msg, setMsg] = useState<string | null>(null);

  const items: ItemDef[] = tab === 'staff' ? STAFFS : SHIELDS;

  const act = (item: ItemDef) => {
    if (equipped[item.kind] === item.id) return;
    if (owned.includes(item.id)) {
      equipItem(item.id);
      setMsg(`Экипировано: ${item.name}`);
    } else if (buyItem(item.id)) {
      sfx.victory();
      setMsg(`Куплено и экипировано: ${item.name}`);
    } else {
      sfx.reject();
      setMsg(`Не хватает ${item.price - coins} 🪙 — побеждай точнее, бонус за точность до +50%`);
    }
  };

  return (
    <ScreenShell className="shop">
      <CoinBadge />
      <h2 className="screen-title">🛒 Магазин</h2>
      <div className="tabs">
        <DwellButton className={tab === 'staff' ? 'tab-on' : ''} onSelect={() => setTab('staff')}>
          🪄 Посохи
        </DwellButton>
        <DwellButton className={tab === 'shield' ? 'tab-on' : ''} onSelect={() => setTab('shield')}>
          🛡️ Щиты
        </DwellButton>
      </div>
      {tab === 'staff' && (
        <div className="staff-preview">
          <Suspense fallback={null}>
            <StaffPreview id={equipped.staff} />
          </Suspense>
          <span>{STAFFS.find((s) => s.id === equipped.staff)?.name} — в руке в бою</span>
        </div>
      )}
      <div className="shop-grid">
        {items.map((item) => {
          const isOwned = owned.includes(item.id);
          const isEquipped = equipped[item.kind] === item.id;
          return (
            <DwellButton
              key={item.id}
              className={`shop-card ${isEquipped ? 'shop-equipped' : ''}`}
              onSelect={() => act(item)}
            >
              <AssetImg
                src={item.kind === 'staff' ? ASSETS.staffIcon(item.id) : ASSETS.rune(item.id)}
                fallback={item.icon}
                className="shop-icon"
              />
              <span className="shop-name">{item.name}</span>
              <small>{item.effect}</small>
              <span className="shop-price">
                {isEquipped ? '✓ надето' : isOwned ? 'надеть' : `🪙 ${item.price}`}
              </span>
            </DwellButton>
          );
        })}
      </div>
      {msg && <p className="shop-msg">{msg}</p>}
      <DwellButton onSelect={() => go('menu')}>← В меню</DwellButton>
    </ScreenShell>
  );
}
