import { create } from 'zustand';
import type { PoseEvent, PoseState } from '../vision/pose';

interface PoseStore {
  /** Модель позы загружена и считается. */
  active: boolean;
  /** Почему выключено (например, упал FPS). */
  notice: string | null;
  state: PoseState;
}

export const usePose = create<PoseStore>(() => ({
  active: false,
  notice: null,
  state: { visible: false, calibrated: false, lean: 0, crossed: false, armsUp: false },
}));

type Listener = (e: PoseEvent) => void;
const listeners = new Set<Listener>();

/** Шина событий тела (уклонение, скрещённые руки, руки вверх). */
export const poseEvents = {
  on(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(e: PoseEvent) {
    listeners.forEach((fn) => fn(e));
  },
};
