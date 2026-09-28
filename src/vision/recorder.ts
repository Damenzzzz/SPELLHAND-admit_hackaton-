import type { TrackedHand } from '../store/visionStore';
import { encodeFrame, serializeRecording, type RecordedFrame, type RecordingMeta } from './recording';

/** Запись сырых кадров для регрессионных тестов (dev-режим). */
let session: { frames: RecordedFrame[]; label: string; aspect: number; width: number; height: number } | null = null;

export const isRecording = () => session !== null;

export function startRecording(width: number, height: number) {
  session = { frames: [], label: 'prep', aspect: width / (height || 1), width, height };
}

export function setRecordingLabel(label: string) {
  if (session) session.label = label;
}

/** Вызывается из цикла трекера на каждый кадр с СЫРЫМИ руками MediaPipe. */
export function recordFrame(t: number, hands: TrackedHand[], brightness: number) {
  if (session) session.frames.push(encodeFrame(t, session.label, brightness, hands));
}

/** Останавливает запись и скачивает .jsonl.gz. Возвращает число кадров. */
export async function stopRecordingAndDownload(): Promise<number> {
  if (!session) return 0;
  const { frames, aspect, width, height } = session;
  session = null;
  const meta: RecordingMeta = {
    kind: 'spellhand-recording',
    v: 1,
    aspect,
    width,
    height,
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };
  const text = serializeRecording(meta, frames);
  const gz = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const blob = await new Response(gz).blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `spellhand-rec-${meta.createdAt.replace(/[:.]/g, '-')}.jsonl.gz`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return frames.length;
}
