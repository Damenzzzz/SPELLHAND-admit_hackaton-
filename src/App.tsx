import { isDev } from './dev';
import { useGame } from './store/gameStore';
import { DevPanel, useDevKeys } from './ui/DevPanel';
import { SoundBadge } from './ui/SoundBadge';
import { Academy } from './ui/screens/Academy';
import { BattleScreen } from './ui/screens/Battle';
import { Calibration } from './ui/screens/Calibration';
import { Campaign } from './ui/screens/Campaign';
import { Menu } from './ui/screens/Menu';
import { Results } from './ui/screens/Results';
import { Shop } from './ui/screens/Shop';

function DevTools() {
  useDevKeys();
  return <DevPanel />;
}

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <main className="app">
      {screen === 'calibration' && <Calibration />}
      {screen === 'menu' && <Menu />}
      {screen === 'academy' && <Academy />}
      {screen === 'battle' && <BattleScreen />}
      {screen === 'results' && <Results />}
      {screen === 'campaign' && <Campaign />}
      {screen === 'shop' && <Shop />}
      <SoundBadge />
      {isDev && screen !== 'calibration' && <DevTools />}
    </main>
  );
}
