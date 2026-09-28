import { create } from 'zustand';

export type VisionStatus = 'idle' | 'camera' | 'model' | 'running' | 'error';

export type Handedness = 'Left' | 'Right';

export interface TrackedHand {
  landmarks: { x: number; y: number; z: number }[];
  /** Метка MediaPipe (рассчитана на зеркальное селфи-изображение). */
  handedness: Handedness;
  score: number;
}

interface VisionState {
  status: VisionStatus;
  error: string | null;
  delegate: 'GPU' | 'CPU' | null;
  /** Кадров детекции в секунду (сглаженное). */
  fps: number;
  /** Средняя яркость кадра 0..255. */
  brightness: number;
  hands: TrackedHand[];
  /** performance.now() последнего обработанного кадра. */
  frameTime: number;
  videoSize: { width: number; height: number };
}

export const useVision = create<VisionState>(() => ({
  status: 'idle',
  error: null,
  delegate: null,
  fps: 0,
  brightness: 0,
  hands: [],
  frameTime: 0,
  videoSize: { width: 0, height: 0 },
}));
