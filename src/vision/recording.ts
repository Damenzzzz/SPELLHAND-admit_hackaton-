import type { TrackedHand } from '../store/visionStore';

/**
 * Формат записи жестов (общий для браузера и тестов): JSON Lines.
 * Первая строка — meta, дальше кадр на строку. Координаты — int ×10⁴ (≈7 КБ/с на 2 руки),
 * пишутся СЫРЫЕ landmarks до One Euro, чтобы реплей проверял весь конвейер.
 */
export interface RecordingMeta {
  kind: 'spellhand-recording';
  v: 1;
  aspect: number;
  width: number;
  height: number;
  createdAt: string;
  userAgent: string;
}

export interface RecordedFrame {
  t: number;
  /** Что игрока просили показать в этот момент ('none' — ничего не делать). */
  label: string;
  /** Яркость кадра 0..255. */
  b: number;
  hands: { h: 'L' | 'R'; s: number; lm: number[] }[];
}

const Q = 10000;

export function encodeFrame(t: number, label: string, brightness: number, hands: TrackedHand[]): RecordedFrame {
  return {
    t: Math.round(t),
    label,
    b: Math.round(brightness),
    hands: hands.map((h) => ({
      h: h.handedness === 'Left' ? 'L' : 'R',
      s: Math.round(h.score * 100) / 100,
      lm: h.landmarks.flatMap((p) => [Math.round(p.x * Q), Math.round(p.y * Q), Math.round(p.z * Q)]),
    })),
  };
}

export function decodeHands(f: RecordedFrame): TrackedHand[] {
  return f.hands.map((h) => {
    const landmarks = [];
    for (let i = 0; i < h.lm.length; i += 3) landmarks.push({ x: h.lm[i] / Q, y: h.lm[i + 1] / Q, z: h.lm[i + 2] / Q });
    return { handedness: h.h === 'L' ? 'Left' : 'Right', score: h.s, landmarks };
  });
}

export function parseRecording(text: string): { meta: RecordingMeta; frames: RecordedFrame[] } {
  const lines = text.split('\n').filter(Boolean);
  const meta = JSON.parse(lines[0]) as RecordingMeta;
  if (meta.kind !== 'spellhand-recording') throw new Error('not a spellhand recording');
  return { meta, frames: lines.slice(1).map((l) => JSON.parse(l) as RecordedFrame) };
}

export function serializeRecording(meta: RecordingMeta, frames: RecordedFrame[]): string {
  return [meta, ...frames].map((x) => JSON.stringify(x)).join('\n') + '\n';
}
