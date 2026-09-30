import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BattleClock } from '../../game/battleClock';
import { ASSETS } from '../../game/data/assets';
import { gradeOf } from '../../game/data/grades';
import { COMBAT, SPELLS } from '../../game/data/spells';
import { currentLoadout } from '../../game/economy';
import { sfx } from '../../game/sfx';
import { isActiveStage, PresenceWatch, TutorialRun, type PauseReason, type TutorialStage } from '../../game/tutorial';
import { gestureEngine } from '../../gestures/matcher';
import type { GestureId } from '../../gestures/types';
import { tr } from '../../i18n';
import { computeBattleLayout } from '../../render/battleLayout';
import { CameraView } from '../../render/CameraView';
import { GhostHand } from '../../render/GhostHand';
import { SpellVfx, type VfxLayout } from '../../render/SpellVFX';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { useVision } from '../../store/visionStore';
import { AssetImg } from '../AssetImg';
import { Bar } from '../Bar';
import { DwellButton } from '../DwellButton';
import { HintCard } from '../HintCard';
import { ArmedStatus } from '../ArmedStatus';
import { SpellIcon } from '../SpellIcon';

interface Toast {
  id: number;
  text: string;
  kind: 'bad' | 'info' | 'good';
}

/** Инструкция этапа: жест для призрачной руки и текст. */
const STEP: Partial<Record<TutorialStage, { n: number; gesture: GestureId; title: () => string; text: () => string }>> = {
  fireball: {
    n: 1,
    gesture: 'fireball',
    title: () => tr('Огненный шар', 'Fireball'),
    text: () => tr('Раскрой ладонь, заряди огонь и толкни руку к камере', 'Open your palm, charge the fire and push your hand toward the camera'),
  },
  shield: {
    n: 2,
    gesture: 'shield',
    title: () => tr('Щит', 'Shield'),
    text: () => tr('Сожми кулак, чтобы поднять щит', 'Make a fist to raise your shield'),
  },
  duel: {
    n: 3,
    gesture: 'fireball',
    title: () => tr('Учебная дуэль', 'Training duel'),
    text: () => tr('Атакуй огнём, а когда враг готовит удар — подними щит', 'Attack with fire, and raise your shield when the enemy winds up'),
  },
};

/**
 * Вводный учебный бой после калибровки. Обычные компоненты боя (камера, HUD, VFX, подсказки),
 * но свой сценарий: TutorialRun ведёт этапы по событиям движка и не выдаёт наград.
 */
