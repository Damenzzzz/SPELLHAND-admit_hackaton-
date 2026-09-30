import type { ComboHint, ComboOption } from '../game/combat';
import { SPELLS } from '../game/data/spells';
import { tr } from '../i18n';

const reason = (o: ComboOption) =>
  o.status === 'cooldown'
    ? `⏳ ${(o.cooldownMs / 1000).toFixed(1)} ${tr('с', 's')}`
    : o.status === 'banned'
      ? tr('🚫 запрещено', '🚫 banned')
      : o.status === 'noTarget'
        ? tr('цель не горит', 'target not burning')
        : '';

/**
 * «Продолжи: 🔥 → ❄️ Паровой взрыв / ⚡ Плазма / 🌪️ Огненный вихрь» + убывающее окно.
 * Недоступные продолжения приглушены и подписаны причиной. Без анимаций — годится и для
 * режима «меньше эффектов».
 */
export function ComboPanel({ hint, className = '' }: { hint: ComboHint | null; className?: string }) {
  if (!hint) return null;
  return (
    <div className={`combo-panel ${className}`} role="status" aria-live="polite">
      <div className="combo-panel-head">
        {tr('Продолжи', 'Continue')}: {SPELLS[hint.first].icon} →
      </div>
      <ul>
        {hint.options.map((o) => (
          <li key={o.def.id} className={`combo-option combo-${o.status}`}>
            <span>
              {SPELLS[o.def.then].icon} {o.def.name}
            </span>
            {o.status !== 'ready' && <small>{reason(o)}</small>}
          </li>
        ))}
      </ul>
      <div className="combo-window" aria-hidden>
        <div className="combo-window-fill" style={{ transform: `scaleX(${Math.max(0, hint.leftMs / hint.windowMs)})` }} />
      </div>
    </div>
  );
}
