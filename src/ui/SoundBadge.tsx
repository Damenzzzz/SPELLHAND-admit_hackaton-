import { useEffect, useState } from 'react';
import { audioReady } from '../game/sfx';
import { useSettings } from '../store/settingsStore';
import { useSave } from '../store/saveStore';
import { tr } from '../i18n';

/** Браузер не даёт включить звук без клика — подсказываем один раз. */
export function SoundBadge() {
  const { musicVolume, sfxVolume } = useSettings();
  const musicOn = useSave((s) => s.musicOn ?? true);
  const [ready, setReady] = useState(audioReady());
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => setReady(audioReady()), 500);
    return () => clearInterval(id);
  }, [ready]);
  if (ready || (sfxVolume === 0 && (!musicOn || musicVolume === 0))) return null;
  return <div className="sound-badge">🔇 {tr('Кликни в любом месте, чтобы включить звук', 'Click anywhere to enable sound')}</div>;
}
