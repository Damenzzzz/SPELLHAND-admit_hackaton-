import { useVision } from '../store/visionStore';

export function FpsCounter() {
  const fps = useVision((s) => Math.round(s.fps));
  const hands = useVision((s) => s.hands.length);
  const delegate = useVision((s) => s.delegate);
  const level = fps >= 20 ? 'ok' : fps >= 12 ? 'warn' : 'bad';

  return (
    <div className={`fps-counter fps-${level}`}>
      <b>{fps}</b> FPS · рук: {hands}
      {delegate && <span className="fps-delegate"> · {delegate}</span>}
    </div>
  );
}
