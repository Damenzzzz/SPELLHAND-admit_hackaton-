import { create } from 'zustand';
import { PRELOAD_IMAGES, PRELOAD_MODELS } from './data/assets';

interface AssetsState {
  loaded: number;
  total: number;
  failed: string[];
}

export const useAssets = create<AssetsState>(() => ({
  loaded: 0,
  // +1 — JS-чанк three.js для AR-посоха
  total: PRELOAD_IMAGES.length + PRELOAD_MODELS.length + 1,
  failed: [],
}));

const done = (url: string, ok: boolean) =>
  useAssets.setState((s) => ({ loaded: s.loaded + 1, failed: ok ? s.failed : [...s.failed, url] }));

function loadImage(url: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      done(url, true);
      resolve();
    };
    img.onerror = () => {
      done(url, false);
      resolve();
    };
    img.src = url;
  });
}

async function loadBinary(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    await res.arrayBuffer();
    done(url, true);
  } catch {
    done(url, false);
  }
}

let started = false;

/** Грузит все картинки и модели заранее (браузер кэширует) — прогресс в useAssets. */
export function preloadAssets() {
  if (started) return;
  started = true;
  const jobs = [
    ...PRELOAD_IMAGES.map((u) => () => loadImage(u)),
    ...PRELOAD_MODELS.map((u) => () => loadBinary(u)),
    () =>
      import('../render/StaffAttachment').then(
        () => done('three-chunk', true),
        () => done('three-chunk', false),
      ),
  ];
  // 6 параллельных загрузок
  const next = async (): Promise<void> => {
    const job = jobs.shift();
    if (!job) return;
    await job();
    return next();
  };
  for (let i = 0; i < 6; i++) void next();
}
