import { gestureEngine } from '../gestures/matcher';
import { useGesture } from '../store/gestureStore';
import { useVision, type TrackedHand } from '../store/visionStore';
import { CameraError, startCamera } from './camera';
import { createMainDetector, createWorkerDetector, shouldUseWorker, type Detector } from './detector';
import { devHands } from './devFeed';
import { recordFrame } from './recorder';

const BASE = import.meta.env.BASE_URL;
const WASM_PATH = `${BASE}mediapipe/wasm`;
const MODEL_PATH = `${BASE}mediapipe/hand_landmarker.task`;

const FPS_WINDOW_MS = 500;
const BRIGHTNESS_EVERY_MS = 500;

/** Единственный <video> на всё приложение — экраны просто монтируют его к себе. */
export const video: HTMLVideoElement = document.createElement('video');
video.className = 'camera-video';

let started = false;

/** Воркер, а при сбое — главный поток (dev, Safari/iOS, старые браузеры). */
async function createDetector(): Promise<Detector> {
  if (shouldUseWorker()) {
    try {
      return await createWorkerDetector(WASM_PATH, MODEL_PATH);
    } catch (err) {
      console.warn('[vision] worker detector failed, using main thread', err);
    }
  }
  return createMainDetector(WASM_PATH, MODEL_PATH);
}

// --- яркость кадра: маленький канвас, раз в полсекунды ---
const probe = document.createElement('canvas');
probe.width = 32;
probe.height = 18;
const probeCtx = probe.getContext('2d', { willReadFrequently: true });

function measureBrightness(): number {
  if (!probeCtx) return 128;
  probeCtx.drawImage(video, 0, 0, probe.width, probe.height);
  const { data } = probeCtx.getImageData(0, 0, probe.width, probe.height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return sum / (data.length / 4);
}

function runLoop(detector: Detector) {
  let lastVideoTime = -1;
  let busy = false;
  let frames = 0;
  let windowStart = performance.now();
  let lastBrightness = 0;

  const scheduleNext = () => {
    if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(tick);
    else requestAnimationFrame(tick);
  };

  // один кадр «в полёте»: пока воркер считает, новые кадры пропускаются
  const tick = () => {
    const now = performance.now();
    if (!busy && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      busy = true;
      detector
        .detect(video, now)
        .then((detected) => process(detected, now))
        .catch((err) => console.warn('[vision] detect failed', err))
        .finally(() => (busy = false));
    }
    scheduleNext();
  };

  const process = (detected: TrackedHand[], now: number) => {
    {
      frames++;
      recordFrame(now, detected, useVision.getState().brightness);
      const hands = devHands() ?? detected;

      const patch: Partial<ReturnType<typeof useVision.getState>> = { hands, frameTime: now };

      if (now - windowStart >= FPS_WINDOW_MS) {
        const instant = (frames * 1000) / (now - windowStart);
        const prev = useVision.getState().fps;
        patch.fps = prev === 0 ? instant : prev * 0.5 + instant * 0.5;
        frames = 0;
        windowStart = now;
      }
      if (now - lastBrightness >= BRIGHTNESS_EVERY_MS) {
        patch.brightness = measureBrightness();
        lastBrightness = now;
      }
      useVision.setState(patch);

      const aspect = video.videoWidth / (video.videoHeight || 1);
      const snap = gestureEngine.update(hands, aspect, useVision.getState().brightness, now);
      useGesture.setState({ snap });
    }
  };

  scheduleNext();
}

/** Запрашивает камеру, грузит модель и запускает цикл детекции. Идемпотентно. */
export async function startVision(): Promise<void> {
  if (started) return;
  started = true;
  const set = useVision.setState;
  set({ status: 'camera', error: null });

  const detectorPromise = createDetector();
  // не даём unhandled rejection, пока ждём камеру
  detectorPromise.catch(() => {});

  try {
    await startCamera(video);
    set({
      status: 'model',
      videoSize: { width: video.videoWidth, height: video.videoHeight },
    });
    const detector = await detectorPromise;
    set({ status: 'running', delegate: detector.delegate, detectorMode: detector.mode });
    runLoop(detector);
  } catch (err) {
    started = false;
    const message =
      err instanceof CameraError
        ? err.message
        : 'Не удалось загрузить модель распознавания рук. Проверь интернет и обнови страницу.';
    console.error('[vision]', err);
    set({ status: 'error', error: message });
  }
}
