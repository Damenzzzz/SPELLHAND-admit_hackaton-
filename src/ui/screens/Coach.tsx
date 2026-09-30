import { useEffect, useRef, useState } from 'react';
import { adviceFor } from '../../game/data/hints';
import {
  accuracyTrend,
  fingerErrors,
  gestureOfConstraint,
  recordSession,
  topErrorIds,
} from '../../game/progress';
import { sfx } from '../../game/sfx';
import { GESTURE_CONFIG } from '../../gestures/config';
import { gestureEngine } from '../../gestures/matcher';
import { TEMPLATE_BY_ID, TEMPLATES } from '../../gestures/templates';
import type { GestureId } from '../../gestures/types';
import { CameraView } from '../../render/CameraView';
import { GhostHand } from '../../render/GhostHand';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { useSave } from '../../store/saveStore';
import { AccuracyChart } from '../AccuracyChart';
import { DwellButton } from '../DwellButton';
import { HandHeatmap } from '../HandHeatmap';
import { HintCard } from '../HintCard';
import { ScreenShell } from '../ScreenShell';
import { SpellIcon } from '../SpellIcon';
import { tr } from '../../i18n';

const DRILL_MS = 30000;
const HOLD_SUCCESS_MS = 800;

/** Текст ошибки по id: подсказка ограничения или осечки. */
function errorText(id: string): string {
  for (const t of TEMPLATES) {
    const c = t.pose.find((x) => x.id === id);
    if (c) return c.hint;
    if (id === `${t.id}_motion_weak`) return t.motion.weakHint;
  }
  return id;
}

/** Стабильная ссылка: новый [] в селекторе zustand зацикливает рендер, пока истории нет. */
const NO_HISTORY: NonNullable<ReturnType<typeof useSave.getState>['history']> = [];

/** «Тренер»: прогресс между сессиями, тепловая карта пальцев и упражнение на слабое место. */
export function Coach() {
  const [drill, setDrill] = useState<{ gesture: GestureId; constraint: string } | null>(null);
  return drill ? <Drill {...drill} onDone={() => setDrill(null)} /> : <Overview onDrill={setDrill} />;
}

