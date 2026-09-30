import { useEffect, useState } from 'react';
import { sfx } from '../../game/sfx';
import { gestureEngine } from '../../gestures/matcher';
import { RUNES, runeShape, type RuneId } from '../../gestures/runes/runes';
import { CameraView } from '../../render/CameraView';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { DwellButton } from '../DwellButton';
import { tr } from '../../i18n';

/** Превью руны: эталонная фигура как SVG-линия со стрелкой начала. */
export function RuneGlyph({ id, size = 64 }: { id: RuneId; size?: number }) {
  const pts = runeShape(id);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const pad = size * 0.12;
  const k = (size - pad * 2) / span;
  const P = pts.map((p) => [pad + (p.x - minX) * k, pad + (p.y - minY) * k]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <polyline
        points={P.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke={RUNES[id].color}
        strokeWidth={size / 18}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={P[0][0]} cy={P[0][1]} r={size / 16} fill="#fff" />
    </svg>
  );
}

type Attempt = { ok: true; rune: RuneId; score: number } | { ok: false; reason: string };

/** Академия рун: перо (👌) + фигура в воздухе; каждая попытка разбирается. */
export function RuneAcademy() {
  const { openAcademy } = useGame();
  const [last, setLast] = useState<Attempt | null>(null);
  const [counts, setCounts] = useState<Partial<Record<RuneId, number>>>({});
  const penDown = useGesture((s) => s.snap?.rune.penDown ?? false);

  useEffect(
    () =>
      gestureEngine.on((e) => {
        if (e.type === 'rune') {
          sfx.victory();
          setLast({ ok: true, rune: e.rune, score: e.score });
          setCounts((c) => ({ ...c, [e.rune]: (c[e.rune] ?? 0) + 1 }));
        } else if (e.type === 'runeFail') {
          sfx.reject();
          setLast({ ok: false, reason: e.reason });
        }
      }),
    [],
  );

  return (
    <div className="split-screen">
      <CameraView className="split-camera">
        {penDown && <div className="toast">✍️ {tr('Рисуешь руну…', 'Drawing a rune…')}</div>}
      </CameraView>
      <aside className="side-panel academy-panel">
        <h2 className="screen-title">✍️ {tr('Руны', 'Runes')}</h2>
        <p className="pose-text">
          {tr('Сведи', 'Pinch your')} <b>{tr('большой и указательный', 'thumb and index')}</b>
          {tr(
            ', как будто держишь перо (👌, остальные пальцы выпрямлены), и нарисуй фигуру в воздухе крупно и одним движением. Разведи пальцы — руна сработает.',
            ' as if holding a quill (👌, other fingers straight) and draw the shape in the air, large and in one stroke. Open your fingers — the rune fires.',
          )}
        </p>
        <div className="rune-grid">
          {(Object.keys(RUNES) as RuneId[]).map((id) => (
            <div key={id} className={`rune-card ${last?.ok && last.rune === id ? 'rune-hit' : ''}`}>
              <RuneGlyph id={id} />
              <b>{RUNES[id].name}</b>
              <small>{RUNES[id].effect}</small>
              {counts[id] ? <small className="found">✓ ×{counts[id]}</small> : null}
            </div>
          ))}
        </div>
        {last && (
          <div className={`calibration-hint ${last.ok ? '' : 'hint-fail'}`}>
            {last.ok
              ? `✓ ${RUNES[last.rune].name} — ${tr('точность росчерка', 'stroke accuracy')} ${Math.round(last.score * 100)}%`
              : `✗ ${last.reason}`}
          </div>
        )}
        <p className="muted">{tr('В бою руны стоят 60 маны и делят кулдаун 12 с.', 'In battle runes cost 60 mana and share a 12 s cooldown.')}</p>
        <div className="panel-buttons">
          <DwellButton onSelect={() => openAcademy(null)}>← {tr('В академию', 'Academy')}</DwellButton>
        </div>
      </aside>
    </div>
  );
}
