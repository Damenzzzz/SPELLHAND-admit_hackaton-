import type { TrackedHand } from '../store/visionStore';
import { createHandLandmarker, toTrackedHands } from './landmarker';
import type { WorkerIn, WorkerOut } from './landmarkWorker';

export interface Detector {
  mode: 'worker' | 'main';
  delegate: 'GPU' | 'CPU';
  /** Детекция одного кадра; вызывающий держит не больше одного кадра «в полёте». */
  detect(video: HTMLVideoElement, t: number): Promise<TrackedHand[]>;
}

const WORKER_INIT_TIMEOUT_MS = 20000;

export async function createMainDetector(wasm: string, model: string): Promise<Detector> {
  const { lm, delegate } = await createHandLandmarker(wasm, model);
  return {
    mode: 'main',
    delegate,
    detect: async (video, t) => toTrackedHands(lm.detectForVideo(video, t)),
  };
}

export async function createWorkerDetector(wasm: string, model: string): Promise<Detector> {
  // классический воркер (Vite собирает его как IIFE): загрузчик wasm MediaPipe использует importScripts,
  // которого нет в module-воркерах. В dev воркер не включается (см. shouldUseWorker).
  const worker = new Worker(new URL('./landmarkWorker.ts', import.meta.url));
  const send = (m: WorkerIn, transfer: Transferable[] = []) => worker.postMessage(m, transfer);

  const delegate = await new Promise<'GPU' | 'CPU'>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('worker init timeout')), WORKER_INIT_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === 'ready') {
        clearTimeout(timer);
        resolve(e.data.delegate);
      } else if (e.data.type === 'error') {
        clearTimeout(timer);
        reject(new Error(e.data.message));
      }
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(e.message || 'worker error'));
    };
    // пути абсолютные: воркер резолвит относительно своего URL
    send({ type: 'init', wasm: new URL(wasm, location.href).href, model: new URL(model, location.href).href });
  }).catch((err) => {
    worker.terminate();
    throw err;
  });

  let pending: { t: number; resolve: (h: TrackedHand[]) => void } | null = null;
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const p = pending;
    pending = null;
    if (e.data.type === 'result') p?.resolve(e.data.hands);
    else p?.resolve([]);
  };

  return {
    mode: 'worker',
    delegate,
    detect: async (video, t) => {
      const bitmap = await createImageBitmap(video);
      return new Promise<TrackedHand[]>((resolve) => {
        pending = { t, resolve };
        send({ type: 'frame', bitmap, t }, [bitmap]);
      });
    },
  };
}

/** Воркер — в проде на браузерах с OffscreenCanvas (не Safari); ?worker=0/1 — ручной выбор. */
export function shouldUseWorker(): boolean {
  const flag = new URLSearchParams(location.search).get('worker');
  if (flag === '0') return false;
  if (flag === '1') return true;
  const ua = navigator.userAgent;
  const safari = ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium');
  return !import.meta.env.DEV && typeof Worker !== 'undefined' && 'createImageBitmap' in window && !safari;
}
