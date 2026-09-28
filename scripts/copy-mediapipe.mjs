// Self-host MediaPipe: копирует wasm из node_modules и скачивает модель в public/mediapipe.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'public/mediapipe');
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const modelPath = resolve(outDir, 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

mkdirSync(outDir, { recursive: true });

if (existsSync(wasmSrc)) {
  // ES-module вариант не используем — не тащим лишние 11 МБ
  cpSync(wasmSrc, resolve(outDir, 'wasm'), {
    recursive: true,
    filter: (src) => !src.includes('module_internal'),
  });
  console.log('[mediapipe] wasm copied');
}

if (!existsSync(modelPath)) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: ${res.status}`);
  writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
  console.log('[mediapipe] model downloaded');
}
