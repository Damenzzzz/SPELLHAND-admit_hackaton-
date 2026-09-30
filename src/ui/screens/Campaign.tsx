import { ASSETS } from '../../game/data/assets';
import { LEVELS } from '../../game/data/levels';
import { combineModifiers, modifiersOf, MUTATORS } from '../../game/data/modifiers';
import { SPELLS } from '../../game/data/spells';
import { levelStars, MAX_STARS, starString, totalStars } from '../../game/stars';
import { TRAIT_INFO } from '../../game/data/traits';
import type { SpellId } from '../../gestures/types';
import { useGame } from '../../store/gameStore';
import { useSave } from '../../store/saveStore';
import { AssetImg } from '../AssetImg';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { ScreenShell } from '../ScreenShell';
import { tr } from '../../i18n';

/** Кампания: 10 уровней, следующий открывается после победы; рекорды на карточках. */
export function Campaign() {
  const { go, startBattle, mutators, toggleMutator } = useGame();
  const unlocked = useSave((s) => s.unlocked);
  const records = useSave((s) => s.records);
  const bonus = combineModifiers(modifiersOf(mutators)).reward;

  return (
    <ScreenShell className="campaign">
      <CoinBadge />
      <h2 className="screen-title">
        ⚔️ {tr('Кампания', 'Campaign')} <small className="stars-total">⭐ {totalStars(records)}/{LEVELS.length * MAX_STARS}</small>
      </h2>
      <p className="muted stars-rules">
        {tr('★ победа · ★ точность жестов ≥ 80% · ★ победа с ≥ 50% HP', '★ win · ★ gesture accuracy ≥ 80% · ★ win with ≥ 50% HP')}
      </p>
      <section className="mutators" aria-label={tr('Мутаторы', 'Mutators')}>
        <span className="mutators-title">
          ⚗️ {tr('Мутаторы', 'Mutators')}{' '}
          {bonus > 0 ? (
            <b className="gold">
              {tr('монеты', 'coins')} +{Math.round(bonus * 100)}%
            </b>
          ) : (
            <small>{tr('усложни бой ради монет', 'make battles harder for more coins')}</small>
          )}
        </span>
        <div className="mutator-list">
          {MUTATORS.map((m) => {
            const on = mutators.includes(m.id);
            return (
              <DwellButton key={m.id} pressed={on} className={`mutator-chip${on ? ' mutator-on' : ''}`} onSelect={() => toggleMutator(m.id)}>
                {m.icon} {m.text} <small>+{Math.round(m.reward * 100)}%</small>
              </DwellButton>
            );
          })}
        </div>
      </section>
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
              {locked ? (
                <span className="level-portrait">❔</span>
              ) : (
                <AssetImg src={ASSETS.enemy(l.id)} fallback={l.enemyPortrait} className="level-portrait" />
              )}
              <span className="level-name">{l.boss ? `👑 ${l.enemyName}` : l.enemyName}</span>
              {!locked && l.trait && (
                <span className="level-trait" title={TRAIT_INFO[l.trait.kind].intro}>
                  {TRAIT_INFO[l.trait.kind].icon} {TRAIT_INFO[l.trait.kind].name}
                </span>
              )}
              {!locked && <span className="level-stars">{starString(levelStars(rec))}</span>}
              <small>
                {locked
                  ? tr('Победи предыдущего', 'Beat the previous one')
                  : rec
                    ? `🏆 ${Math.round(rec.bestAccuracy * 100)}% · ${(rec.bestTimeMs / 1000).toFixed(0)} ${tr('с', 's')}`
                    : `HP ${l.hp} · ${(Object.keys(l.spellWeights) as SpellId[]).map((s) => SPELLS[s].icon).join('')}`}
              </small>
            </DwellButton>
          );
        })}
      </div>
      <DwellButton onSelect={() => go('menu')}>← {tr('В меню', 'Menu')}</DwellButton>
    </ScreenShell>
  );
}
