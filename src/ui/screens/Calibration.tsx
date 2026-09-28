import { useEffect, useState } from 'react';
import { isDev } from '../../dev';
import { CameraView } from '../../render/CameraView';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { updateSave } from '../../store/saveStore';
import { getPalmSign, setPalmSign } from '../../vision/features';
import { useVision } from '../../store/visionStore';
import { startVision } from '../../vision/handTracker';
import { FpsCounter } from '../FpsCounter';

const HAND_HOLD_MS = 1000;
const FPS_MIN = 20;
const FPS_GRACE_MS = 2500;
const BRIGHTNESS_MIN = 50;
const READY_HOLD_MS = 1500;
const POLL_MS = 100;

type CheckState = 'pending' | 'ok' | 'warn' | 'fail';

interface Check {
  id: string;
  label: string;
  state: CheckState;
  hint?: string;
}

interface Snapshot {
  checks: Check[];
  /** 0..1 — прогресс автоперехода, когда всё готово. */
  readyProgress: number;
}

/**
 * Калибровка: камера → модель → рука в кадре → FPS → свет.
 * Жесты-only: когда обязательные проверки пройдены, переходим сами через 1.5 с.
 */
export function Calibration() {
  const go = useGame((s) => s.go);
  const [snap, setSnap] = useState<Snapshot>({ checks: [], readyProgress: 0 });

  useEffect(() => {
    startVision();
  }, []);

  useEffect(() => {
    let handSince = 0;
    let facingSum = 0;
    let facingN = 0;
    let palmCalibrated = false;
    let runningSince = 0;
    let readySince = 0;

    const id = setInterval(() => {
      const v = useVision.getState();
      const now = performance.now();
      const running = v.status === 'running';

      if (running && !runningSince) runningSince = now;
      // для калибровки нужна именно открытая ладонь: по ней определяем знак нормали
      const h = useGesture.getState().snap?.hands[0];
      const open = h ? (h.extension.index + h.extension.middle + h.extension.ring + h.extension.pinky) / 4 : 0;
      if (running && h && open > 0.6) {
        handSince ||= now;
        facingSum += h.palmFacing;
        facingN++;
      } else {
        handSince = 0;
        facingSum = 0;
        facingN = 0;
      }

      const cameraOk = v.videoSize.width > 0;
      const cameraFail = v.status === 'error' && !v.videoSize.width;
      const handHeld = handSince > 0 && now - handSince >= HAND_HOLD_MS;
      const fpsSettled = runningSince > 0 && now - runningSince >= FPS_GRACE_MS;

      // «Покажи ладонь»: если ладонь стабильно считается тыльной стороной — камера
      // размечает руки наоборот, переворачиваем знак и запоминаем
      if (handHeld && !palmCalibrated) {
        palmCalibrated = true;
        if (facingSum / facingN < -0.1) {
          const sign = getPalmSign() === 1 ? -1 : 1;
          setPalmSign(sign);
          updateSave({ palmSign: sign });
        }
      }

      const checks: Check[] = [
        {
          id: 'camera',
          label: 'Камера разрешена',
          state: cameraOk ? 'ok' : cameraFail ? 'fail' : 'pending',
          hint: cameraFail ? (v.error ?? undefined) : 'Разреши доступ к камере во всплывающем окне',
        },
        {
          id: 'model',
          label: 'Распознавание рук загружено',
          state: running ? 'ok' : v.status === 'error' && cameraOk ? 'fail' : 'pending',
          hint: v.status === 'error' ? (v.error ?? undefined) : 'Загружаем модель…',
        },
        {
          id: 'hand',
          label: 'Открытая ладонь в кадре',
          state: !running ? 'pending' : handHeld ? 'ok' : 'pending',
          hint: 'Подними открытую ладонь к камере, пальцы выпрямлены',
        },
        {
          id: 'fps',
          label: `Скорость ≥ ${FPS_MIN} FPS`,
          state: !fpsSettled ? 'pending' : Math.round(v.fps) >= FPS_MIN ? 'ok' : 'warn',
          hint: `Сейчас ${Math.round(v.fps)} FPS — закрой лишние вкладки и приложения`,
        },
        {
          id: 'light',
          label: 'Освещение',
          state: !running ? 'pending' : v.brightness >= BRIGHTNESS_MIN ? 'ok' : 'warn',
          hint: 'Мало света — повернись к окну или лампе',
        },
      ];

      // FPS и свет — предупреждения, не блокируют (иначе слабый ноутбук не пройдёт)
      const ready = checks.every((c) => c.state === 'ok' || c.state === 'warn');
      if (ready) readySince ||= now;
      else readySince = 0;
      const readyProgress = readySince ? Math.min(1, (now - readySince) / READY_HOLD_MS) : 0;

      setSnap({ checks, readyProgress });
      if (readyProgress >= 1) go('sandbox');
    }, POLL_MS);

    return () => clearInterval(id);
  }, [go]);

  const firstOpen = snap.checks.find((c) => c.state !== 'ok');

  return (
    <div className="calibration">
      <CameraView className="calibration-camera">
        <FpsCounter />
      </CameraView>

      <aside className="calibration-panel">
        <h1 className="logo logo-sm">SPELLHAND</h1>
        <h2>Калибровка</h2>
        <ul className="checklist">
          {snap.checks.map((c) => (
            <li key={c.id} className={`check check-${c.state}`}>
              <span className="check-icon" aria-hidden />
              <span>{c.label}</span>
            </li>
          ))}
        </ul>

        {firstOpen?.hint && firstOpen.state !== 'ok' && (
          <p className={`calibration-hint hint-${firstOpen.state}`}>{firstOpen.hint}</p>
        )}

        {snap.readyProgress > 0 && (
          <div className="ready">
            <div className="ready-bar" style={{ transform: `scaleX(${snap.readyProgress})` }} />
            <span>Готово! Начинаем…</span>
          </div>
        )}

        {isDev && (
          <button className="dev-skip" onClick={() => go('sandbox')}>
            dev: пропустить
          </button>
        )}
      </aside>
    </div>
  );
}
