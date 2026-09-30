import { isDev } from './dev';
import { Achievements } from './ui/screens/Achievements';
import { AchievementToast } from './ui/AchievementToast';
import { useGame } from './store/gameStore';
import { useEffect, useState } from 'react';
import { playMusic } from './game/music';
import { DevPanel, useDevKeys } from './ui/DevPanel';
import { RecorderOverlay } from './ui/RecorderOverlay';
import { SoundBadge } from './ui/SoundBadge';
import { Academy } from './ui/screens/Academy';
import { BattleScreen } from './ui/screens/Battle';
import { BodyAcademy } from './ui/screens/BodyAcademy';
import { Calibration } from './ui/screens/Calibration';
import { Campaign } from './ui/screens/Campaign';
import { Coach } from './ui/screens/Coach';
import { Daily } from './ui/screens/Daily';
import { Leaderboard } from './ui/screens/Leaderboard';
import { Menu } from './ui/screens/Menu';
import { Online } from './ui/screens/Online';
import { PersonalCalibration } from './ui/screens/PersonalCalibration';
import { Results } from './ui/screens/Results';
import { RuneAcademy } from './ui/screens/RuneAcademy';
import { Rush } from './ui/screens/Rush';
import { Shop } from './ui/screens/Shop';
import { Survival } from './ui/screens/Survival';
import { Tutorial } from './ui/screens/Tutorial';
import { ComboAcademy } from './ui/screens/ComboAcademy';
import { Settings } from './ui/screens/Settings';
import { useSettings } from './store/settingsStore';
import { useSave } from './store/saveStore';
import { applySfxVolume } from './game/sfx';

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
  const battleId = useGame((s) => s.battleId);
  const { musicVolume, sfxVolume, reducedEffects, lang } = useSettings();
  const musicOn = useSave((s) => s.musicOn ?? true);
  // музыка: бой — боевая тема, остальное — тема меню (калибровка — тишина)
  useEffect(() => {
    playMusic(screen === 'battle' || screen === 'tutorial' ? 'battle' : screen === 'calibration' ? null : 'menu');
  }, [screen, musicVolume, musicOn]);
  useEffect(applySfxVolume, [sfxVolume]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <main className={`app${reducedEffects ? ' reduced-effects' : ''}`}>
      {screen === 'calibration' && <Calibration />}
      {screen === 'menu' && <Menu />}
      {screen === 'achievements' && <Achievements />}
      {screen === 'settings' && <Settings />}
      {screen === 'academy' && <Academy />}
      {screen === 'battle' && <BattleScreen key={battleId} />}
      {screen === 'results' && <Results />}
      {screen === 'campaign' && <Campaign />}
      {screen === 'shop' && <Shop />}
      {screen === 'online' && <Online />}
      {screen === 'leaderboard' && <Leaderboard />}
      {screen === 'personal' && <PersonalCalibration />}
      {screen === 'coach' && <Coach />}
      {screen === 'rush' && <Rush />}
      {screen === 'daily' && <Daily />}
      {screen === 'runes' && <RuneAcademy />}
      {screen === 'body' && <BodyAcademy />}
      {screen === 'survival' && <Survival />}
      {screen === 'tutorial' && <Tutorial />}
      {screen === 'combos' && <ComboAcademy />}
      <SoundBadge />
      <AchievementToast />
      {isDev && screen !== 'calibration' && <DevTools />}
    </main>
  );
}
