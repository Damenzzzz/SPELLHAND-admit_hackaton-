import { useEffect, useRef } from 'react';
import { synthHand } from '../gestures/synthHand';
import { TEMPLATE_BY_ID } from '../gestures/templates';
import type { GestureId } from '../gestures/types';
import { FINGER_JOINTS, type FingerId, type Vec3 } from '../vision/features';
import { ERROR_COLOR, GESTURE_COLOR } from './colors';
import { BONES } from './HandOverlay';

interface Props {
  gesture: GestureId;
  size?: number;
  /** Пальцы, которые игрок держит неправильно — рисуем красным. */
  badFingers?: FingerId[];
}

/** Поза-эталон: процедурная рука по описанию шаблона (как видит игрок в зеркале). */
function ghostHands(gesture: GestureId): Vec3[][] {
  const g = TEMPLATE_BY_ID[gesture].ghost;
  const base = { ext: g.ext, facing: g.facing, aspect: 1, together: g.fingersTogether ? 1 : 0 };
  if (g.twoHands) {
    const gap = g.twoHands === 'apart' ? 0.24 : 0.09;
    return [
      synthHand({ ...base, right: true, wrist: { x: 0.5 - gap, y: 0.86 }, palm: 0.22, roll: g.twoHands === 'together' ? 12 : 0 }),
      synthHand({ ...base, right: false, wrist: { x: 0.5 + gap, y: 0.86 }, palm: 0.22, roll: g.twoHands === 'together' ? -12 : 0 }),
    ];
  }
  return [synthHand({ ...base, right: true, wrist: { x: 0.5, y: g.raised ? 0.8 : 0.86 }, palm: 0.34 })];
}

export function GhostHand({ gesture, size = 180, badFingers = [] }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const badKey = badFingers.join(',');

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const hands = ghostHands(gesture);
    const color = GESTURE_COLOR[gesture];
    const bad = new Set<number>();
    for (const f of badKey ? (badKey.split(',') as FingerId[]) : []) FINGER_JOINTS[f].forEach((i) => bad.add(i));
    let raf = 0;

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const bob = Math.sin(time / 500) * size * 0.012;
      ctx.setTransform(-dpr, 0, 0, dpr, size * dpr, 0); // зеркало, как видео
      ctx.clearRect(0, 0, size, size);
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time / 700);
      for (const pts of hands) {
        const p = pts.map((v) => [v.x * size, v.y * size + bob] as const);
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        for (const [a, b] of BONES) {
          const isBad = bad.has(a) && bad.has(b);
          ctx.strokeStyle = isBad ? ERROR_COLOR : color;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.lineWidth = size / (isBad ? 32 : 45);
          ctx.beginPath();
          ctx.moveTo(p[a][0], p[a][1]);
          ctx.lineTo(p[b][0], p[b][1]);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        p.forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x, y, size / 90, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gesture, size, badKey]);

  return <canvas ref={ref} className="ghost-hand" style={{ width: size, height: size }} />;
}
