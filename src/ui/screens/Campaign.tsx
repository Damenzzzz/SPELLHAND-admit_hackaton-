import { LEVELS } from '../../game/data/levels';
import { SPELLS } from '../../game/data/spells';
import type { SpellId } from '../../gestures/types';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';

/** Кампания: 10 уровней, следующий открывается после победы; рекорды на карточках. */
export function Campaign() {
  const { go, startBattle } = useGame();
  const unlocked = useSave((s) => s.unlocked);
  const records = useSave((s) => s.records);

  return (
    <ScreenShell className="campaign">
      <CoinBadge />
      <h2 className="screen-title">⚔️ Кампания</h2>
      <div className="level-grid">
        {LEVELS.map((l) => {
          const locked = l.id > unlocked;
          const rec = records[l.id];
          return (
            <DwellButton
              key={l.id}
              disabled={locked}
              className={`level-card ${l.boss ? 'level-boss' : ''} ${rec ? 'level-done' : ''}`}
              onSelect={() => startBattle(l.id)}
            >
              <span className="level-num">{locked ? '🔒' : l.id}</span>
              <span className="level-portrait">{locked ? '❔' : l.enemyPortrait}</span>
              <span className="level-name">{l.boss ? `👑 ${l.enemyName}` : l.enemyName}</span>
              <small>
                {locked
                  ? 'Победи предыдущего'
                  : rec
                    ? `🏆 ${Math.round(rec.bestAccuracy * 100)}% · ${(rec.bestTimeMs / 1000).toFixed(0)} с`
                    : `HP ${l.hp} · ${(Object.keys(l.spellWeights) as SpellId[]).map((s) => SPELLS[s].icon).join('')}`}
              </small>
            </DwellButton>
          );
        })}
      </div>
      <DwellButton onSelect={() => go('menu')}>← В меню</DwellButton>
    </ScreenShell>
  );
}
