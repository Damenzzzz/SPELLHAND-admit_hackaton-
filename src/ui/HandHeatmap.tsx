import { OPEN, synthHand } from '../gestures/synthHand';
import { BONES } from '../render/HandOverlay';
import { FINGER_JOINTS, FINGERS, type FingerId } from '../vision/features';
import { isEn, tr } from '../i18n';

const FINGER_RU: Record<FingerId, string> = {
  thumb: 'большой',
  index: 'указательный',
  middle: 'средний',
  ring: 'безымянный',
  pinky: 'мизинец',
};

const FINGER_EN: Record<FingerId, string> = { thumb: 'thumb', index: 'index', middle: 'middle', ring: 'ring', pinky: 'pinky' };

/** Цвет от зелёного (нет ошибок) к красному (главная проблема). */
const heat = (k: number) => `hsl(${Math.round(130 - 130 * k)} 85% 58%)`;

/**
 * Тепловая карта ошибок по пальцам: процедурная рука (как в академии),
 * каждый палец окрашен по доле ошибок, в которых он виноват.
 */
export function HandHeatmap({ errors, size = 220 }: { errors: Record<FingerId, number>; size?: number }) {
  const pts = synthHand({ ext: OPEN, aspect: 1, wrist: { x: 0.5, y: 0.88 }, palm: 0.36 });
  // зеркально, как игрок видит свою руку на экране
  const P = pts.map((p) => [(1 - p.x) * size, p.y * size] as const);
  const max = Math.max(1, ...Object.values(errors));
  const fingerOf = (i: number) => FINGERS.find((f) => FINGER_JOINTS[f].includes(i));
  const worst = FINGERS.reduce((a, f) => (errors[f] > errors[a] ? f : a), 'thumb' as FingerId);

  return (
    <figure className="heatmap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={tr('Ошибки по пальцам', 'Errors by finger')}>
        {BONES.map(([a, b]) => {
          const f = fingerOf(b) ?? fingerOf(a);
          const color = f && FINGER_JOINTS[f].includes(a) ? heat(errors[f] / max) : 'rgba(255,255,255,0.35)';
          return (
            <line
              key={`${a}-${b}`}
              x1={P[a][0]}
              y1={P[a][1]}
              x2={P[b][0]}
              y2={P[b][1]}
              stroke={color}
              strokeWidth={size / 22}
              strokeLinecap="round"
            />
          );
        })}
        {FINGERS.map((f) => {
          const tip = P[FINGER_JOINTS[f][3]];
          return (
            <text key={f} x={tip[0]} y={tip[1] - 10} textAnchor="middle" className="heatmap-count">
              {errors[f]}
            </text>
          );
        })}
      </svg>
      <figcaption>
        {errors[worst] > 0 ? (
          <>
            {tr('Чаще всего подводит', 'Most errors:')} <b>{(isEn() ? FINGER_EN : FINGER_RU)[worst]}</b> — {errors[worst]}{' '}
            {tr('ош.', 'err.')}
          </>
        ) : (
          tr('Ошибок по пальцам пока нет', 'No finger errors yet')
        )}
      </figcaption>
    </figure>
  );
}
