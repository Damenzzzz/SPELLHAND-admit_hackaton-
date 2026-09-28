import { GhostHand } from '../render/GhostHand';
import { TEMPLATE_BY_ID } from '../gestures/templates';
import { useGesture } from '../store/gestureStore';

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
  return (
    <div className={`hint-card hint-card-${hint.kind} ${compact ? 'hint-compact' : ''}`}>
      {hint.kind === 'pose' && tpl && !compact && (
        <GhostHand gesture={tpl.id} size={96} badFingers={hint.fingers} />
      )}
      <div>
        {tpl && (
          <div className="hint-title">
            {tpl.icon} {hint.kind === 'motion' ? `Осечка: ${tpl.name}` : `Почти ${tpl.name}!`}
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
