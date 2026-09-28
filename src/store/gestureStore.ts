import { create } from 'zustand';
import type { GestureSnapshot } from '../gestures/matcher';

/** Результат распознавания за последний кадр (обновляется каждый кадр — читать селекторами). */
export const useGesture = create<{ snap: GestureSnapshot | null }>(() => ({ snap: null }));
