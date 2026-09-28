import { useEffect, useRef, useState } from 'react';
import { isDev } from '../../dev';
import { Battle, type BattleEvent } from '../../game/combat';
import { LEVEL_BY_ID } from '../../game/data/levels';
import { SPELLS } from '../../game/data/spells';
import { applyBattleResult, currentLoadout } from '../../game/economy';
import { sfx } from '../../game/sfx';
import { BattleStats } from '../../game/stats';
import { gestureEngine } from '../../gestures/matcher';
import { TEMPLATES } from '../../gestures/templates';
import type { SpellId } from '../../gestures/types';
import { CameraView } from '../../render/CameraView';
import { coverBox } from '../../render/HandOverlay';
import { SpellVfx, type VfxLayout } from '../../render/SpellVFX';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { useVision } from '../../store/visionStore';
import { HintCard } from '../HintCard';

const COUNTDOWN_MS = 3000;
const END_DELAY_MS = 2200;

type Phase = 'countdown' | 'fight' | 'end';

interface Toast {
  id: number;
  text: string;
  kind: 'bad' | 'info' | 'good';
}

function Bar({ value, max, className, label }: { value: number; max: number; className: string; label?: string }) {
  return (
    <div className={`bar ${className}`}>
      <div className="bar-fill" style={{ transform: `scaleX(${Math.max(0, value) / max})` }} />
      <span className="bar-label">{label ?? `${Math.ceil(value)} / ${max}`}</span>
    </div>
  );
}

