// Self-host MediaPipe: копирует wasm из node_modules в public/mediapipe.
// Модель hand_landmarker.task закоммичена в репо; скачивается, только если её нет.
// Скрипт никогда не роняет `npm i`: сбои — предупреждения.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'public/mediapipe');
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const modelPath = resolve(outDir, 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

mkdirSync(outDir, { recursive: true });

try {
  if (existsSync(wasmSrc)) {
    // ES-module вариант не используем — не тащим лишние 11 МБ
    cpSync(wasmSrc, resolve(outDir, 'wasm'), {
      recursive: true,
      filter: (src) => !src.includes('module_internal'),
    });
    console.log('[mediapipe] wasm copied');
  } else {
    console.warn('[mediapipe] node_modules/@mediapipe/tasks-vision/wasm не найден — пропускаю');
  }
} catch (err) {
  console.warn('[mediapipe] не удалось скопировать wasm:', err.message);
}

if (!existsSync(modelPath)) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log('[mediapipe] model downloaded');
  } catch (err) {
    console.warn(
      `[mediapipe] модель не скачалась (${err.message}). Положи hand_landmarker.task в public/mediapipe/ вручную: ${MODEL_URL}`,
    );
  }
}
