import { useSave } from '../store/saveStore';
import { tr } from '../i18n';

export function CoinBadge() {
  const coins = useSave((s) => s.coins);
  return (
    <div className="coin-badge">
      <span aria-hidden>🪙</span> {coins}
      <span className="sr-only"> {tr('монет', 'coins')}</span>
    </div>
  );
}
