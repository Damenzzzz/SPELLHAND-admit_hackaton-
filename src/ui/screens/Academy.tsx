import { useEffect, useRef, useState } from 'react';
import { GESTURE_CONFIG } from '../../gestures/config';
import { gestureEngine } from '../../gestures/matcher';
import { TEMPLATES, TEMPLATE_BY_ID } from '../../gestures/templates';
import type { GestureId } from '../../gestures/types';
import { sfx } from '../../game/sfx';
import { CameraView } from '../../render/CameraView';
import { GhostHand } from '../../render/GhostHand';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { updateSave, useSave } from '../../store/saveStore';
import { DwellButton } from '../DwellButton';
import { HintCard } from '../HintCard';
import { ScreenShell } from '../ScreenShell';

const NEEDED = 3;
const HOLD_SUCCESS_MS = 1000;

export function Academy() {
  const gesture = useGame((s) => s.academyGesture);
  return gesture ? <Training gesture={gesture} /> : <GestureList />;
}

function GestureList() {
  const { go, openAcademy } = useGame();
  const learned = useSave((s) => s.learned);
  return (
    <ScreenShell className="academy-list">
      <h2 className="screen-title">📖 Академия</h2>
      <p className="menu-sub">Выбери жест: чек-лист покажет, что исправить. 3 успешных каста — жест изучен.</p>
      <div className="gesture-grid">
        {TEMPLATES.map((t) => (
          <DwellButton key={t.id} className="gesture-card" onSelect={() => openAcademy(t.id)}>
            <span className="gesture-icon">{t.icon}</span>
            {t.name}
            <small>{learned.includes(t.id) ? '✓ изучен' : t.hands === 2 ? 'две руки' : 'одна рука'}</small>
          </DwellButton>
        ))}
      </div>
      <DwellButton onSelect={() => go('menu')}>← В меню</DwellButton>
    </ScreenShell>
  );
}

function Training({ gesture }: { gesture: GestureId }) {
  const { openAcademy } = useGame();
  const tpl = TEMPLATE_BY_ID[gesture];
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [, tick] = useState(0);
  const learned = useSave((s) => s.learned.includes(gesture));
  const holdCounted = useRef(0);

  // живой чек-лист — 10 раз в секунду
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setCount(0);
    const success = (q: number) => {
      sfx.cast(gesture === 'shield' ? 'heal' : gesture);
      setToast(`✨ Получилось! Точность ${Math.round(q * 100)}%`);
      setCount((c) => {
        const next = c + 1;
        if (next >= NEEDED) {
          updateSave((s) => (s.learned.includes(gesture) ? {} : { learned: [...s.learned, gesture] }));
        }
        return next;
      });
    };

    const off = gestureEngine.on((e) => {
      if (e.type === 'cast' && e.gesture === gesture && e.shard === 1) success(e.quality);
    });

    // удерживаемые позы (щит, лечение) засчитываются после секунды удержания
    const unsub = useGesture.subscribe((s) => {
      const snap = s.snap;
      if (!snap || tpl.motion.kind !== 'hold') return;
      if (snap.active === gesture && snap.t - snap.activeSince >= HOLD_SUCCESS_MS) {
        if (holdCounted.current !== snap.activeSince) {
          holdCounted.current = snap.activeSince;
          success(snap.quality);
        }
      }
    });
    return () => {
      off();
      unsub();
    };
  }, [gesture, tpl.motion.kind]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1400);
    return () => clearTimeout(id);
  }, [toast]);

  const snap = useGesture.getState().snap;
  const results = snap?.scores[gesture]?.results ?? [];
  const armed = snap?.active === gesture;
  const idx = TEMPLATES.findIndex((t) => t.id === gesture);
  const next = TEMPLATES[(idx + 1) % TEMPLATES.length];

  return (
    <div className="split-screen">
      <CameraView className="split-camera">
        <HintCard compact />
        {toast && <div className="toast">{toast}</div>}
      </CameraView>
      <aside className="side-panel academy-panel">
        <h2 className="screen-title">
          {tpl.icon} {tpl.name}
        </h2>
        <div className="academy-ghost">
          <GhostHand gesture={gesture} size={170} />
          <div>
            <p className="pose-text">{tpl.poseText}</p>
            <p className="motion-text">➜ {tpl.motion.howTo}</p>
          </div>
        </div>

        <ul className="checklist">
          {results.map((r) => (
            <li key={r.id} className={`check ${r.score >= GESTURE_CONFIG.constraintFail ? 'check-ok' : 'check-fail'}`}>
              <span className="check-icon" aria-hidden />
              <span>{r.label}</span>
            </li>
          ))}
          <li className={`check ${armed ? 'check-ok' : 'check-pending-static'}`}>
            <span className="check-icon" aria-hidden />
            <span>{armed ? 'Поза распознана — теперь движение!' : 'Поза не распознана'}</span>
          </li>
        </ul>

        <div className="progress-dots">
          {Array.from({ length: NEEDED }, (_, i) => (
            <span key={i} className={i < count ? 'dot dot-on' : 'dot'} />
          ))}
          <span>{learned ? '✓ Жест изучен' : `Успешных кастов: ${Math.min(count, NEEDED)}/${NEEDED}`}</span>
        </div>

        <div className="panel-buttons">
          <DwellButton onSelect={() => openAcademy(null)}>← К списку</DwellButton>
          <DwellButton onSelect={() => openAcademy(next.id)}>
            {next.icon} Дальше
          </DwellButton>
        </div>
      </aside>
    </div>
  );
}
