/// <reference lib="webworker" />
import type { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { createHandLandmarker, createPoseLandmarker, toPose, toTrackedHands } from './landmarker';
import type { PosePoint } from './pose';

/**
 * Детекция в Web Worker: главный поток шлёт ImageBitmap кадра (transfer, без копии),
 * воркер возвращает landmarks рук (и позы, если включена). Главный поток не блокируется
 * инференсом и GPU-readback.
 */
export type WorkerIn =
  | { type: 'init'; wasm: string; model: string }
  | { type: 'enablePose'; wasm: string; model: string }
  | { type: 'frame'; bitmap: ImageBitmap; t: number; pose: boolean };

export type WorkerOut =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'poseReady'; ok: boolean }
  | { type: 'error'; message: string }
  | { type: 'result'; t: number; hands: ReturnType<typeof toTrackedHands>; pose: PosePoint[] | null };

let lm: HandLandmarker | null = null;
let pose: PoseLandmarker | null = null;
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
  if (msg.type === 'enablePose') {
    try {
      pose ??= await createPoseLandmarker(msg.wasm, msg.model);
      post({ type: 'poseReady', ok: true });
    } catch {
      post({ type: 'poseReady', ok: false });
    }
    return;
  }
  if (msg.type === 'frame') {
    try {
      const hands = lm ? toTrackedHands(lm.detectForVideo(msg.bitmap, msg.t)) : [];
      const body = msg.pose && pose ? toPose(pose.detectForVideo(msg.bitmap, msg.t)) : null;
      post({ type: 'result', t: msg.t, hands, pose: body });
    } catch (err) {
      post({ type: 'error', message: String((err as Error)?.message ?? err) });
    } finally {
      msg.bitmap.close();
    }
  }
};
