import { isDev } from './dev';
import { useGame } from './store/gameStore';
import { DevPanel, useDevKeys } from './ui/DevPanel';
import { SoundBadge } from './ui/SoundBadge';
import { Academy } from './ui/screens/Academy';
import { BattleScreen } from './ui/screens/Battle';
import { Calibration } from './ui/screens/Calibration';
import { Menu } from './ui/screens/Menu';

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
      <SoundBadge />
      {isDev && screen !== 'calibration' && <DevTools />}
    </main>
  );
}
