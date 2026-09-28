import type { ReactNode } from 'react';
import { CameraView } from '../render/CameraView';

/** Экран меню: камера со скелетом приглушённо на фоне — видно, куда указывает палец. */
export function ScreenShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`shell ${className ?? ''}`}>
      <CameraView className="shell-camera" />
      <div className="shell-content">{children}</div>
    </div>
  );
}
