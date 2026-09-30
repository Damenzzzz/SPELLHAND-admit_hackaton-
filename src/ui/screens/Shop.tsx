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
import { tr } from '../../i18n';

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
      setMsg(`${tr('Экипировано', 'Equipped')}: ${item.name}`);
    } else if (buyItem(item.id)) {
      sfx.victory();
      setMsg(`${tr('Куплено и экипировано', 'Bought and equipped')}: ${item.name}`);
    } else {
      sfx.reject();
      setMsg(
        tr(
          `Не хватает ${item.price - coins} 🪙 — побеждай точнее, бонус за точность до +50%`,
          `${item.price - coins} 🪙 short — win more precisely, accuracy bonus up to +50%`,
        ),
      );
    }
  };

  return (
    <ScreenShell className="shop">
      <CoinBadge />
      <h2 className="screen-title">🛒 {tr('Магазин', 'Shop')}</h2>
      <div className="tabs">
        <DwellButton className={tab === 'staff' ? 'tab-on' : ''} onSelect={() => setTab('staff')}>
          🪄 {tr('Посохи', 'Staffs')}
        </DwellButton>
        <DwellButton className={tab === 'shield' ? 'tab-on' : ''} onSelect={() => setTab('shield')}>
          🛡️ {tr('Щиты', 'Shields')}
        </DwellButton>
      </div>
      {tab === 'staff' && (
        <div className="staff-preview">
          <Suspense fallback={null}>
            <StaffPreview id={equipped.staff} />
          </Suspense>
          <span>{STAFFS.find((s) => s.id === equipped.staff)?.name} — {tr('в руке в бою', 'in your hand in battle')}</span>
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
                {isEquipped ? tr('✓ надето', '✓ equipped') : isOwned ? tr('надеть', 'equip') : `🪙 ${item.price}`}
              </span>
            </DwellButton>
          );
        })}
      </div>
      {msg && <p className="shop-msg">{msg}</p>}
      <DwellButton onSelect={() => go('menu')}>← {tr('В меню', 'Menu')}</DwellButton>
    </ScreenShell>
  );
}
