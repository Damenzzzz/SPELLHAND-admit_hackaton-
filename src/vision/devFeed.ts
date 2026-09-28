import { isDev } from '../dev';
import { FIST, OPEN, synthHand, type SynthOptions } from '../gestures/synthHand';
import type { TrackedHand } from '../store/visionStore';

/**
 * dev-режим: подмена рук из камеры синтетическими (для проверки UI режима «ошибка»
 * без живой руки). В консоли: __spellhand.hands([{ ext: {...OPEN, ring: 0} }]).
 */
let synthetic: TrackedHand[] | null = null;

export const devHands = () => synthetic;

if (isDev) {
  Object.assign(window, {
    __spellhand: {
      OPEN,
      FIST,
      /** Синтетические точки руки (для составных поз вроде «пера» руны). */
      synth: (o: Partial<SynthOptions> & { ext: SynthOptions['ext'] }) => synthHand({ aspect: 16 / 9, ...o }),
      /** Подать готовые landmarks: [{ landmarks, handedness?, score? }]. */
      raw(list: { landmarks: { x: number; y: number; z: number }[]; handedness?: 'Left' | 'Right' }[] | null) {
        synthetic = list?.map((h) => ({ landmarks: h.landmarks, handedness: h.handedness ?? 'Left', score: 0.95 })) ?? null;
      },
      hands(list: (Partial<SynthOptions> & { ext: SynthOptions['ext'] })[] | null) {
        synthetic =
          list?.map((o) => ({
            landmarks: synthHand({ aspect: 16 / 9, ...o }),
            handedness: o.right === false ? 'Right' : 'Left',
            score: 0.95,
          })) ?? null;
      },
    },
  });
}
