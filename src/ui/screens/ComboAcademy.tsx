import { useEffect, useRef, useState } from 'react';
import { Battle, type BattleEvent } from '../../game/combat';
import { ASSETS } from '../../game/data/assets';
import { COMBO_BY_ID, COMBO_CONFIG, COMBOS, type ComboId } from '../../game/data/combos';
import type { LevelDef } from '../../game/data/levels';
import { SPELLS } from '../../game/data/spells';
import { currentLoadout } from '../../game/economy';
import { sfx } from '../../game/sfx';
import { gestureEngine } from '../../gestures/matcher';
import { localize, num, tr } from '../../i18n';
import { CameraView } from '../../render/CameraView';
import { GhostHand } from '../../render/GhostHand';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { AssetImg } from '../AssetImg';
import { Bar } from '../Bar';
import { ComboPanel } from '../ComboPanel';
import { DwellButton } from '../DwellButton';
import { HintCard } from '../HintCard';
import { ScreenShell } from '../ScreenShell';

/** Тренировочная цель: не атакует (бот выключен), не умирает, наград нет. */
const TRAINING_LEVEL: LevelDef = {
  id: 1,
  portraitOf: 1,
  name: 'Учебный зал',
  enemyName: 'Учебный манекен',
  enemyPortrait: '🎯',
  arena: 'forest',
  hp: 300,
  dmgMul: 0,
  spellWeights: { fireball: 1 },
  castInterval: 60000,
  telegraphMs: 1000,
  shieldChance: 0,
  shieldReact: 0,
  reward: 0,
};
localize(TRAINING_LEVEL);

const RESET_AFTER_MS = 1600;

/** Академия → «Комбинации»: рецепты из общего каталога и тренировка выбранного. */
export function ComboAcademy() {
  const [picked, setPicked] = useState<ComboId | null>(null);
  return picked ? <ComboTraining id={picked} onBack={() => setPicked(null)} /> : <RecipeList onTrain={setPicked} />;
}

function RecipeList({ onTrain }: { onTrain: (id: ComboId) => void }) {
  const openAcademy = useGame((s) => s.openAcademy);
  return (
    <ScreenShell className="combo-academy">
      <h2 className="screen-title">⚡ {tr('Комбинации', 'Combos')}</h2>
      <p className="menu-sub">
        {tr(
          `Второе заклинание в течение ${num(COMBO_CONFIG.windowMs / 1000, 1)} с после первого усиливает атаку. Порядок важен, у каждой комбинации своя перезарядка.`,
          `Cast the second spell within ${num(COMBO_CONFIG.windowMs / 1000, 1)} s of the first to empower it. Order matters; each combo has its own cooldown.`,
        )}
      </p>
      <div className="combo-grid">
        {COMBOS.map((c) => (
          <section key={c.id} className="card combo-recipe">
            <div className="combo-seq" aria-label={`${SPELLS[c.first].name} → ${SPELLS[c.then].name}`}>
              {SPELLS[c.first].icon} <span>→</span> {SPELLS[c.then].icon}
            </div>
            <h3>{c.name}</h3>
            <p>{c.effect}</p>
            {c.condition && <p className="muted">⚠ {c.condition}</p>}
            <small className="muted">
              {SPELLS[c.first].name} → {SPELLS[c.then].name} · {tr('перезарядка', 'cooldown')} {num(c.cooldownMs / 1000)} {tr('с', 's')}
            </small>
            <DwellButton className="btn-primary" onSelect={() => onTrain(c.id)}>
              🎯 {tr('Тренировать', 'Practice')}
            </DwellButton>
          </section>
        ))}
      </div>
      <DwellButton onSelect={() => openAcademy(null)}>← {tr('В академию', 'Academy')}</DwellButton>
    </ScreenShell>
  );
}

