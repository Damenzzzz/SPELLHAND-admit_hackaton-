import { useEffect, useState } from 'react';
import { GESTURE_CONFIG } from '../../gestures/config';
import { gestureEngine } from '../../gestures/matcher';
import { TEMPLATES, TEMPLATE_BY_ID } from '../../gestures/templates';
import type { GestureId } from '../../gestures/types';
import { sfx } from '../../game/sfx';
import { ACADEMY, AcademyCounter } from '../../game/academyProgress';
import { CameraView } from '../../render/CameraView';
import { GhostHand } from '../../render/GhostHand';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { updateSave, useSave } from '../../store/saveStore';
import { DwellButton } from '../DwellButton';
import { SpellIcon } from '../SpellIcon';
import { HintCard } from '../HintCard';
import { ScreenShell } from '../ScreenShell';
import { tr } from '../../i18n';


export function Academy() {
  const gesture = useGame((s) => s.academyGesture);
  // key: новое упражнение — новый счётчик, таймеры и подписки; ничего не переезжает из прошлого
  return gesture ? <Training key={gesture} gesture={gesture} /> : <GestureList />;
}

function GestureList() {
  const { go, openAcademy } = useGame();
  const learned = useSave((s) => s.learned);
  return (
    <ScreenShell className="academy-list">
      <h2 className="screen-title">📖 {tr('Академия', 'Academy')}</h2>
      <p className="menu-sub">
        {tr(
          'Выбери жест: чек-лист покажет, что исправить. 3 успешные попытки — жест изучен (щит и лечение — удержание 1 с).',
          'Pick a gesture: the checklist shows what to fix. 3 successful attempts — gesture learned (shield and healing — a 1 s hold).',
        )}
      </p>
      <div className="gesture-grid">
        {TEMPLATES.map((t) => (
          <DwellButton key={t.id} className="gesture-card" onSelect={() => openAcademy(t.id)}>
            <SpellIcon id={t.id} className="gesture-icon" />
            {t.name}
            <small>{learned.includes(t.id) ? tr('✓ изучен', '✓ learned') : t.hands === 2 ? tr('две руки', 'two hands') : tr('одна рука', 'one hand')}</small>
          </DwellButton>
        ))}
      </div>
      <nav className="results-buttons">
        <DwellButton onSelect={() => go('combos')}>⚡ {tr('Комбинации', 'Combos')}</DwellButton>
        <DwellButton onSelect={() => go('runes')}>✍️ {tr('Руны', 'Runes')}</DwellButton>
        <DwellButton onSelect={() => go('body')}>🧍 {tr('Тело', 'Body')}</DwellButton>
        <DwellButton onSelect={() => go('personal')}>🎯 {tr('Под мою руку', 'Fit my hand')}</DwellButton>
        <DwellButton onSelect={() => go('tutorial')}>🎓 {tr('Повторить вводный бой', 'Replay intro battle')}</DwellButton>
        <DwellButton onSelect={() => go('menu')}>← {tr('В меню', 'Menu')}</DwellButton>
      </nav>
    </ScreenShell>
  );
}

/** Короткие конкретные шаги: как поставить руку и что сделать. Для щита и лечения движения нет. */
const STEPS: Record<GestureId, { pose: () => string; action: () => string }> = {
  fireball: {
    pose: () => tr('Пальцы прямые и чуть разведены, ладонь смотрит в камеру.', 'Fingers straight and slightly spread, palm facing the camera.'),
    action: () => tr('Подержи ~1 с (заряд), затем резко толкни ладонь к камере на 10–15 см. Дольше 2 с — шар взорвётся.', 'Hold ~1 s to charge, then push your palm sharply 10–15 cm toward the camera. Over 2 s — it explodes.'),
  },
  ice: {
    pose: () => tr('Указательный и средний выпрямлены и прижаты друг к другу, остальные согнуты.', 'Index and middle straight and pressed together, the rest curled.'),
    action: () => tr('Резко кивни кистью вниз (рука на месте). Серия до 3 осколков — одна попытка.', 'Flick your wrist down sharply (arm stays still). A series of up to 3 shards is one attempt.'),
  },
  lightning: {
    pose: () => tr('Только указательный вверх, кисть выше макушки.', 'Only the index finger up, hand above the top of your head.'),
    action: () => tr('Одним быстрым рывком опусти руку до груди.', 'In one fast motion drop your hand to your chest.'),
  },
  wind: {
    pose: () => tr('Две раскрытые ладони на ширине плеч, обе в кадре.', 'Two open palms shoulder-width apart, both in frame.'),
    action: () => tr('Быстро веди обе руки в одну сторону одновременно.', 'Move both hands quickly to the same side at once.'),
  },
  heal: {
    pose: () => tr('Две раскрытые ладони рядом, запястья почти касаются.', 'Two open palms side by side, wrists almost touching.'),
    action: () => tr('Держи 1 секунду — двигать не нужно. Потом опусти руки и повтори.', 'Hold for 1 second — no motion needed. Then lower your hands and repeat.'),
  },
  shield: {
    pose: () => tr('Плотный кулак пальцами к камере, большой палец прижат.', 'Tight fist with knuckles to the camera, thumb pressed in.'),
    action: () => tr('Держи 1 секунду — двигать не нужно. Потом опусти руку и повтори.', 'Hold for 1 second — no motion needed. Then lower your hand and repeat.'),
  },
};

