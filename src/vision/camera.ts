export type CameraErrorCode =
  | 'insecure'
  | 'unsupported'
  | 'denied'
  | 'not-found'
  | 'busy'
  | 'unknown';

export class CameraError extends Error {
  constructor(
    public code: CameraErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<CameraErrorCode, string> = {
  insecure: 'Камера работает только по HTTPS. Открой игру по защищённой ссылке.',
  unsupported: 'Браузер не поддерживает доступ к камере. Попробуй свежий Chrome.',
  denied:
    'Доступ к камере запрещён. Нажми на значок камеры в адресной строке, разреши доступ и обнови страницу.',
  'not-found': 'Камера не найдена. Подключи веб-камеру и обнови страницу.',
  busy: 'Камера занята другим приложением (Zoom, Meet, OBS?). Закрой его и обнови страницу.',
  unknown: 'Не удалось запустить камеру.',
};

function toCameraError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : '';
  const code: CameraErrorCode =
    name === 'NotAllowedError' || name === 'SecurityError'
      ? 'denied'
      : name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'not-found'
        : name === 'NotReadableError' || name === 'AbortError'
          ? 'busy'
          : 'unknown';
  return new CameraError(code, MESSAGES[code]);
}

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Запускает фронтальную камеру в переданный <video>. */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure', MESSAGES.insecure);
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', MESSAGES.unsupported);
  }

  const size = isMobile() ? { width: 640, height: 480 } : { width: 1280, height: 720 };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: size.width },
        height: { ideal: size.height },
        // 60 fps на десктопе — меньше смаза на быстрых жестах (MediaPipe успевает ~60 на GPU)
        frameRate: { ideal: isMobile() ? 30 : 60 },
      },
    });
  } catch (err) {
    throw toCameraError(err);
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}
