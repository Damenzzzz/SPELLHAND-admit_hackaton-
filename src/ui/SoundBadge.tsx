import { useEffect, useState } from 'react';
import { audioReady } from '../game/sfx';

/** Браузер не даёт включить звук без клика — подсказываем один раз. */
export function SoundBadge() {
  const [ready, setReady] = useState(audioReady());
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => setReady(audioReady()), 500);
    return () => clearInterval(id);
  }, [ready]);
  if (ready) return null;
  return <div className="sound-badge">🔇 Кликни в любом месте, чтобы включить звук</div>;
}