/** Через столько секунд без единой удачной попытки предлагаем настроить распознавание под руку. */
const STUCK_MS = 25000;

function Training({ gesture }: { gesture: GestureId }) {
  const { openAcademy, go } = useGame();
  const tpl = TEMPLATE_BY_ID[gesture];
  const isHold = tpl.motion.kind === 'hold';
  // счётчик живёт вместе с упражнением: компонент пересоздаётся по key={gesture}
  const [counter] = useState(() => new AcademyCounter(gesture, isHold ? 'hold' : 'motion'));
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [startedAt] = useState(() => performance.now());
  const [, tick] = useState(0);
  const learned = useSave((s) => s.learned.includes(gesture));
  // «повтор» — только если жест был изучен до этого захода, а не только что
  const [learnedBefore] = useState(() => useSave.getState().learned.includes(gesture));

  // живой чек-лист — 10 раз в секунду
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const success = (q: number) => {
      sfx.cast(gesture === 'shield' ? 'heal' : gesture);
      const n = counter.count;
      setCount(n);
      setToast(
        n === ACADEMY.needed
          ? tr(`✨ Жест изучен! Точность ${Math.round(q * 100)}%`, `✨ Gesture learned! Accuracy ${Math.round(q * 100)}%`)
          : tr(`✨ Засчитано ${Math.min(n, ACADEMY.needed)}/${ACADEMY.needed} · точность ${Math.round(q * 100)}%`, `✨ Counted ${Math.min(n, ACADEMY.needed)}/${ACADEMY.needed} · accuracy ${Math.round(q * 100)}%`),
      );
      if (n >= ACADEMY.needed) updateSave((s) => (s.learned.includes(gesture) ? {} : { learned: [...s.learned, gesture] }));
    };
    const off = gestureEngine.on((e) => {
      const q = counter.onEvent(e);
      if (q !== null) success(q);
    });
    const unsub = useGesture.subscribe((s) => {
      if (!s.snap) return;
      const q = counter.onSnapshot(s.snap);
      if (q !== null) success(q);
    });
    return () => {
      off();
      unsub();
    };
  }, [gesture, counter]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(id);
  }, [toast]);

  const snap = useGesture.getState().snap;
  const score = snap?.scores[gesture];
  const results = score?.results ?? [];
  const active = snap?.active ?? null;
  const armed = active === gesture;
  const allOk = results.length > 0 && results.every((r) => r.score >= GESTURE_CONFIG.constraintFail);
  const match = Math.round((score?.score ?? 0) * 100);
  const hold = counter.holdState(snap?.t ?? 0, active);
  const idx = TEMPLATES.findIndex((t) => t.id === gesture);
  const next = TEMPLATES[(idx + 1) % TEMPLATES.length];
  const stuck = count === 0 && performance.now() - startedAt > STUCK_MS;

  // одна строка состояния: чужой жест → распознано (что дальше) → засчитано → почему ещё не распознано
  let status: { text: string; tone: 'ok' | 'warn' | 'pending' };
  if (active && !armed) {
    status = { tone: 'warn', text: tr(`Сейчас распознан «${TEMPLATE_BY_ID[active].name}» — а нужен «${tpl.name}»`, `Detected “${TEMPLATE_BY_ID[active].name}” — but you need “${tpl.name}”`) };
  } else if (armed && isHold) {
    status = hold.phase === 'counted'
      ? { tone: 'ok', text: tr('Засчитано! Опусти руку и подними снова', 'Counted! Lower your hand and raise it again') }
      : { tone: 'ok', text: tr(`Поза распознана — держи… ${Math.round(hold.progress * 100)}%`, `Pose recognized — hold… ${Math.round(hold.progress * 100)}%`) };
  } else if (armed) {
    const charge = snap?.charge ?? 0;
    status = gesture === 'fireball'
      ? (snap?.overcharge ?? 0) > 0
        ? { tone: 'warn', text: tr('Перегрев — толкай сейчас!', 'Overheating — push now!') }
        : { tone: 'ok', text: tr(`Поза распознана · заряд ${Math.round(charge * 100)}% — толкни ладонь к камере`, `Pose recognized · charge ${Math.round(charge * 100)}% — push your palm at the camera`) }
      : { tone: 'ok', text: tr(`Поза распознана — теперь движение: ${STEPS[gesture].action()}`, `Pose recognized — now the motion: ${STEPS[gesture].action()}`) };
  } else if (allOk) {
    status = { tone: 'pending', text: tr(`Почти: совпадение ${match}%, нужно 85% — держи руку неподвижно и точнее каждое условие`, `Almost: match ${match}%, need 85% — keep your hand still and meet each point more precisely`) };
  } else {
    status = { tone: 'pending', text: tr('Поза не распознана — исправь красные пункты', 'Pose not recognized — fix the red items') };
  }

  return (
    <div className="split-screen">
      <CameraView className="split-camera" staff>
        <HintCard compact />
        {toast && <div className="toast">{toast}</div>}
      </CameraView>
      <aside className="side-panel academy-panel">
        <h2 className="screen-title title-with-icon">
          <SpellIcon id={tpl.id} /> {tpl.name}
        </h2>
        <div className="academy-ghost">
          <GhostHand gesture={gesture} size={150} />
          <ol className="academy-steps">
            <li>{STEPS[gesture].pose()}</li>
            <li className="motion-text">{STEPS[gesture].action()}</li>
          </ol>
        </div>

        <p className={`academy-status academy-status-${status.tone}`} role="status">
          {status.text}
          {armed && isHold && hold.phase === 'holding' && (
            <span className="academy-hold" aria-hidden>
              <span style={{ transform: `scaleX(${hold.progress})` }} />
            </span>
          )}
        </p>

        <div className="pose-match" aria-label={tr(`Совпадение позы ${match}%`, `Pose match ${match}%`)}>
          <div className="pose-match-fill" style={{ transform: `scaleX(${Math.min(1, match / 100)})` }} />
          <span className="pose-match-mark" style={{ left: `${GESTURE_CONFIG.recognize * 100}%` }} aria-hidden />
          <span className="pose-match-label">
            {tr('Совпадение позы', 'Pose match')}: {match}% · {tr('нужно', 'need')} {Math.round(GESTURE_CONFIG.recognize * 100)}%
          </span>
        </div>

        <ul className="checklist">
          {results.map((r) => (
            <li key={r.id} className={`check ${r.score >= GESTURE_CONFIG.constraintFail ? 'check-ok' : 'check-fail'}`}>
              <span className="check-icon" aria-hidden />
              <span>{r.label}</span>
            </li>
          ))}
        </ul>

        <div className="progress-dots">
          {Array.from({ length: ACADEMY.needed }, (_, i) => (
            <span key={i} className={i < count ? 'dot dot-on' : 'dot'} />
          ))}
          <span>
            {learned && learnedBefore
              ? tr(`✓ Жест изучен · повтор ${Math.min(count, ACADEMY.needed)}/${ACADEMY.needed}`, `✓ Learned · practice ${Math.min(count, ACADEMY.needed)}/${ACADEMY.needed}`)
              : learned
                ? tr(`✓ Жест изучен! ${ACADEMY.needed}/${ACADEMY.needed}`, `✓ Gesture learned! ${ACADEMY.needed}/${ACADEMY.needed}`)
                : `${tr('Успешных попыток', 'Successful attempts')}: ${Math.min(count, ACADEMY.needed)}/${ACADEMY.needed}`}
          </span>
        </div>

        {stuck && (
          <div className="academy-stuck">
            <span>{tr('Не выходит? Игра может подстроиться под твою руку.', 'Not working? The game can adapt to your hand.')}</span>
            <DwellButton onSelect={() => go('personal')}>🎯 {tr('Под мою руку', 'Fit my hand')}</DwellButton>
          </div>
        )}

        <div className="panel-buttons">
          <DwellButton onSelect={() => openAcademy(null)}>← {tr('К списку', 'All gestures')}</DwellButton>
          <DwellButton onSelect={() => openAcademy(next.id)}>
            {next.icon} {tr('Дальше', 'Next')}
          </DwellButton>
        </div>
      </aside>
    </div>
  );
}
