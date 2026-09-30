import { GhostHand } from '../render/GhostHand';
import { TEMPLATE_BY_ID } from '../gestures/templates';
import { useGesture } from '../store/gestureStore';
import { FAIL_BADGE } from './failCategories';
import { SpellIcon } from './SpellIcon';
import { tr } from '../i18n';

/**
 * Режим «ошибка» в реальном времени: конкретная подсказка + призрачная рука-шаблон
 * с красными пальцами, которые надо исправить.
 */
export function HintCard({ compact = false }: { compact?: boolean }) {
  // подписка только на ключ — перерисовка при смене подсказки, а не каждый кадр
  useGesture((s) => s.snap?.hint?.key ?? '');
  const hint = useGesture.getState().snap?.hint;
  if (!hint) return null;

  const tpl = hint.gesture ? TEMPLATE_BY_ID[hint.gesture] : null;
  const badge = FAIL_BADGE[hint.category];
  return (
    <div
      className={`hint-card hint-card-${hint.kind} ${compact ? 'hint-compact' : ''}`}
      style={{ borderColor: badge.color }}
    >
      <span className="fail-badge" style={{ background: badge.color }} title={badge.label}>
        {badge.icon}
      </span>
      {hint.kind === 'pose' && tpl && !compact && (
        <GhostHand gesture={tpl.id} size={96} badFingers={hint.fingers} />
      )}
      <div>
        {tpl && (
          <div className="hint-title">
            <SpellIcon id={tpl.id} className="icon-inline" /> {hint.kind === 'motion' ? tr(`Осечка: ${tpl.name}`, `Misfire: ${tpl.name}`) : tr(`Почти ${tpl.name}!`, `Almost ${tpl.name}!`)}
          </div>
        )}
        {hint.lines.map((l) => (
          <div key={l} className="hint-line">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
