import { useSave } from '../store/saveStore';

export function CoinBadge() {
  const coins = useSave((s) => s.coins);
  return <div className="coin-badge">🪙 {coins}</div>;
}
