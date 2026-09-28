import { isDev } from './dev';
import { useGame } from './store/gameStore';
import { useState } from 'react';
import { DevPanel, useDevKeys } from './ui/DevPanel';
import { RecorderOverlay } from './ui/RecorderOverlay';
import { SoundBadge } from './ui/SoundBadge';
import { Academy } from './ui/screens/Academy';
import { BattleScreen } from './ui/screens/Battle';
import { Calibration } from './ui/screens/Calibration';
import { Campaign } from './ui/screens/Campaign';
import { Coach } from './ui/screens/Coach';
import { Daily } from './ui/screens/Daily';
import { Leaderboard } from './ui/screens/Leaderboard';
import { Menu } from './ui/screens/Menu';
import { Online } from './ui/screens/Online';
import { PersonalCalibration } from './ui/screens/PersonalCalibration';
import { Results } from './ui/screens/Results';
import { Rush } from './ui/screens/Rush';
import { Shop } from './ui/screens/Shop';

function DevTools() {
  useDevKeys();
  const [rec, setRec] = useState(false);
  return (
    <>
      <DevPanel />
      {rec ? (
        <RecorderOverlay onClose={() => setRec(false)} />
      ) : (
        <button className="dev-rec-btn" onClick={() => setRec(true)}>
          ⏺ Записать жесты
        </button>
      )}
    </>
  );
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
      {screen === 'online' && <Online />}
      {screen === 'leaderboard' && <Leaderboard />}
      {screen === 'personal' && <PersonalCalibration />}
      {screen === 'coach' && <Coach />}
      {screen === 'rush' && <Rush />}
      {screen === 'daily' && <Daily />}
      <SoundBadge />
      {isDev && screen !== 'calibration' && <DevTools />}
    </main>
  );
}