export function Tutorial() {
  const { go, startBattle } = useGame();
  const rootRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const enemyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<TutorialRun | null>(null);

  const [stage, setStage] = useState<TutorialStage>('intro');
  const [paused, setPaused] = useState<PauseReason | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [, setHudTick] = useState(0);

  useEffect(() => {
    const run = new TutorialRun(currentLoadout());
    runRef.current = run;
    const vfx = new SpellVfx(canvasRef.current!.getContext('2d')!);
    const clock = new BattleClock(performance.now(), false, 0);
    const presence = new PresenceWatch();
    const timers = new Set<number>();
    let layout: VfxLayout | null = null;
    let vfxNow = performance.now();
    let last = vfxNow;
    let lastHud = 0;
    let toastId = 0;
    let pauseReason: PauseReason | null = null;
    let raf = 0;

    const toast = (text: string, kind: Toast['kind'] = 'info') => {
      const id = ++toastId;
      setToasts((t) => [...t.slice(-2), { id, text, kind }]);
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 2000);
      timers.add(timer);
    };

    // заряд или жест с прошлого этапа/до паузы не должен сработать сам
    const resetInput = () => gestureEngine.resetIntent();

    run.on((e) => {
      if (e.type === 'stage') {
        setStage(e.stage);
        resetInput();
        if (e.stage === 'done') sfx.victory();
        if (e.stage === 'duelLost') sfx.defeat();
      } else if (e.type === 'notice') {
        toast(e.text, e.kind);
        if (e.kind === 'good') sfx.victory();
      } else {
        const ev = e.event;
        if (layout) vfx.onEvent(ev, layout, vfxNow);
        if (ev.type === 'cast') {
          sfx.cast(ev.spell);
          if (ev.side === 'player' && ev.grade && layout) {
            const g = gradeOf(ev.quality);
            vfx.floatText({ x: layout.playerHand.x, y: layout.playerHand.y - 40 }, g.label, g.color);
          }
        } else if (ev.type === 'telegraph') sfx.enemyTelegraph();
        else if (ev.type === 'hit') {
          if (ev.blocked) sfx.block();
          else if (ev.hpDamage > 0) sfx.hit();
        } else if (ev.type === 'shieldUp' && ev.side === 'player') sfx.shieldUp();
        else if (ev.type === 'reject') {
          sfx.reject();
          toast(`${ev.name}: ${ev.reason}`, 'info');
        }
      }
    });

    const offGesture = gestureEngine.on((e) => {
      if (clock.phase !== 'fight' || !isActiveStage(run.stage)) return;
      if (e.type === 'cast') {
        if (e.gesture === 'shield' || e.gesture === 'heal') return;
        run.playerCast(e.gesture, e.quality, e.charge, e.shard);
      } else if (e.type === 'overcharge') {
        run.battle?.backfire(COMBAT.backfireDamage);
        toast(tr('💥 Перезаряд! Толкай раньше, как только посох засиял', '💥 Overcharge! Push as soon as the staff glows'), 'bad');
      }
    });

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const frameDt = Math.max(0, Math.min(50, now - last));
      last = now;
      const active = isActiveStage(run.stage);

      // рука или камера пропала — бой замирает, возвращение руки продолжает его с отсчётом
      if (active) {
        const vision = useVision.getState();
        const action = presence.update(now, {
          handVisible: (useGesture.getState().snap?.hands.length ?? 0) > 0,
          cameraOk: vision.status !== 'error',
          running: clock.phase === 'fight' || clock.phase === 'countdown',
          paused: pauseReason,
        });
        if (action === 'resume' && clock.resume(now)) {
          pauseReason = null;
          setPaused(null);
        } else if (action && action !== 'resume' && clock.pause()) {
          pauseReason = action.pause;
          resetInput();
          setPaused(pauseReason);
        }
      }

      const before = clock.phase;
      const dt = clock.advance(now);
      if (clock.phase === 'resuming') setCountdown(clock.countdown);
      if (before !== clock.phase && clock.phase === 'fight') {
        resetInput();
        setCountdown(0);
      }
      if (!clock.frozen) vfxNow += frameDt;

      const snap = useGesture.getState().snap;
      const gesture = clock.phase === 'fight' ? snap?.active ?? null : null;
      if (active && clock.phase === 'fight') {
        run.tick(dt, { shield: gesture === 'shield', charging: gesture === 'fireball' });
      }

      const canvas = canvasRef.current!;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      layout = computeBattleLayout(rootRef.current, camRef.current, enemyRef.current);
      if (layout && run.battle && !clock.frozen) {
        vfx.frame(run.battle, layout, frameDt, vfxNow, {
          active: gesture === 'fireball' && active,
          value: snap?.charge ?? 0,
        });
      }

      if (now - lastHud > 90) {
        lastHud = now;
        setHudTick((n) => n + 1);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => clearTimeout(t));
      offGesture();
      run.dispose();
      if (runRef.current === run) runRef.current = null;
      gestureEngine.setDevHold(null);
    };
  }, []);

  const run = runRef.current;
  const battle = run?.battle ?? null;
  const step = STEP[stage];
  const snap = useGesture.getState().snap;
  const fighting = isActiveStage(stage) && !paused && countdown === 0;
  const warning = run?.warning ?? null;
  const telegraph = stage === 'duel' ? battle?.bot.telegraph ?? null : null;
  const cameraError = useVision((s) => s.error);

  const skip = () => {
    runRef.current?.skip();
    go('menu');
  };

  return (
    <div ref={rootRef} className={`battle tutorial arena-forest${paused || countdown > 0 ? ' battle-paused' : ''}`}>
      <div ref={camRef} className="battle-player">
        <CameraView className="battle-camera" staff>
          {battle && (
            <div className="hud hud-player">
              <Bar value={battle.player.hp} max={battle.player.maxHp} className="bar-hp" />
              <Bar value={battle.player.mana} max={battle.player.maxMana} className="bar-mana" />
              <Bar value={battle.player.shield.durability} max={battle.player.shield.max} className="bar-shield" label={`🛡️ ${Math.ceil(battle.player.shield.durability)}`} />
            </div>
          )}
          {step && (
            <div className="tutorial-step" role="status">
              <GhostHand gesture={step.gesture} size={96} />
              <div>
                <small>
                  {tr('Шаг', 'Step')} {step.n}/3 · {step.title()}
                </small>
                <p>{step.text()}</p>
              </div>
            </div>
          )}
          {/* как в бою: взведённая поза → готовность или причина отказа движка, иначе подсказка жеста */}
          {fighting && (battle && snap?.active ? <ArmedStatus battle={battle} active={snap.active} charge={snap.charge} overcharge={snap.overcharge} /> : <HintCard />)}
        </CameraView>
      </div>

      <div className="battle-enemy" style={{ backgroundImage: `url(${ASSETS.arena('forest')})` }}>
        {battle && (
          <div className="hud hud-enemy">
            <div className="enemy-name">
              {battle.level.enemyName} <small>· {tr('обучение', 'tutorial')}</small>
            </div>
            <Bar value={battle.enemy.hp} max={battle.enemy.maxHp} className="bar-hp bar-enemy" />
          </div>
        )}
        <div ref={enemyRef} className={`enemy-portrait ${warning || telegraph ? 'enemy-casting' : ''}`}>
          <AssetImg src={ASSETS.enemy(1)} fallback={battle?.level.enemyPortrait ?? '🧙'} className="enemy-img" />
        </div>
        {battle && (warning || telegraph) && (
          <div className="telegraph tutorial-warning">
            <div
              className="telegraph-rune"
              style={{
                ['--p' as string]: warning
                  ? Math.min(1, (battle.t - warning.start) / (warning.end - warning.start))
                  : Math.min(1, (battle.t - telegraph!.start) / (telegraph!.end - telegraph!.start)),
              }}
            >
              <SpellIcon id="fireball" />
            </div>
            <span>
              {SPELLS.fireball.name}! {tr('Сожми кулак — подними щит', 'Make a fist — raise your shield')}
            </span>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="vfx-canvas" />

      <div className="toasts">
        {toasts.map((x) => (
          <div key={x.id} className={`battle-toast toast-${x.kind}`}>
            {x.text}
          </div>
        ))}
      </div>

      {isActiveStage(stage) && !paused && (
        <DwellButton className="battle-pause-trigger" guarded onSelect={skip}>
          ⏭ {tr('Пропустить', 'Skip')}
        </DwellButton>
      )}

      {stage === 'intro' && (
        <TutorialCard icon="🧙" title={tr('Наставник', 'Mentor')} text={tr('Сейчас научимся атаковать и защищаться.', 'Now let’s learn to attack and defend.')}>
          <DwellButton className="btn-primary" onSelect={() => runRef.current?.start()}>
            ▶ {tr('Начать', 'Start')}
          </DwellButton>
          <DwellButton onSelect={skip}>⏭ {tr('Пропустить', 'Skip')}</DwellButton>
        </TutorialCard>
      )}

      {paused && (
        <TutorialCard
          icon={paused === 'camera' ? '📷' : '✋'}
          title={tr('Пауза', 'Paused')}
          text={
            paused === 'camera'
              ? `${tr('Камера недоступна.', 'The camera is unavailable.')} ${cameraError ?? ''}`
              : tr('Рука пропала из кадра. Покажи ладонь камере — обучение продолжится само.', 'Your hand left the frame. Show your palm to the camera — the tutorial will resume on its own.')
          }
        >
          {paused === 'camera' && <DwellButton onSelect={() => go('calibration')}>🎯 {tr('Калибровка', 'Calibration')}</DwellButton>}
          <DwellButton onSelect={skip}>⏭ {tr('Пропустить обучение', 'Skip tutorial')}</DwellButton>
        </TutorialCard>
      )}

      {countdown > 0 && !paused && (
        <div className="overlay-big">
          <div className="countdown">{countdown}</div>
          <p>{tr('Приготовься — продолжаем', 'Get ready — resuming')}</p>
        </div>
      )}

      {stage === 'duelLost' && (
        <TutorialCard icon="🛡️" title={tr('Не беда!', 'No worries!')} text={tr('Попробуй дуэль ещё раз — обучение начинать заново не нужно.', 'Try the duel again — no need to restart the tutorial.')}>
          <DwellButton className="btn-primary" onSelect={() => runRef.current?.retryDuel()}>
            🔁 {tr('Повторить дуэль', 'Retry duel')}
          </DwellButton>
          <DwellButton onSelect={skip}>⏭ {tr('Пропустить', 'Skip')}</DwellButton>
        </TutorialCard>
      )}

      {stage === 'done' && (
        <TutorialCard icon="🏆" title={tr('Победа!', 'Victory!')} text={tr('Ты готов к первой настоящей дуэли.', 'You are ready for your first real duel.')}>
          <DwellButton className="btn-primary" onSelect={() => startBattle(1)}>
            ⚔️ {tr('Начать кампанию', 'Start campaign')}
          </DwellButton>
          <DwellButton onSelect={() => go('menu')}>🏠 {tr('В меню', 'Menu')}</DwellButton>
        </TutorialCard>
      )}
    </div>
  );
}

function TutorialCard({ icon, title, text, children }: { icon: string; title: string; text: string; children: ReactNode }) {
  return (
    <div className="battle-pause-overlay">
      <div className="battle-pause-card" role="dialog" aria-modal="true" aria-label={title}>
        <span className="battle-pause-icon" aria-hidden>
          {icon}
        </span>
        <h1>{title}</h1>
        <p>{text}</p>
        {children}
      </div>
    </div>
  );
}
