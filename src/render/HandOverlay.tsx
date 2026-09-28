import { useEffect, useRef } from 'react';
import { useVision, type TrackedHand } from '../store/visionStore';

/** Кости скелета: запястье → пальцы + поперечная линия ладони. */
const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const TIPS = new Set([4, 8, 12, 16, 20]);

const HAND_COLORS: Record<TrackedHand['handedness'], string> = {
  Left: '#5fa8ff',
  Right: '#f2c35b',
};

/**
 * Канвас поверх видео с object-fit: cover. Координаты landmarks нормированы по кадру,
 * поэтому повторяем ту же cover-математику, что и браузер для <video>.
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
      const { hands, frameTime, videoSize } = useVision.getState();

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

      const scale = Math.max(w / videoSize.width, h / videoSize.height);
      const dw = videoSize.width * scale;
      const dh = videoSize.height * scale;
      const ox = (w - dw) / 2;
      const oy = (h - dh) / 2;
      const r = Math.max(3, Math.min(w, h) / 160);

      for (const hand of hands) {
        const pts = hand.landmarks.map((p) => [ox + p.x * dw, oy + p.y * dh] as const);
        const color = HAND_COLORS[hand.handedness];

        ctx.lineCap = 'round';
        ctx.lineWidth = r * 1.2;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = r * 3;
        ctx.beginPath();
        for (const [a, b] of BONES) {
          ctx.moveTo(pts[a][0], pts[a][1]);
          ctx.lineTo(pts[b][0], pts[b][1]);
        }
        ctx.stroke();

        ctx.shadowBlur = 0;
        pts.forEach(([x, y], i) => {
          ctx.fillStyle = TIPS.has(i) ? '#ffffff' : color;
          ctx.beginPath();
          ctx.arc(x, y, TIPS.has(i) ? r * 1.4 : r, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="hand-overlay" />;
}
