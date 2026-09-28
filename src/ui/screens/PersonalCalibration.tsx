import { useEffect, useRef, useState } from 'react';
import { PERSONAL_GESTURES, quantize, setPersonalModel, shapeVector, type PersonalModel } from '../../gestures/personal';
import { TEMPLATE_BY_ID } from '../../gestures/templates';
import { sfx } from '../../game/sfx';
import { CameraView } from '../../render/CameraView';
import { GhostHand } from '../../render/GhostHand';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { updateSave, useSave } from '../../store/saveStore';
import { DwellButton } from '../DwellButton';
import { SpellIcon } from '../SpellIcon';

const REPS = 3;
const HOLD_MS = 1200;
const SAMPLES_PER_REP = 10;
/** Сдвиг центра ладони за кадр (в ладонях), при котором рука считается неподвижной. */
const STEADY = 0.08;
const RELEASE_MS = 500;

type Phase = 'intro' | 'hold' | 'release' | 'done';

/**
 * «Настрой под свою руку»: по 3 записи каждого одноручного жеста в удобной игроку форме.
 * Образец берётся только при выполненном намерении жеста и неподвижной руке.
 */
export function PersonalCalibration() {
  const { openAcademy } = useGame();
  const hasModel = useSave((s) => !!s.personal && Object.keys(s.personal).length > 0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [gi, setGi] = useState(0);
  const [rep, setRep] = useState(0);
  const [progress, setProgress] = useState(0);
  const model = useRef<PersonalModel>({});

  useEffect(() => {
    if (phase !== 'hold' && phase !== 'release') return;
    const g = PERSONAL_GESTURES[gi];
    let steadySince = 0;
    let goneSince = 0;
    let buf: number[][] = [];
    let last: { x: number; y: number } | null = null;

    const id = setInterval(() => {
      const snap = useGesture.getState().snap;
      const s = snap?.scores[g];
      const h = s && s.handIdx >= 0 ? snap!.hands[s.handIdx] : undefined;
      const now = performance.now();

      if (phase === 'release') {
        // между повторами рука должна уйти или смениться, иначе все образцы одинаковые
        if (!h || !s!.intent) goneSince ||= now;
        else goneSince = 0;
        if (goneSince && now - goneSince >= RELEASE_MS) setPhase('hold');
        return;
      }

      const move = h && last ? Math.hypot(h.center.x - last.x, h.center.y - last.y) / h.palmSize : 1;
      last = h ? { x: h.center.x, y: h.center.y } : null;
      if (h && s!.intent && move < STEADY) {
        steadySince ||= now;
        buf.push(shapeVector(h));
      } else {
        steadySince = 0;
        buf = [];
      }
      const p = steadySince ? Math.min(1, (now - steadySince) / HOLD_MS) : 0;
      setProgress(p);
      if (p < 1) return;

      // равномерно SAMPLES_PER_REP векторов из удержания
      const step = Math.max(1, Math.floor(buf.length / SAMPLES_PER_REP));
      const picked = buf.filter((_, i) => i % step === 0).slice(0, SAMPLES_PER_REP).map(quantize);
      model.current[g] = [...(model.current[g] ?? []), ...picked];
      sfx.select();
      setProgress(0);

      if (rep + 1 < REPS) {
        setRep(rep + 1);
        setPhase('release');
      } else if (gi + 1 < PERSONAL_GESTURES.length) {
        setGi(gi + 1);
        setRep(0);
        setPhase('release');
      } else {
        updateSave({ personal: model.current });
        setPersonalModel(model.current);
        sfx.victory();
        setPhase('done');
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase, gi, rep]);

  const g = PERSONAL_GESTURES[gi];
  const tpl = TEMPLATE_BY_ID[g];

  return (
    <div className="split-screen">
      <CameraView className="split-camera">
        {phase === 'hold' && <div className="calib-progress" style={{ ['--p' as string]: progress }} />}
      </CameraView>
      <aside className="side-panel academy-panel">
        <h2 className="screen-title">🎯 Под мою руку</h2>

        {phase === 'intro' && (
          <>
            <p>
              Покажи каждый из {PERSONAL_GESTURES.length} жестов по {REPS} раза так, как тебе удобно. Игра запомнит
              форму твоей руки и будет узнавать жесты увереннее — даже если палец от природы не выпрямляется до конца.
            </p>
            <DwellButton className="btn-primary" onSelect={() => setPhase('hold')}>
              ▶ Начать (~1 мин)
            </DwellButton>
            {hasModel && (
              <DwellButton
                onSelect={() => {
                  updateSave({ personal: undefined });
                  setPersonalModel(undefined);
                  openAcademy(null);
                }}
              >
                ♻ Сбросить мою калибровку
              </DwellButton>
            )}
          </>
        )}

        {(phase === 'hold' || phase === 'release') && (
          <>
            <div className="title-with-icon">
              <SpellIcon id={g} /> {tpl.name} — {rep + 1}/{REPS}
            </div>
            <GhostHand gesture={g} size={160} />
            <p className="pose-text">
              {phase === 'hold' ? `${tpl.poseText}. Держи неподвижно…` : 'Опусти руку и покажи жест ещё раз'}
            </p>
            <div className="progress-dots">
              {PERSONAL_GESTURES.map((x, i) => (
                <span key={x} className={i < gi ? 'dot dot-on' : 'dot'} />
              ))}
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <p className="found">✓ Готово! Жесты подстроены под твою руку.</p>
            <p className="muted">Калибровка сохранена на этом устройстве. Её можно пройти заново в любой момент.</p>
          </>
        )}

        <div className="panel-buttons">
          <DwellButton onSelect={() => openAcademy(null)}>← В академию</DwellButton>
        </div>
      </aside>
    </div>
  );
}
