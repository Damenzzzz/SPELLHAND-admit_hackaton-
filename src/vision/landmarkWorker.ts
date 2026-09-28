/// <reference lib="webworker" />
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { createHandLandmarker, toTrackedHands } from './landmarker';

/**
 * Детекция рук в Web Worker: главный поток шлёт ImageBitmap кадра (transfer, без копии),
 * воркер возвращает landmarks. Главный поток не блокируется инференсом и GPU-readback.
 */
export type WorkerIn =
  | { type: 'init'; wasm: string; model: string }
  | { type: 'frame'; bitmap: ImageBitmap; t: number };

export type WorkerOut =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'error'; message: string }
  | { type: 'result'; t: number; hands: ReturnType<typeof toTrackedHands> };

let lm: HandLandmarker | null = null;
const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      const r = await createHandLandmarker(msg.wasm, msg.model);
      lm = r.lm;
      post({ type: 'ready', delegate: r.delegate });
    } catch (err) {
      post({ type: 'error', message: String((err as Error)?.message ?? err) });
    }
    return;
  }
  if (msg.type === 'frame') {
    try {
      const hands = lm ? toTrackedHands(lm.detectForVideo(msg.bitmap, msg.t)) : [];
      post({ type: 'result', t: msg.t, hands });
    } catch (err) {
      post({ type: 'error', message: String((err as Error)?.message ?? err) });
    } finally {
      msg.bitmap.close();
    }
  }
};
