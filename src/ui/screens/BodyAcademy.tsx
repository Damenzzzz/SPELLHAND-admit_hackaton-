import { CameraView } from '../../render/CameraView';
import { useGame } from '../../store/gameStore';
import { usePose } from '../../store/poseStore';
import { updateSave } from '../../store/saveStore';
import { POSE_CONFIG } from '../../vision/pose';
import { setPoseEnabled } from '../../vision/handTracker';
import { DwellButton } from '../DwellButton';

/** Академия тела: живой индикатор наклона и жестов, переключатель режима. */
export function BodyAcademy() {
  const { openAcademy } = useGame();
  const { active, notice, state } = usePose();
  const lean = Math.max(-1, Math.min(1, state.lean / (POSE_CONFIG.dodgeLean * 1.6)));

  const toggle = (on: boolean) => {
    updateSave({ poseEnabled: on });
    void setPoseEnabled(on);
  };

  return (
    <div className="split-screen">
      <CameraView className="split-camera" />
      <aside className="side-panel academy-panel">
        <h2 className="screen-title">🧍 Жесты телом</h2>
        <ul className="body-list">
          <li>
            <b>Уклонение</b> — резко наклонись в сторону, когда летит снаряд (0.35 с неуязвимости). Потом вернись в
            центр.
          </li>
          <li>
            <b>Скрещённые руки</b> на груди — супер-щит: вдвое прочнее и отражает 30% урона.
          </li>
          <li>
            <b>Обе руки вверх</b> — медитация: +40 маны (раз в 20 с).
          </li>
        </ul>
        {active ? (
          <>
            <div className="lean-meter" aria-label="Наклон корпуса">
              <span className="lean-zone lean-left" />
              <span className="lean-zone lean-right" />
              {/* в зеркале наклон к правому краю кадра — «влево» */}
              <span className="lean-dot" style={{ left: `${50 - lean * 50}%` }} />
            </div>
            <div className="stat-row">
              <div className="stat">
                <b>{state.visible ? (state.calibrated ? '✓' : '…') : '✗'}</b>
                <span>{state.visible ? (state.calibrated ? 'плечи в кадре' : 'стой ровно…') : 'не видно плеч'}</span>
              </div>
              <div className="stat">
                <b className={state.crossed ? 'gold' : ''}>{state.crossed ? '🛡️' : '—'}</b>
                <span>руки скрещены</span>
              </div>
              <div className="stat">
                <b className={state.armsUp ? 'gold' : ''}>{state.armsUp ? '🙌' : '—'}</b>
                <span>руки вверх</span>
              </div>
            </div>
            <DwellButton onSelect={() => toggle(false)}>⏻ Выключить жесты телом</DwellButton>
          </>
        ) : (
          <>
            <p className="muted">{notice ?? 'Режим выключен. Он загружает вторую модель и немного снижает FPS.'}</p>
            <DwellButton className="btn-primary" onSelect={() => toggle(true)}>
              ⏻ Включить жесты телом
            </DwellButton>
          </>
        )}
        <div className="panel-buttons">
          <DwellButton onSelect={() => openAcademy(null)}>← В академию</DwellButton>
        </div>
      </aside>
    </div>
  );
}
