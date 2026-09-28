import { decodeHands, type RecordedFrame, type RecordingMeta } from '../vision/recording';
import { GestureEngine } from './matcher';
import type { GestureId } from './types';

export interface SegmentStats {
  frames: number;
  /** Касты по жестам (ледяные осколки — по сериям). */
  casts: Partial<Record<GestureId, number>>;
  /** Кадров, где жест был взведён. */
  active: Partial<Record<GestureId, number>>;
  /** Кадров с подсказкой near-miss для жеста. */
  hints: Partial<Record<GestureId, number>>;
  /** id проваленных ограничений из подсказок. */
  hintConstraints: Record<string, number>;
  misfires: number;
}

const inc = <K extends string>(o: Partial<Record<K, number>>, k: K) => (o[k] = (o[k] ?? 0) + 1);

/**
 * Прогоняет запись через весь конвейер (One Euro → признаки → шаблоны → движение)
 * и собирает статистику по сегментам с одинаковой меткой.
 */
export function replayRecording(
  meta: RecordingMeta,
  frames: RecordedFrame[],
  engine = new GestureEngine(),
): Record<string, SegmentStats> {
  const out: Record<string, SegmentStats> = {};
  let label = '';
  const seg = () =>
    (out[label] ??= { frames: 0, casts: {}, active: {}, hints: {}, hintConstraints: {}, misfires: 0 });

  const off = engine.on((e) => {
    if (e.type === 'cast' && e.shard <= 1) inc(seg().casts, e.gesture);
    if (e.type === 'misfire') seg().misfires++;
  });

  for (const f of frames) {
    label = f.label;
    const snap = engine.update(decodeHands(f), meta.aspect, f.b, f.t);
    const s = seg();
    s.frames++;
    if (snap.active) inc(s.active, snap.active);
    if (snap.hint?.kind === 'pose' && snap.hint.gesture) {
      inc(s.hints, snap.hint.gesture);
      for (const id of snap.hint.key.split(':')[2]?.split(',') ?? []) inc(s.hintConstraints, id);
    }
  }
  off();
  return out;
}
