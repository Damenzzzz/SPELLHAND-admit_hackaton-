import { useState } from 'react';
import { SHIELDS, STAFFS, type ItemDef } from '../../game/data/items';
import { buyItem, equipItem } from '../../game/economy';
import { sfx } from '../../game/sfx';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';

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
              <span className="shop-icon" style={{ color: item.color }}>
                {item.icon}
              </span>
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
