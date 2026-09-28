import { useGame } from './store/gameStore';
import { Calibration } from './ui/screens/Calibration';
import { Sandbox } from './ui/screens/Sandbox';

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <main className="app">
      {screen === 'calibration' && <Calibration />}
      {screen === 'sandbox' && <Sandbox />}
    </main>
  );
}
