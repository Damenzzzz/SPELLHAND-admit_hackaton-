import { isDev } from './dev';
import { useGame } from './store/gameStore';
import { DevPanel, useDevKeys } from './ui/DevPanel';
import { Calibration } from './ui/screens/Calibration';
import { Sandbox } from './ui/screens/Sandbox';

function DevTools() {
  useDevKeys();
  return <DevPanel />;
}

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <main className="app">
      {screen === 'calibration' && <Calibration />}
      {screen === 'menu' && <Sandbox />}
      {isDev && screen !== 'calibration' && <DevTools />}
    </main>
  );
}
