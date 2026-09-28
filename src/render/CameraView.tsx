import { useEffect, useRef, type ReactNode } from 'react';
import { video } from '../vision/handTracker';
import { HandOverlay } from './HandOverlay';

interface Props {
  className?: string;
  /** Контент поверх видео (не зеркалится). */
  children?: ReactNode;
}

/** Зеркальное видео с камеры и скелет рук поверх. */
export function CameraView({ className, children }: Props) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = mirrorRef.current!;
    host.prepend(video);
    // play() может встать на паузу после переноса узла в DOM
    if (video.srcObject && video.paused) video.play().catch(() => {});
  }, []);

  return (
    <div className={`camera-view ${className ?? ''}`}>
      <div ref={mirrorRef} className="camera-mirror">
        <HandOverlay />
      </div>
      {children}
    </div>
  );
}
