import { useEffect, useRef } from 'react';
import { remoteHand } from '../net/session';
import { BONES } from './HandOverlay';

const STALE_MS = 600;

/** Живая рука онлайн-соперника: скелет по его landmarks (зеркально, как он видит себя). */
export function OpponentHand({ size = 170 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const pts = remoteHand.pts;
      const age = performance.now() - remoteHand.at;
      if (!pts || age > STALE_MS) return;
      // вписываем руку в квадрат с запасом
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
      const span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1;
      const k = (size * 0.8) / span;
      const P = pts.map((p) => [size - (size * 0.1 + (p.x - x0) * k), size * 0.1 + (p.y - y0) * k]);
      ctx.globalAlpha = 1 - age / STALE_MS / 2;
      ctx.strokeStyle = '#ff7fd0';
      ctx.shadowColor = '#ff7fd0';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [a, b] of BONES) {
        ctx.moveTo(P[a][0], P[a][1]);
        ctx.lineTo(P[b][0], P[b][1]);
      }
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return <canvas ref={ref} className="opponent-hand" style={{ width: size, height: size }} aria-label="Рука соперника" />;
}
