import { useEffect, useRef, type ReactNode } from 'react';
import { isDev } from '../dev';
import { registerDwell } from './dwell';

interface Props {
  onSelect: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

/** Кнопка, которая «нажимается» наведением указательного пальца на 1.2 с. Мышь — только в ?dev=1. */
export function DwellButton({ onSelect, children, className, disabled }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const cb = useRef(onSelect);
  cb.current = onSelect;

  useEffect(() => {
    if (disabled) return;
    const el = ref.current!;
    return registerDwell(el, { onSelect: () => cb.current() });
  }, [disabled]);

  return (
    <button
      ref={ref}
      type="button"
      className={`dwell-btn ${disabled ? 'dwell-disabled' : ''} ${className ?? ''}`}
      onClick={isDev && !disabled ? onSelect : undefined}
      tabIndex={-1}
    >
      <span className="dwell-fill" aria-hidden />
      <span className="dwell-content">{children}</span>
    </button>
  );
}
