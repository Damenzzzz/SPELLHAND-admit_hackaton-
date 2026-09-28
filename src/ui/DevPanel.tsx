import { useEffect, useState } from 'react';
import { GESTURE_CONFIG } from '../gestures/config';
import { gestureEngine } from '../gestures/matcher';
import { TEMPLATES } from '../gestures/templates';
import type { GestureId } from '../gestures/types';
import { useGesture } from '../store/gestureStore';

const CAST_KEYS: Record<string, GestureId> = { f: 'fireball', i: 'ice', l: 'lightning', w: 'wind' };
const HOLD_KEYS: Record<string, GestureId> = { h: 'heal', s: 'shield' };

/** Клавиатура в dev-режиме: F/I/L/W — каст, H/S — держать лечение/щит. */
export function useDevKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const g = HOLD_KEYS[e.key.toLowerCase()];
      if (g && !e.repeat) gestureEngine.setDevHold(g);
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (HOLD_KEYS[k]) gestureEngine.setDevHold(null);
      if (CAST_KEYS[k]) gestureEngine.devCast(CAST_KEYS[k]);
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, []);
}

const f2 = (n: number) => n.toFixed(2);

/** Score каждого шаблона в реальном времени — для тюнинга порогов. */
export function DevPanel() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);
  const snap = useGesture.getState().snap;
  if (!snap) return <div className="dev-panel">dev: ждём кадры…</div>;

  const bestTpl = snap.best ? snap.scores[snap.best] : null;
  const h = snap.hands[0];

  return (
    <div className="dev-panel">
      <div className="dev-row dev-title">
        active: <b>{snap.active ?? '—'}</b> q={f2(snap.quality)} charge={f2(snap.charge)}
      </div>
      {TEMPLATES.map((t) => {
        const s = snap.scores[t.id]?.score ?? 0;
        const cls = s >= GESTURE_CONFIG.recognize ? 'ok' : s >= GESTURE_CONFIG.nearMiss ? 'warn' : '';
        return (
          <div key={t.id} className="dev-row">
            <span className="dev-name">
              {t.icon} {t.id}
            </span>
            <span className="dev-bar">
              <span className={`dev-fill ${cls}`} style={{ width: `${s * 100}%` }} />
            </span>
            <span>{f2(s)}</span>
          </div>
        );
      })}
      {bestTpl && (
        <div className="dev-constraints">
          {bestTpl.results.map((r) => (
            <div key={r.id} className={r.score < GESTURE_CONFIG.constraintFail ? 'dev-bad' : ''}>
              {r.id}: {f2(r.score)}
            </div>
          ))}
        </div>
      )}
      {h && (
        <div className="dev-constraints">
          facing={f2(h.palmFacing)} palm={f2(h.palmSize)} wristY={f2(h.wristY)}
          <br />
          ext: {Object.values(h.extension).map(f2).join(' ')}
          <br />
          growth={f2(snap.debug.growth)} vx={f2(snap.debug.vx)} vy={f2(snap.debug.vy)} tipVy=
          {f2(snap.debug.tipVy)}
        </div>
      )}
      <div className="dev-keys">F/I/L/W — каст · H/S — держать</div>
    </div>
  );
}
