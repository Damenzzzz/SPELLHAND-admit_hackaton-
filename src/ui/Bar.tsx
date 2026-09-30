/** Полоска HP / маны / щита в HUD боя. */
export function Bar({ value, max, className, label }: { value: number; max: number; className: string; label?: string }) {
  const ratio = Math.max(0, value) / max;
  return (
    <div className={`bar ${className}${ratio <= 0.3 ? ' bar-low' : ''}`}>
      <div className="bar-fill" style={{ transform: `scaleX(${ratio})` }} />
      <span className="bar-label">{label ?? `${Math.ceil(value)} / ${max}`}</span>
    </div>
  );
}
