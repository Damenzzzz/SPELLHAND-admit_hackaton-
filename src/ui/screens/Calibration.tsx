import { useEffect, useState } from 'react';
import { isDev } from '../../dev';
import { ASSETS } from '../../game/data/assets';
import { useAssets } from '../../game/preload';
import { CameraView } from '../../render/CameraView';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { updateSave, useSave } from '../../store/saveStore';
import { shouldOfferTutorial } from '../../game/tutorial';
import { updateSettings } from '../../store/settingsStore';
import { getPalmSign, setPalmSign } from '../../vision/features';
import { useVision } from '../../store/visionStore';
import { startVision } from '../../vision/handTracker';
import { AssetImg } from '../AssetImg';
import { DwellButton } from '../DwellButton';
import { FpsCounter } from '../FpsCounter';
import { isEn, tr, tx } from '../../i18n';

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
  /** 0..1 — полоска прогресса под строкой. */
  progress?: number;
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
      const assets = useAssets.getState();
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
          label: tr('Камера разрешена', 'Camera allowed'),
          state: cameraOk ? 'ok' : cameraFail ? 'fail' : 'pending',
          hint: cameraFail ? (v.error ?? undefined) : tr('Разреши доступ к камере во всплывающем окне', 'Allow camera access in the pop-up'),
        },
        {
          id: 'model',
          label: tr('Распознавание рук загружено', 'Hand tracking loaded'),
          state: running ? 'ok' : v.status === 'error' && cameraOk ? 'fail' : 'pending',
          hint: v.status === 'error' ? (v.error ?? undefined) : tr('Загружаем модель…', 'Loading the model…'),
        },
        {
          id: 'assets',
          label: `${tr('Ассеты игры', 'Game assets')} ${Math.round((assets.loaded / assets.total) * 100)}%`,
          state: assets.loaded >= assets.total ? 'ok' : 'pending',
          hint: tr('Загружаем арены, врагов и посохи…', 'Loading arenas, enemies and staffs…'),
          progress: assets.loaded / assets.total,
        },
        {
          id: 'hand',
          label: tr('Открытая ладонь в кадре', 'Open palm in frame'),
          state: !running ? 'pending' : handHeld ? 'ok' : 'pending',
          hint: tr('Подними открытую ладонь к камере, пальцы выпрямлены', 'Raise an open palm to the camera, fingers straight'),
        },
        {
          id: 'fps',
          label: `${tr('Скорость', 'Speed')} ≥ ${FPS_MIN} FPS`,
          state: !fpsSettled ? 'pending' : Math.round(v.fps) >= FPS_MIN ? 'ok' : 'warn',
          hint: tr(`Сейчас ${Math.round(v.fps)} FPS — закрой лишние вкладки и приложения`, `Now ${Math.round(v.fps)} FPS — close extra tabs and apps`),
        },
        {
          id: 'light',
          label: tr('Освещение', 'Lighting'),
          state: !running ? 'pending' : v.brightness >= BRIGHTNESS_MIN ? 'ok' : 'warn',
          hint: tx('Мало света — повернись к окну или лампе'),
        },
      ];

      // FPS и свет — предупреждения, не блокируют (иначе слабый ноутбук не пройдёт)
      const ready = checks.every((c) => c.state === 'ok' || c.state === 'warn');
      if (ready) readySince ||= now;
      else readySince = 0;
      const readyProgress = readySince ? Math.min(1, (now - readySince) / READY_HOLD_MS) : 0;

      setSnap({ checks, readyProgress });
      // новому игроку — вводный учебный бой; вернувшимся и уже прошедшим/пропустившим — меню
      if (readyProgress >= 1) go(shouldOfferTutorial(useSave.getState()) ? 'tutorial' : 'menu');
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
        <AssetImg src={ASSETS.logo} fallback="SPELLHAND" className="logo-img logo-sm" alt="SPELLHAND" />
        <h2>{tr('Калибровка', 'Calibration')}</h2>
        <DwellButton allowPointer className="lang-toggle-inline" onSelect={() => updateSettings({ lang: isEn() ? 'ru' : 'en' })}>
          🌐 {isEn() ? 'Русский' : 'English'}
        </DwellButton>
        <ul className="checklist">
          {snap.checks.map((c) => (
            <li key={c.id} className={`check check-${c.state}`}>
              <span className="check-icon" aria-hidden />
              <span>{c.label}</span>
              {c.progress !== undefined && c.state !== 'ok' && (
                <span className="check-progress" style={{ transform: `scaleX(${c.progress})` }} />
              )}
            </li>
          ))}
        </ul>

        {firstOpen?.hint && firstOpen.state !== 'ok' && (
          <p className={`calibration-hint hint-${firstOpen.state}`}>{firstOpen.hint}</p>
        )}

        {snap.readyProgress > 0 && (
          <div className="ready">
            <div className="ready-bar" style={{ transform: `scaleX(${snap.readyProgress})` }} />
            <span>{tr('Готово! Начинаем…', 'Ready! Starting…')}</span>
          </div>
        )}

        {isDev && (
          <button className="dev-skip" onClick={() => go('menu')}>
            dev: пропустить
          </button>
        )}
      </aside>
    </div>
  );
}
