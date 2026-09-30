import type { Battle } from '../game/combat';
import type { GestureId, SpellId } from '../gestures/types';
import { SPELLS } from '../game/data/spells';
import { tr } from '../i18n';
import { FAIL_BADGE } from './failCategories';
import { SpellIcon } from './SpellIcon';

export interface ArmedState {
  /** ready — движение сработает; warn — готово, но срочно (перегрев); blocked — движок откажет. */
  tone: 'ready' | 'warn' | 'blocked';
  text: string;
  /** Полоска: заряд огня. */
  bar?: number;
  /** Значок причины отказа (та же таксономия, что у подсказок и тостов). */
  badge?: string;
}

/**
 * Что будет, если сейчас выполнить движение взведённого жеста. Причина отказа — из движка
 * (castBlocker / holdBlocker), поэтому HUD не обещает то, что движок отклонит.
 */
export function armedState(battle: Battle, active: GestureId, charge: number, overcharge: number): ArmedState {
  if (active === 'shield' || active === 'heal') {
    const block = battle.holdBlocker(active);
    if (block) return { tone: 'blocked', text: block.reason, badge: FAIL_BADGE[block.kind].icon };
    if (active === 'heal') return { tone: 'ready', text: tr('Лечение идёт — держи ладони вместе', 'Healing — keep your palms together') };
    return { tone: 'ready', text: tr('Щит поднят · сожми в последний миг — парирование', 'Shield up · clench at the last moment to parry') };
  }
  // серия льда открыта: 2-й и 3-й осколки идут без маны и перезарядки — это не отказ
  const shards = active === 'ice' ? battle.iceShardsLeft() : 0;
  const block = battle.castBlocker(active as SpellId, shards > 0);
  if (!block && shards > 0) {
    const n = (SPELLS.ice.hits ?? 3) - shards + 1;
    return { tone: 'ready', text: tr(`Ещё кивок — осколок ${n}/3`, `Flick again — shard ${n}/3`) };
  }
  if (block) return { tone: 'blocked', text: block.reason, badge: FAIL_BADGE[block.kind].icon };
  switch (active) {
    case 'fireball':
      if (overcharge > 0) return { tone: 'warn', text: tr('Перегрев — толкай сейчас!', 'Overheating — push now!'), bar: 1 };
      return {
        tone: 'ready',
        bar: charge,
        text: charge >= 1
          ? tr('Полный заряд — толкни ладонь к камере', 'Full charge — push your palm at the camera')
          : tr(`Заряд ${Math.round(charge * 100)}% — толкни ладонь к камере`, `Charge ${Math.round(charge * 100)}% — push your palm at the camera`),
      };
    case 'ice':
      return { tone: 'ready', text: tr('Кивни кистью вниз — до 3 осколков', 'Flick your wrist down — up to 3 shards') };
    case 'lightning':
      return { tone: 'ready', text: tr('Махни рукой вниз', 'Swing your hand down') };
    default:
      return { tone: 'ready', text: tr('Махни обеими руками в одну сторону', 'Swing both hands to one side') };
  }
}

/** Слот под камерой: взведённая поза → готовность или причина отказа. Место то же, что у HintCard. */
export function ArmedStatus({ battle, active, charge, overcharge }: { battle: Battle; active: GestureId; charge: number; overcharge: number }) {
  const st = armedState(battle, active, charge, overcharge);
  return (
    <div className={`armed-status armed-${st.tone}`} role="status">
      {st.bar !== undefined && <div className="armed-fill" style={{ transform: `scaleX(${st.bar})` }} />}
      <span className="armed-text">
        <SpellIcon id={active} className="icon-inline" /> {st.badge ? `${st.badge} ` : ''}
        {st.text}
      </span>
    </div>
  );
}
