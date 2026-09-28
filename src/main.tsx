import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { preloadAssets } from './game/preload';
import { unlockAudio } from './game/sfx';
import { useSave } from './store/saveStore';
import { useVision } from './store/visionStore';
import { setPalmSign } from './vision/features';
import './styles.css';

setPalmSign(useSave.getState().palmSign);

// ассеты игры грузим после MediaPipe (~20 МБ wasm + модель), чтобы не делить с ним канал
const offVision = useVision.subscribe((v) => {
  if (v.status === 'running' || v.status === 'error') {
    offVision();
    preloadAssets();
  }
});

// звук разрешается браузером только после любого клика/клавиши
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(ev, () => void unlockAudio(), { passive: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
