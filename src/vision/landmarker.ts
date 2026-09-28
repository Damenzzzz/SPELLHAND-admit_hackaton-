import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { PosePoint } from './pose';
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

/** Pose Landmarker lite — жесты всем телом (уклонение, скрещённые руки). */
export async function createPoseLandmarker(wasmPath: string, modelPath: string): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);
  const make = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  try {
    return await make('GPU');
  } catch {
    return make('CPU');
  }
}

export function toPose(result: PoseLandmarkerResult): PosePoint[] | null {
  const lm = result.landmarks[0];
  return lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null;
}

export function toTrackedHands(result: HandLandmarkerResult): TrackedHand[] {
  return result.landmarks.map((landmarks, i) => ({
    landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    handedness: (result.handedness[i]?.[0]?.categoryName ?? 'Right') as Handedness,
    score: result.handedness[i]?.[0]?.score ?? 0,
  }));
}