function ComboTraining({ id, onBack }: { id: ComboId; onBack: () => void }) {
  const def = COMBO_BY_ID[id];
  const battleRef = useRef<Battle | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    // новая попытка — новый бой: состояние цели и перезарядки сброшены
    const b = new Battle(TRAINING_LEVEL, currentLoadout(), Math.random);
    b.botEnabled = false;
    battleRef.current = b;
    gestureEngine.resetIntent();
    setMessage(null); // новая попытка — чистый лист (счётчик успехов остаётся)
    let resetTimer = 0;
    let done = false;

    const succeed = () => {
      if (done) return;
      done = true;
      sfx.victory();
      setSuccesses((n) => n + 1);
      setMessage({ text: `✓ ${def.name}: ${def.effect}`, good: true });
      resetTimer = window.setTimeout(() => setAttempt((n) => n + 1), RESET_AFTER_MS);
    };
    const offBattle = b.on((e: BattleEvent) => {
      if (e.type === 'cast') sfx.cast(e.spell);
      else if (e.type === 'reject') {
        sfx.reject();
        setMessage({ text: `${e.name}: ${e.reason}`, good: false });
      } else if (e.type === 'comboCast' && e.id === id && !e.conditional) succeed();
      else if (e.type === 'comboEffect' && e.id === id && e.by === 'player') succeed();
      else if (e.type === 'comboFizzle' && e.id === id && e.by === 'player') {
        setMessage({
          text:
            e.reason === 'blocked'
              ? tr('Не сработало: лёд попал в щит', 'Failed: the ice hit a shield')
              : tr('Не сработало: цель уже не горела — лёд должен долететь, пока горит', 'Failed: the target was not burning — the ice must land while it burns'),
          good: false,
        });
      }
    });
    const offGesture = gestureEngine.on((e) => {
      if (e.type === 'cast' && e.gesture !== 'shield' && e.gesture !== 'heal') b.playerCast(e.gesture, e.quality, e.charge, e.shard);
      else if (e.type === 'overcharge') setMessage({ text: tr('Перезаряд — толкай раньше', 'Overcharge — push sooner'), good: false });
    });

    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.max(0, Math.min(50, now - last));
      last = now;
      const active = useGesture.getState().snap?.active ?? null;
      b.setPlayerHolds(active === 'shield', false);
      b.tick(dt, active === 'fireball');
      b.enemy.hp = Math.max(b.enemy.hp, b.enemy.maxHp / 3); // манекен не падает
      if (now - lastHud > 90) {
        lastHud = now;
        setTick((n) => n + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resetTimer);
      offBattle();
      offGesture();
      gestureEngine.setDevHold(null);
    };
  }, [id, def, attempt]);

  const b = battleRef.current;
  const hint = b?.comboHint() ?? null;
  // пара начата — ведём ко второму заклинанию, иначе — к первому
  const started = hint?.first === def.first;
  const t = b?.t ?? 0;

  return (
    <div className="split-screen">
      <CameraView className="split-camera" staff>
        <HintCard compact />
        <ComboPanel hint={hint} className="combo-panel-training" />
      </CameraView>
      <aside className="side-panel academy-panel">
        <h2 className="screen-title title-with-icon">
          {SPELLS[def.first].icon} → {SPELLS[def.then].icon} {def.name}
        </h2>
        <p className="pose-text">
          {tr(
            `1) ${SPELLS[def.first].name}, 2) за ${num(COMBO_CONFIG.windowMs / 1000, 1)} с — ${SPELLS[def.then].name}. ${def.effect}.`,
            `1) ${SPELLS[def.first].name}, 2) within ${num(COMBO_CONFIG.windowMs / 1000, 1)} s — ${SPELLS[def.then].name}. ${def.effect}.`,
          )}
        </p>
        {def.condition && <p className="muted">⚠ {def.condition}</p>}
        <GhostHand gesture={started ? def.then : def.first} size={120} />
        <p className="muted">
          {started ? tr('Теперь', 'Now') : tr('Начни с', 'Start with')}: {SPELLS[started ? def.then : def.first].icon}{' '}
          {SPELLS[started ? def.then : def.first].name}
        </p>
        {b && (
          <div className="combo-target">
            <AssetImg src={ASSETS.enemy(1)} fallback="🎯" className={`combo-target-img ${t < b.enemy.stunnedUntil ? 'enemy-stunned' : ''}`} />
            <div>
              <b>{b.level.enemyName}</b>
              <Bar value={b.enemy.hp} max={b.enemy.maxHp} className="bar-hp bar-enemy" />
              <small>
                {t < b.enemy.burningUntil ? tr('🔥 горит', '🔥 burning') : tr('не горит', 'not burning')}
                {t < b.enemy.stunnedUntil ? ` · 💫 ${tr('оглушён', 'stunned')}` : ''}
              </small>
            </div>
          </div>
        )}
        {b && <Bar value={b.player.mana} max={b.player.maxMana} className="bar-mana" />}
        {message && <p className={message.good ? 'found' : 'calibration-hint hint-fail'}>{message.text}</p>}
        <p className="muted">
          {tr('Получилось', 'Succeeded')}: {successes}
        </p>
        <div className="panel-buttons">
          <DwellButton onSelect={onBack}>← {tr('К рецептам', 'Recipes')}</DwellButton>
          <DwellButton
            onSelect={() => {
              setMessage(null);
              setAttempt((n) => n + 1);
            }}
          >
            ↺ {tr('Сбросить цель', 'Reset target')}
          </DwellButton>
        </div>
      </aside>
    </div>
  );
}
