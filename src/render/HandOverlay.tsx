import { useEffect, useRef } from 'react';
import { useGesture } from '../store/gestureStore';
import { useVision, type Handedness } from '../store/visionStore';
import { FINGER_JOINTS, type FingerId } from '../vision/features';
import { ERROR_COLOR, GESTURE_COLOR } from './colors';

/** Кости скелета: запястье → пальцы + поперечная линия ладони. */
export const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const TIPS = new Set([4, 8, 12, 16, 20]);

const HAND_COLORS: Record<Handedness, string> = {
  Left: '#5fa8ff',
  Right: '#f2c35b',
};

/** Точки пальцев (без запястья) — для красной подсветки. */
function fingerPoints(fingers: FingerId[]): Set<number> {
  const s = new Set<number>();
  for (const f of fingers) FINGER_JOINTS[f].forEach((i) => s.add(i));
  return s;
}

export interface CoverBox {
  ox: number;
  oy: number;
  dw: number;
  dh: number;
}

/** Та же cover-математика, что у <video object-fit: cover>. */
export function coverBox(w: number, h: number, vw: number, vh: number): CoverBox {
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  return { ox: (w - dw) / 2, oy: (h - dh) / 2, dw, dh };
}

/**
 * Канвас поверх видео. Рисует сглаженные landmarks из распознавателя,
 * пальцы с ошибкой — красным, руку с распознанной позой — цветом заклинания.
 */
export function HandOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let drawnFrame = -1;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { hands: rawHands, frameTime, videoSize } = useVision.getState();
      const snap = useGesture.getState().snap;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const resized = canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr);
      if (resized) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      if (!resized && frameTime === drawnFrame) return;
      drawnFrame = frameTime;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!videoSize.width) return;

      const { ox, oy, dw, dh } = coverBox(w, h, videoSize.width, videoSize.height);
      const r = Math.max(3, Math.min(w, h) / 160);

      const hands = snap?.hands.length
        ? snap.hands.map((f) => ({ landmarks: f.raw, handedness: f.handedness }))
        : rawHands;

      hands.forEach((hand, hi) => {
        const pts = hand.landmarks.map((p) => [ox + p.x * dw, oy + p.y * dh] as const);
        const activeHere = snap?.active && snap.activeHandIdx === hi;
        const twoHandActive = snap?.active === 'wind' || snap?.active === 'heal';
        const color =
          snap?.active && (activeHere || twoHandActive)
            ? GESTURE_COLOR[snap.active]
            : HAND_COLORS[hand.handedness];
        const bad =
          snap?.hint?.kind === 'pose' && snap.hint.handIdx === hi ? fingerPoints(snap.hint.fingers) : null;

        ctx.lineCap = 'round';
        ctx.lineWidth = r * 1.2;
        ctx.shadowBlur = r * 3;
        for (const [a, b] of BONES) {
          const isBad = bad?.has(a) && bad.has(b);
          ctx.strokeStyle = isBad ? ERROR_COLOR : color;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.lineWidth = isBad ? r * 2 : r * 1.2;
          ctx.beginPath();
          ctx.moveTo(pts[a][0], pts[a][1]);
          ctx.lineTo(pts[b][0], pts[b][1]);
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
        pts.forEach(([x, y], i) => {
          ctx.fillStyle = bad?.has(i) ? ERROR_COLOR : TIPS.has(i) ? '#ffffff' : color;
          ctx.beginPath();
          ctx.arc(x, y, TIPS.has(i) ? r * 1.4 : r, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      // след пера руны — светящаяся линия золотом
      const trail = snap?.rune.penDown ? snap.rune.trail : [];
      if (trail.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#f2c35b';
        ctx.shadowBlur = r * 6;
        for (const [width, color] of [
          [r * 3.2, 'rgba(242,195,91,0.35)'],
          [r * 1.3, '#fff3c4'],
        ] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          trail.forEach((p, i) => (i ? ctx.lineTo(ox + p.x * dw, oy + p.y * dh) : ctx.moveTo(ox + p.x * dw, oy + p.y * dh)));
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="hand-overlay" />;
}
