import { useEffect, useState } from 'react';
import { useVision } from '../store/visionStore';
import { setRecordingLabel, startRecording, stopRecordingAndDownload } from '../vision/recorder';

/** Сценарий записи: каждый жест с движением, негативы, near-miss и сегменты надёжности. */
export const RECORDING_SCRIPT: { label: string; text: string }[] = [
  { label: 'fireball', text: '🔥 Огненный шар: открытая ладонь к камере, подержи и ТОЛКНИ вперёд — 3 раза' },
  { label: 'ice', text: '❄️ Лёд: указательный + средний вместе, 3 резких кивка кистью вниз — 2 серии' },
  { label: 'lightning', text: '⚡ Молния: указательный вверх над головой и резко махни вниз — 3 раза' },
  { label: 'wind', text: '🌪️ Ветер: две открытые ладони врозь, махни обеими в сторону — 3 раза' },
  { label: 'heal', text: '💚 Лечение: две раскрытые ладони рядом — держи' },
  { label: 'shield', text: '🛡️ Щит: кулак пальцами к камере — подними и опусти 3 раза' },
  { label: 'lightning_low', text: '⚡ Молния, но рука НИЖЕ головы и указательный чуть согнут (ошибка)' },
  { label: 'fireball_ring', text: '🔥 Ладонь, но безымянный согнут (ошибка)' },
  { label: 'none', text: '🙌 Ничего не колдуй: просто двигай руками естественно, почеши нос, помаши' },
  // --- надёжность: переходы, курсор меню, потеря руки, свет ---
  { label: 'switch_fire_shield', text: '🔁 Меняй ладонь ↔ кулак каждую секунду, БЕЗ толчков (переходы не должны стрелять)' },
  { label: 'switch_ice_lightning', text: '🔁 Меняй лёд ↔ указательный вверх над головой, БЕЗ кивков и взмахов' },
  { label: 'pointer_idle', text: '👉 Води указательным по экрану, как курсором в меню, ничего не колдуй' },
  { label: 'hand_out', text: '🙈 Покажи кулак, убери руку из кадра, верни; повторяй — без движений заклинаний' },
  { label: 'shield_steady', text: '🛡️ Держи кулак неподвижно все 10 секунд (щит не должен мигать)' },
  { label: 'low_light', text: '💡 Приглуши свет (закрой лампу рукой/шторой) и покажи огненный шар с толчком — 3 раза' },
];

const PREP_MS = 3000;
const STEP_MS = 10000;

/** dev: пошаговая запись реальных жестов → .jsonl.gz для регрессионных тестов. */
export function RecorderOverlay({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(-1);
  const [left, setLeft] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'prep' | 'rec' | 'done'>('idle');
  const [frames, setFrames] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    let i = 0;
    let stepStart = started;
    let prep = true;
    setRecordingLabel('prep');
    const id = setInterval(async () => {
      const now = performance.now();
      const dur = prep ? PREP_MS : STEP_MS;
      setLeft(Math.ceil((dur - (now - stepStart)) / 1000));
      if (now - stepStart < dur) return;
      stepStart = now;
      if (prep) {
        prep = false;
        setPhase('rec');
        setRecordingLabel(RECORDING_SCRIPT[i].label);
        return;
      }
      i++;
      if (i >= RECORDING_SCRIPT.length) {
        clearInterval(id);
        setFrames(await stopRecordingAndDownload());
        setPhase('done');
        setRunning(false);
        return;
      }
      prep = true;
      setStep(i);
      setPhase('prep');
      setRecordingLabel('prep');
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    const { videoSize } = useVision.getState();
    startRecording(videoSize.width, videoSize.height);
    setStep(0);
    setPhase('prep');
    setRunning(true);
  };

  const cur = RECORDING_SCRIPT[Math.max(0, step)];
  return (
    <div className="recorder">
      {phase === 'idle' && (
        <>
          <b>Запись жестов для тестов</b>
          <p>
            {RECORDING_SCRIPT.length} шагов по {STEP_MS / 1000} с (~
            {Math.round((RECORDING_SCRIPT.length * (STEP_MS + PREP_MS)) / 1000)} с). Файл скачается в конце — пришли его мне.
          </p>
          <button onClick={start}>⏺ Начать</button> <button onClick={onClose}>Закрыть</button>
        </>
      )}
      {(phase === 'prep' || phase === 'rec') && (
        <>
          <div className="recorder-step">
            Шаг {step + 1}/{RECORDING_SCRIPT.length} · {phase === 'prep' ? 'приготовься' : '● запись'} · {left} с
          </div>
          <div className="recorder-text">{cur.text}</div>
        </>
      )}
      {phase === 'done' && (
        <>
          <b>Готово: {frames} кадров</b>
          <p>Файл spellhand-rec-*.jsonl.gz скачан. Положи его в test/fixtures/ или пришли мне.</p>
          <button onClick={onClose}>Закрыть</button>
        </>
      )}
    </div>
  );
}
