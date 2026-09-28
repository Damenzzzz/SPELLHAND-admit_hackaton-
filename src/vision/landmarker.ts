import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { Handedness, TrackedHand } from '../store/visionStore';

/** Общая фабрика HandLandmarker — для главного потока и для воркера. */
export async function createHandLandmarker(
  wasmPath: string,
  modelPath: string,
): Promise<{ lm: HandLandmarker; delegate: 'GPU' | 'CPU' }> {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);
  const make = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  try {
    return { lm: await make('GPU'), delegate: 'GPU' };
  } catch (err) {
    console.warn('[vision] GPU delegate failed, falling back to CPU', err);
    return { lm: await make('CPU'), delegate: 'CPU' };
  }
}

export function toTrackedHands(result: HandLandmarkerResult): TrackedHand[] {
  return result.landmarks.map((landmarks, i) => ({
    landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    handedness: (result.handedness[i]?.[0]?.categoryName ?? 'Right') as Handedness,
    score: result.handedness[i]?.[0]?.score ?? 0,
  }));
}