function Overview({ onDrill }: { onDrill: (d: { gesture: GestureId; constraint: string }) => void }) {
  const go = useGame((s) => s.go);
  const history = useSave((s) => s.history ?? NO_HISTORY);
  const trend = accuracyTrend(history);
  const top = topErrorIds(history).slice(0, 3);
  const weakest = top.find((e) => gestureOfConstraint(e.id));

  // средняя точность по жестам за всю историю
  const perGesture = TEMPLATES.map((t) => {
    const xs = history.flatMap((s) => (s.perSpell[t.id] ? [s.perSpell[t.id]!] : []));
    const n = xs.reduce((a, x) => a + x.count, 0);
    return { t, n, q: n ? xs.reduce((a, x) => a + x.avgQuality * x.count, 0) / n : 0 };
  });

  return (
    <ScreenShell className="coach">
      <h2 className="screen-title">📈 {tr('Тренер', 'Coach')}</h2>
      <div className="results-grid">
        <section className="card">
          <h3>{tr('Точность по сессиям', 'Accuracy by session')}</h3>
          {trend && (
            <p className="trend">
              {tr('было', 'was')} <b>{Math.round(trend.before * 100)}%</b> → {tr('стало', 'now')}{' '}
              <b className={trend.after >= trend.before ? 'up' : 'down'}>{Math.round(trend.after * 100)}%</b>
            </p>
          )}
          <AccuracyChart history={history} />
          <h3>{tr('Качество жестов', 'Gesture quality')}</h3>
          <div className="quality-list">
            {perGesture
              .filter((g) => g.n)
              .map(({ t, n, q }) => (
                <div key={t.id} className="quality-row">
                  <span>
                    <SpellIcon id={t.id} className="icon-inline" /> {t.name} ×{n}
                  </span>
                  <span className="bar quality-bar">
                    <span className="bar-fill" style={{ transform: `scaleX(${q})` }} />
                  </span>
                  <b>{Math.round(q * 100)}%</b>
                </div>
              ))}
          </div>
        </section>
        <section className="card coach-right">
          <h3>{tr('Какие пальцы подводят', 'Which fingers fail')}</h3>
          <HandHeatmap errors={fingerErrors(history)} />
          <h3>{tr('Частые ошибки', 'Common errors')}</h3>
          {top.length ? (
            <ol className="error-list">
              {top.map((e) => (
                <li key={e.id}>
                  <span>{errorText(e.id)}</span>
                  <b>{e.count}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{tr('Ошибок пока нет — сыграй бой или разминку.', 'No errors yet — play a battle or a warm-up.')}</p>
          )}
        </section>
      </div>
      <nav className="results-buttons">
        {weakest && (
          <DwellButton
            className="btn-primary"
            onSelect={() => onDrill({ gesture: gestureOfConstraint(weakest.id)!, constraint: weakest.id })}
          >
            🎯 {tr('Упражнение', 'Drill')}: {errorText(weakest.id).toLowerCase()}
          </DwellButton>
        )}
        <DwellButton onSelect={() => go('menu')}>← {tr('В меню', 'Menu')}</DwellButton>
      </nav>
    </ScreenShell>
  );
}

/**
 * Упражнение 30 с на одно ограничение: делай жест снова и снова, следя за проблемным
 * пальцем. Считаем удачные касты и срывы именно по этому ограничению.
 */
function Drill({ gesture, constraint, onDone }: { gesture: GestureId; constraint: string; onDone: () => void }) {
  const tpl = TEMPLATE_BY_ID[gesture];
  const hold = tpl.motion.kind === 'hold';
  const [left, setLeft] = useState(DRILL_MS);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [done, setDone] = useState(false);
  const [, tick] = useState(0);
  const counted = useRef(0);
  const history = useSave((s) => s.history ?? NO_HISTORY);
  const before = history.slice(-10).reduce((a, s) => a + (s.errors[constraint] ?? 0), 0);

  useEffect(() => {
    const start = performance.now();
    let h = 0;
    let m = 0;
    const off = gestureEngine.on((e) => {
      if (e.type === 'cast' && e.gesture === gesture && e.shard === 1) {
        h++;
        setHits(h);
        sfx.select();
      }
      if (e.type === 'nearMiss' && e.gesture === gesture && e.constraints.some((c) => c.id === constraint)) {
        m++;
        setMisses(m);
      }
      if (e.type === 'misfire' && e.id === constraint) {
        m++;
        setMisses(m);
      }
    });
    const unsub = useGesture.subscribe(({ snap }) => {
      if (!hold || !snap || snap.active !== gesture || snap.t - snap.activeSince < HOLD_SUCCESS_MS) return;
      if (counted.current === snap.activeSince) return;
      counted.current = snap.activeSince;
      h++;
      setHits(h);
      sfx.select();
    });
    const id = setInterval(() => {
      const l = Math.max(0, DRILL_MS - (performance.now() - start));
      setLeft(l);
      tick((n) => n + 1);
      if (l === 0) {
        clearInterval(id);
        off();
        unsub();
        const attempts = h + m;
        recordSession({
          mode: 'drill',
          accuracy: attempts ? h / attempts : 0,
          perSpell: {},
          errorCounts: m ? { [constraint]: m } : {},
        });
        sfx.victory();
        setDone(true);
      }
    }, 100);
    return () => {
      clearInterval(id);
      off();
      unsub();
    };
  }, [gesture, constraint, hold]);

  const snap = useGesture.getState().snap;
  const live = snap?.scores[gesture]?.results.find((r) => r.id === constraint);
  const ok = (live?.score ?? 0) >= GESTURE_CONFIG.constraintFail;

  return (
    <div className="split-screen">
      <CameraView className="split-camera" staff>
        {!done && <HintCard compact />}
      </CameraView>
      <aside className="side-panel academy-panel">
        <h2 className="screen-title title-with-icon">
          <SpellIcon id={gesture} /> {tr('Упражнение', 'Drill')}
        </h2>
        <p className="pose-text">
          {tr(`Делай «${tpl.name}» снова и снова. Следи:`, `Do “${tpl.name}” again and again. Watch out:`)} <b>{errorText(constraint).toLowerCase()}</b>
        </p>
        <GhostHand gesture={gesture} size={150} />
        {live && (
          <div className={`check ${ok ? 'check-ok' : 'check-fail'}`}>
            <span className="check-icon" aria-hidden />
            <span>{live.label}</span>
          </div>
        )}
        <div className="stat-row">
          <div className="stat">
            <b>{hits}</b>
            <span>{tr('удачных', 'successful')}</span>
          </div>
          <div className="stat">
            <b>{misses}</b>
            <span>{tr('срывов по этой ошибке', 'slips on this error')}</span>
          </div>
          <div className="stat">
            <b>
              {Math.ceil(left / 1000)} {tr('с', 's')}
            </b>
            <span>{tr('осталось', 'left')}</span>
          </div>
        </div>
        {done && (
          <>
            <p className="found">
              {tr(`Готово: ${hits} удачных, ${misses} срывов`, `Done: ${hits} successful, ${misses} slips`)}
              {before > 0 ? tr(` (за последние бои эта ошибка была ${before} раз)`, ` (this error happened ${before} times in recent battles)`) : ''}.
            </p>
            <p className="muted">{adviceFor(constraint)}</p>
          </>
        )}
        <div className="panel-buttons">
          <DwellButton onSelect={onDone}>← {tr('К тренеру', 'Back to coach')}</DwellButton>
        </div>
      </aside>
    </div>
  );
}
