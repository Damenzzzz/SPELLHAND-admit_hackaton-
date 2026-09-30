import { CameraView } from '../../render/CameraView';
import { useGame } from '../../store/gameStore';
import { usePose } from '../../store/poseStore';
import { updateSave } from '../../store/saveStore';
import { POSE_CONFIG } from '../../vision/pose';
import { setPoseEnabled } from '../../vision/handTracker';
import { DwellButton } from '../DwellButton';
import { tr } from '../../i18n';

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
        <h2 className="screen-title">🧍 {tr('Жесты телом', 'Body gestures')}</h2>
        <ul className="body-list">
          <li>
            <b>{tr('Уклонение', 'Dodge')}</b>{' '}
            {tr(
              '— резко наклонись в сторону, когда летит снаряд (0.35 с неуязвимости). Потом вернись в центр.',
              '— lean sharply to the side when a projectile flies (0.35 s of invulnerability). Then return to center.',
            )}
          </li>
          <li>
            <b>{tr('Скрещённые руки', 'Crossed arms')}</b>{' '}
            {tr('на груди — супер-щит: вдвое прочнее и отражает 30% урона.', 'on your chest — super shield: twice as strong and reflects 30% damage.')}
          </li>
          <li>
            <b>{tr('Обе руки вверх', 'Both arms up')}</b> {tr('— медитация: +40 маны (раз в 20 с).', '— meditation: +40 mana (once per 20 s).')}
          </li>
        </ul>
        {active ? (
          <>
            <div className="lean-meter" aria-label={tr('Наклон корпуса', 'Body lean')}>
              <span className="lean-zone lean-left" />
              <span className="lean-zone lean-right" />
              {/* в зеркале наклон к правому краю кадра — «влево» */}
              <span className="lean-dot" style={{ left: `${50 - lean * 50}%` }} />
            </div>
            <div className="stat-row">
              <div className="stat">
                <b>{state.visible ? (state.calibrated ? '✓' : '…') : '✗'}</b>
                <span>{state.visible
                    ? state.calibrated
                      ? tr('плечи в кадре', 'shoulders in frame')
                      : tr('стой ровно…', 'stand straight…')
                    : tr('не видно плеч', 'shoulders not visible')}</span>
              </div>
              <div className="stat">
                <b className={state.crossed ? 'gold' : ''}>{state.crossed ? '🛡️' : '—'}</b>
                <span>{tr('руки скрещены', 'arms crossed')}</span>
              </div>
              <div className="stat">
                <b className={state.armsUp ? 'gold' : ''}>{state.armsUp ? '🙌' : '—'}</b>
                <span>{tr('руки вверх', 'arms up')}</span>
              </div>
            </div>
            <DwellButton onSelect={() => toggle(false)}>⏻ {tr('Выключить жесты телом', 'Turn off body gestures')}</DwellButton>
          </>
        ) : (
          <>
            <p className="muted">{notice ?? tr('Режим выключен. Он загружает вторую модель и немного снижает FPS.', 'Off. It loads a second model and lowers FPS a little.')}</p>
            <DwellButton className="btn-primary" onSelect={() => toggle(true)}>
              ⏻ {tr('Включить жесты телом', 'Turn on body gestures')}
            </DwellButton>
          </>
        )}
        <div className="panel-buttons">
          <DwellButton onSelect={() => openAcademy(null)}>← {tr('В академию', 'Academy')}</DwellButton>
        </div>
      </aside>
    </div>
  );
}
