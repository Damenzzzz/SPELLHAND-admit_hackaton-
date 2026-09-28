import type { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { TrackedHand } from '../store/visionStore';
import { createHandLandmarker, createPoseLandmarker, toPose, toTrackedHands } from './landmarker';
import type { WorkerIn, WorkerOut } from './landmarkWorker';
import type { PosePoint } from './pose';

export interface DetectResult {
  hands: TrackedHand[];
  /** null — поза не считалась в этом кадре или тела не видно. */
  pose: PosePoint[] | null;
}

export interface Detector {
  mode: 'worker' | 'main';
  delegate: 'GPU' | 'CPU';
  /** Детекция одного кадра; вызывающий держит не больше одного кадра «в полёте». */
  detect(video: HTMLVideoElement, t: number, withPose: boolean): Promise<DetectResult>;
  /** Ленивая загрузка модели позы; false — не удалось. */
  enablePose(): Promise<boolean>;
}

const WORKER_INIT_TIMEOUT_MS = 20000;
const abs = (u: string) => new URL(u, location.href).href;

export async function createMainDetector(wasm: string, model: string, poseModel: string): Promise<Detector> {
  const { lm, delegate } = await createHandLandmarker(wasm, model);
  let pose: PoseLandmarker | null = null;
  let posePromise: Promise<boolean> | null = null;
  return {
    mode: 'main',
    delegate,
    detect: async (video, t, withPose) => ({
      hands: toTrackedHands((lm as HandLandmarker).detectForVideo(video, t)),
      pose: withPose && pose ? toPose(pose.detectForVideo(video, t)) : null,
    }),
    enablePose: () =>
      (posePromise ??= createPoseLandmarker(wasm, poseModel).then(
        (p) => ((pose = p), true),
        () => false,
      )),
  };
}

export async function createWorkerDetector(wasm: string, model: string, poseModel: string): Promise<Detector> {
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
    send({ type: 'init', wasm: abs(wasm), model: abs(model) });
  }).catch((err) => {
    worker.terminate();
    throw err;
  });

  let pending: ((r: DetectResult) => void) | null = null;
  let poseReady: ((ok: boolean) => void) | null = null;
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const d = e.data;
    if (d.type === 'poseReady') {
      poseReady?.(d.ok);
      poseReady = null;
      return;
    }
    const p = pending;
    pending = null;
    if (d.type === 'result') p?.({ hands: d.hands, pose: d.pose });
    else p?.({ hands: [], pose: null });
  };

  let posePromise: Promise<boolean> | null = null;
  return {
    mode: 'worker',
    delegate,
    detect: async (video, t, withPose) => {
      const bitmap = await createImageBitmap(video);
      return new Promise<DetectResult>((resolve) => {
        pending = resolve;
        send({ type: 'frame', bitmap, t, pose: withPose }, [bitmap]);
      });
    },
    enablePose: () =>
      (posePromise ??= new Promise<boolean>((resolve) => {
        poseReady = resolve;
        send({ type: 'enablePose', wasm: abs(wasm), model: abs(poseModel) });
      })),
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