export function BattleScreen() {
  const levelId = useGame((s) => s.level);
  const finishBattle = useGame((s) => s.finishBattle);
  const go = useGame((s) => s.go);
  const level = LEVEL_BY_ID[levelId];

  const rootRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const enemyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const battleRef = useRef<Battle | null>(null);
  if (!battleRef.current) battleRef.current = new Battle(level, currentLoadout());
  const battle = battleRef.current;

  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [, setHudTick] = useState(0);

  useEffect(() => {
    const stats = new BattleStats();
    const vfx = new SpellVfx(canvasRef.current!.getContext('2d')!);
    let phaseNow: Phase = 'countdown';
    let toastId = 0;
    let layout: VfxLayout | null = null;
    let endTimer = 0;

    const toast = (text: string, kind: Toast['kind'] = 'info') => {
      const id = ++toastId;
      setToasts((t) => [...t.slice(-2), { id, text, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1600);
    };

    const offGesture = gestureEngine.on((e) => {
      if (phaseNow !== 'fight') return;
      if (e.type === 'cast') {
        if (e.gesture === 'shield' || e.gesture === 'heal') return;
        const ok = battle.playerCast(e.gesture, e.quality, e.charge, e.shard);
        if (ok && e.shard === 1) stats.success(e.gesture, e.quality);
      } else {
        stats.onGesture(e);
      }
    });

    const onBattle = (e: BattleEvent) => {
      const now = performance.now();
      if (layout) vfx.onEvent(e, layout, now);
      switch (e.type) {
        case 'cast':
          sfx.cast(e.spell);
          if (e.side === 'player' && e.spell === 'heal') stats.success('heal', useGesture.getState().snap?.quality ?? 1);
          if (e.side === 'player' && e.quality >= 0.95 && e.spell !== 'heal') toast('Идеальный жест! Максимальный урон', 'good');
          break;
        case 'telegraph':
          sfx.enemyTelegraph();
          break;
        case 'hit':
          if (e.blocked) sfx.block();
          else if (e.hpDamage > 0) sfx.hit();
          break;
        case 'shieldUp':
          if (e.side === 'player') {
            sfx.shieldUp();
            stats.success('shield', useGesture.getState().snap?.quality ?? 1);
          }
          break;
        case 'shieldBreak':
          sfx.shieldBreak();
          if (e.side === 'player') toast(`Щит сломан! Восстановится через ${battle.loadout.shield.brokenCooldownMs / 1000} с`, 'bad');
          else toast('Щит врага разбит!', 'good');
          break;
        case 'reject':
          sfx.reject();
          toast(`${TEMPLATES.find((t) => t.id === e.spell)?.icon ?? ''} ${e.reason}`, 'bad');
          break;
        case 'interrupt':
          toast(e.side === 'player' ? 'Заряд сбит ветром!' : 'Каст врага сбит!', e.side === 'player' ? 'bad' : 'good');
          break;
        case 'reflect':
          if (e.side === 'player') toast(`Щит врага отразил ${e.amount} урона`, 'bad');
          break;
        case 'enrage':
          toast(`${level.enemyName} в ярости! Вторая фаза`, 'bad');
          break;
        case 'end': {
          phaseNow = 'end';
          setPhase('end');
          const won = e.winner === 'player';
          if (won) sfx.victory();
          else sfx.defeat();
          endTimer = window.setTimeout(() => {
            const sum = stats.summary();
            const reward = applyBattleResult(level.id, won, sum.accuracy, battle.t);
            finishBattle({ level: level.id, won, durationMs: battle.t, ...sum, ...reward });
          }, END_DELAY_MS);
          break;
        }
      }
    };
    const offBattle = battle.on(onBattle);

    const start = performance.now();
    let last = start;
    let lastHud = 0;
    let raf = 0;

    const computeLayout = (): VfxLayout | null => {
      const root = rootRef.current?.getBoundingClientRect();
      const cam = camRef.current?.getBoundingClientRect();
      const enemy = enemyRef.current?.getBoundingClientRect();
      if (!root || !cam || !enemy) return null;
      const camCenter = { x: cam.left - root.left + cam.width / 2, y: cam.top - root.top + cam.height * 0.55 };
      let hand = camCenter;
      const snap = useGesture.getState().snap;
      const { videoSize } = useVision.getState();
      const h = snap?.hands[Math.max(0, snap.activeHandIdx)];
      if (h && videoSize.width) {
        const box = coverBox(cam.width, cam.height, videoSize.width, videoSize.height);
        const c = [0, 5, 9, 17].reduce((a, i) => ({ x: a.x + h.raw[i].x / 4, y: a.y + h.raw[i].y / 4 }), { x: 0, y: 0 });
        hand = {
          x: cam.left - root.left + cam.width - (box.ox + c.x * box.dw),
          y: cam.top - root.top + box.oy + c.y * box.dh,
        };
      }
      return {
        playerHand: hand,
        playerCenter: hand,
        enemy: { x: enemy.left - root.left + enemy.width / 2, y: enemy.top - root.top + enemy.height / 2 },
        enemyRadius: enemy.width / 2,
        shieldRadius: Math.min(cam.width, cam.height) * 0.3,
      };
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(50, now - last);
      last = now;

      if (phaseNow === 'countdown') {
        const left = Math.ceil((COUNTDOWN_MS - (now - start)) / 1000);
        setCountdown(left);
        if (now - start >= COUNTDOWN_MS) {
          phaseNow = 'fight';
          setPhase('fight');
        }
      }

      const snap = useGesture.getState().snap;
      const active = snap?.active ?? null;
      if (phaseNow === 'fight') {
        battle.setPlayerHolds(active === 'shield', active === 'heal');
        battle.tick(dt, active === 'fireball' || active === 'lightning');
      }

      const canvas = canvasRef.current!;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      layout = computeLayout();
      if (layout) {
        vfx.frame(battle, layout, dt, now, {
          active: phaseNow === 'fight' && active === 'fireball',
          value: snap?.charge ?? 0,
        });
      }

      if (now - lastHud > 90) {
        lastHud = now;
        setHudTick((n) => n + 1);
      }
    };
    raf = requestAnimationFrame(loop);

    const esc = (e: KeyboardEvent) => isDev && e.key === 'Escape' && go('menu');
    addEventListener('keydown', esc);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(endTimer);
      offGesture();
      offBattle();
      removeEventListener('keydown', esc);
      gestureEngine.setDevHold(null);
    };
  }, [battle, level, finishBattle, go]);

  const { player, enemy, t } = battle;
  const snap = useGesture.getState().snap;
  const active = snap?.active ?? null;
  const telegraph = battle.bot.telegraph;
  const shieldBroken = player.shield.brokenUntil > 0;

  return (
    <div ref={rootRef} className={`battle arena-${level.arena}`}>
      <div ref={camRef} className="battle-player">
        <CameraView className="battle-camera">
          <div className="hud hud-player">
            <Bar value={player.hp} max={player.maxHp} className="bar-hp" />
            <Bar value={player.mana} max={player.maxMana} className="bar-mana" />
            <Bar
              value={player.shield.durability}
              max={player.shield.max}
              className={`bar-shield ${shieldBroken ? 'bar-broken' : ''}`}
              label={
                shieldBroken
                  ? `🛡️ сломан · ${((player.shield.brokenUntil - t) / 1000).toFixed(1)} с`
                  : `🛡️ ${Math.ceil(player.shield.durability)}`
              }
            />
          </div>
          {phase === 'fight' && <HintCard />}
          <div className="spellbar">
            {TEMPLATES.map((tpl) => {
              const cd = tpl.id === 'shield' ? 0 : Math.max(0, (player.cooldowns[tpl.id as SpellId] ?? 0) - t);
              const def = tpl.id === 'shield' ? null : SPELLS[tpl.id as SpellId];
              const noMana = def && player.mana < def.mana * (battle.loadout.staff.manaMul ?? 1);
              return (
                <div
                  key={tpl.id}
                  className={`spell-slot ${active === tpl.id ? 'spell-active' : ''} ${noMana || cd > 0 ? 'spell-off' : ''}`}
                >
                  <span className="spell-icon">{tpl.icon}</span>
                  {cd > 0 && <span className="spell-cd">{(cd / 1000).toFixed(1)}</span>}
                  {def && <span className="spell-mana">{Math.round(def.mana * (battle.loadout.staff.manaMul ?? 1))}</span>}
                </div>
              );
            })}
          </div>
          {active === 'fireball' && phase === 'fight' && (
            <div className="charge-meter">
              <div className="charge-fill" style={{ transform: `scaleX(${snap?.charge ?? 0})` }} />
              <span>Заряд — толкни ладонь к камере!</span>
            </div>
          )}
        </CameraView>
      </div>

      <div className="battle-enemy">
        <div className="hud hud-enemy">
          <div className="enemy-name">
            {level.boss ? '👑 ' : ''}
            {level.enemyName} <small>· ур. {level.id}</small>
          </div>
          <Bar value={enemy.hp} max={enemy.maxHp} className="bar-hp bar-enemy" />
          {t < enemy.slowedUntil && <div className="status">❄️ замедлен</div>}
        </div>
        <div ref={enemyRef} className={`enemy-portrait ${telegraph ? 'enemy-casting' : ''}`}>
          <span>{level.enemyPortrait}</span>
        </div>
        {telegraph && (
          <div className="telegraph">
            <div
              className="telegraph-rune"
              style={{ ['--p' as string]: Math.min(1, (t - telegraph.start) / (telegraph.end - telegraph.start)) }}
            >
              {SPELLS[telegraph.spell].icon}
            </div>
            <span>
              {SPELLS[telegraph.spell].name}! {telegraph.spell === 'lightning' ? 'Щит держит только половину' : 'Подними щит — сожми кулак'}
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

      {phase === 'countdown' && (
        <div className="overlay-big">
          <div className="countdown">{countdown > 0 ? countdown : 'Бой!'}</div>
          <p>
            {level.name}: {level.enemyName}
          </p>
        </div>
      )}
      {phase === 'end' && (
        <div className="overlay-big">
          <div className={`countdown ${battle.winner === 'player' ? 'win' : 'lose'}`}>
            {battle.winner === 'player' ? 'Победа!' : 'Поражение'}
          </div>
        </div>
      )}
    </div>
  );
}
