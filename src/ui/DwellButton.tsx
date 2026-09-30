import { useEffect, useRef, type ReactNode } from 'react';
import { isDev } from '../dev';
import { sfx } from '../game/sfx';
import { cancelDwell, registerDwell } from './dwell';
import { useSettings } from '../store/settingsStore';

interface Props {
  onSelect: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Settings remain reachable even when gesture tracking fails. */
  allowPointer?: boolean;
  pressed?: boolean;
  /** Кнопка посреди боя: рукой — только указующим жестом без взведённого заклинания. */
  guarded?: boolean;
}

/** Menu input follows the saved control mode; dev and settings allow pointer recovery. */
export function DwellButton({ onSelect, children, className, disabled, allowPointer, pressed, guarded }: Props) {
  const { menuControl } = useSettings();
  const pointerEnabled = isDev || allowPointer || menuControl !== 'gesture';
  const ref = useRef<HTMLButtonElement>(null);
  const cb = useRef(onSelect);
  cb.current = onSelect;

  useEffect(() => {
    if (disabled || menuControl === 'pointer') return;
    const el = ref.current!;
    return registerDwell(el, {
      guarded,
      onSelect: () => {
        sfx.select();
        cb.current();
      },
    });
  }, [disabled, menuControl, guarded]);

  return (
    <button
      ref={ref}
      type="button"
      className={`dwell-btn ${pointerEnabled ? 'pointer-enabled' : ''} ${disabled ? 'dwell-disabled' : ''} ${className ?? ''}`}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={pointerEnabled && !disabled ? () => { cancelDwell(); sfx.select(); onSelect(); } : undefined}
      tabIndex={pointerEnabled ? 0 : -1}
    >
      <span className="dwell-fill" aria-hidden />
      <span className="dwell-content">{children}</span>
    </button>
  );
}
