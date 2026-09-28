import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { video } from '../vision/handTracker';
import { HandOverlay } from './HandOverlay';

// three.js грузится отдельным чанком только там, где нужен посох
const StaffAttachment = lazy(() => import('./StaffAttachment'));

interface Props {
  className?: string;
  /** Контент поверх видео (не зеркалится). */
  children?: ReactNode;
  /** Показать 3D-посох в руке (AR). */
  staff?: boolean;
}

/** Зеркальное видео с камеры и скелет рук поверх. */
export function CameraView({ className, children, staff }: Props) {
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
        {staff && (
          <Suspense fallback={null}>
            <StaffAttachment />
          </Suspense>
        )}
      </div>
      {children}
    </div>
  );
}
