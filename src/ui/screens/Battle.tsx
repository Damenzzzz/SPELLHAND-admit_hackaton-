import { useEffect, useRef, useState } from 'react';
import { isDev } from '../../dev';
import { Battle, type BattleEvent } from '../../game/combat';
import { ASSETS } from '../../game/data/assets';
import { dailyChallenge, dailyScore } from '../../game/data/daily';
import { gradeOf } from '../../game/data/grades';
import { RUNES } from '../../gestures/runes/runes';
import { GHOST_LEVEL, LEVEL_BY_ID, onlineLevel } from '../../game/data/levels';
import { COMBAT, SPELLS } from '../../game/data/spells';
import { applyBattleResult, applyOnlineResult, currentLoadout } from '../../game/economy';
import { recordSession } from '../../game/progress';
import { sfx } from '../../game/sfx';
import { BattleStats } from '../../game/stats';
import { gestureEngine } from '../../gestures/matcher';
import { TEMPLATES } from '../../gestures/templates';
import type { SpellId } from '../../gestures/types';
import { currentLink, setCurrentLink, STATE_EVERY_MS } from '../../net/session';
import { CameraView } from '../../render/CameraView';
import { coverBox } from '../../render/HandOverlay';
import { SpellVfx, type VfxLayout } from '../../render/SpellVFX';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { poseEvents, usePose } from '../../store/poseStore';
import { updateSave, useSave } from '../../store/saveStore';
import { useVision } from '../../store/visionStore';
import { AssetImg } from '../AssetImg';
import { FAIL_BADGE } from '../failCategories';
import { HintCard } from '../HintCard';
import { SpellIcon } from '../SpellIcon';

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
  const setup = useGame((s) => s.setup);
  const finishBattle = useGame((s) => s.finishBattle);
  const go = useGame((s) => s.go);
  const online = setup.kind === 'online';
  const [daily] = useState(() => dailyChallenge());
  const level =
    setup.kind === 'campaign'
      ? LEVEL_BY_ID[setup.level]
      : online
        ? onlineLevel(setup.opponentNick)
        : setup.kind === 'daily'
          ? daily.level
          : GHOST_LEVEL;

  const rootRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const enemyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const battleRef = useRef<Battle | null>(null);
  if (!battleRef.current) {
    battleRef.current = new Battle(level, currentLoadout(), Math.random, online);
    if (setup.kind === 'daily') battleRef.current.allowedSpells = daily.modifier.allowed ?? null;
  }
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
    // онлайн: общий старт по часам инициатора; иначе обычные 3 с
    const countdownMs = setup.kind === 'online' ? Math.max(500, setup.startAt - Date.now()) : COUNTDOWN_MS;
    const link = online ? currentLink() : null;
    let remoteEnded = false;
    const gestureQuality = () => useGesture.getState().snap?.quality ?? 1;
    if (link) {
      link.onCast = (c) => phaseNow === 'fight' && battle.remoteCast(c);
      link.onState = (st) => battle.applyRemoteState(st);
      link.onEnd = () => {
        remoteEnded = true;
        battle.forceEnd('player');
      };
      link.onLeave = () => {
        if (battle.over) return;
        remoteEnded = true;
        toast('Соперник покинул бой — победа засчитана', 'good');
        battle.forceEnd('player');
      };
    }

    const toast = (text: string, kind: Toast['kind'] = 'info') => {
      const id = ++toastId;
      setToasts((t) => [...t.slice(-2), { id, text, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1600);
    };

    let lastWeakest: string | null = null;
    const offGesture = gestureEngine.on((e) => {
      if (phaseNow !== 'fight') return;
      if (e.type === 'cast') {
        if (e.gesture === 'shield' || e.gesture === 'heal') return;
        lastWeakest = e.weakest && e.weakest.score < 0.9 ? e.weakest.hint : null;
        const ok = battle.playerCast(e.gesture, e.quality, e.charge, e.shard);
        if (ok && e.shard === 1) stats.success(e.gesture, e.quality);
      } else if (e.type === 'rune') {
        if (battle.playerRune(e.rune, e.score)) stats.runeSuccess();
      } else {
        stats.onGesture(e);
        if (e.type === 'overcharge') {
          battle.backfire(COMBAT.backfireDamage);
          sfx.hit();
          toast('💥 Перезаряд! Шар взорвался в руке', 'bad');
        } else battle.breakCombo();
      }
    });

    const onBattle = (e: BattleEvent) => {
      const now = performance.now();
      if (layout) vfx.onEvent(e, layout, now);
      switch (e.type) {
        case 'cast':
          sfx.cast(e.spell);
          if (link && e.side === 'player') {
            const p = e.projectile;
            link.sendCast({
              spell: e.spell,
              damage: p?.damage ?? 0,
              quality: e.quality,
              pierce: p?.pierce ?? 0,
              shieldDamage: p?.shieldDamage ?? null,
              slowFactor: p?.slow?.factor ?? null,
              slowMs: p?.slow?.ms ?? null,
              interrupt: p?.interrupt ?? false,
              travelMs: p ? p.hitT - p.spawnT : 0,
            });
          }
          if (e.side === 'player' && e.spell === 'heal') stats.success('heal', useGesture.getState().snap?.quality ?? 1);
          if (e.side === 'player' && e.grade && layout) {
            const g = gradeOf(e.quality);
            vfx.floatText(
              { x: layout.playerHand.x, y: layout.playerHand.y - 40 },
              `${g.label}${e.combo && e.combo > 1 ? ` ×${e.combo}` : ''}`,
              g.color,
            );
            if (g.id === 'weak' && lastWeakest) toast(`Слабо: ${lastWeakest.toLowerCase()}`, 'bad');
          }
          break;
        case 'telegraph':
          sfx.enemyTelegraph();
          break;
        case 'comboCast':
          sfx.victory();
          toast(`⚡ Комбо «${e.name}»! +${e.bonus} урона`, 'good');
          break;
        case 'blownAway':
          toast(`🌪️ Ветер сдул снарядов: ${e.count}`, 'good');
          break;
        case 'burn':
          if (e.on && e.side === 'player') toast('🔥 Горишь! Погаси льдом или лечением', 'bad');
          break;
        case 'runeCast':
          sfx.cast(e.rune === 'chain' ? 'lightning' : e.rune === 'prison' ? 'ice' : e.rune === 'meteor' ? 'fireball' : 'heal');
          sfx.victory();
          toast(`✍️ ${RUNES[e.rune].glyph} ${RUNES[e.rune].name}! ${RUNES[e.rune].effect}`, 'good');
          break;
        case 'frozen':
          if (e.side === 'enemy') toast(`🧊 ${level.enemyName} заморожен`, 'good');
          break;
        case 'dodge':
          sfx.cast('wind');
          break;
        case 'dodged':
          toast('🌀 Уклонение! Снаряд мимо', 'good');
          break;
        case 'meditate':
          sfx.cast('heal');
          toast(`🧘 Медитация: +${e.mana} маны`, 'good');
          break;
        case 'parry':
          sfx.block();
          sfx.cast('lightning');
          stats.shieldBlocked(1);
          break;
        case 'comboBreak':
          if (e.combo >= 3) toast(`Серия ×${e.combo} прервана`, 'info');
          break;
        case 'hit':
          if (e.blocked && e.target === 'player') stats.shieldBlocked(gestureQuality());
          if (e.blocked) sfx.block();
          else if (e.hpDamage > 0) sfx.hit();
          break;
        case 'shieldUp':
          if (e.side === 'player') {
            sfx.shieldUp();
            stats.shieldUp(battle.t);
          }
          break;
        case 'shieldDown':
          if (e.side === 'player') stats.shieldDown();
          break;
        case 'shieldBreak':
          sfx.shieldBreak();
          if (e.side === 'player') toast(`Щит сломан! Восстановится через ${battle.loadout.shield.brokenCooldownMs / 1000} с`, 'bad');
          else toast('Щит врага разбит!', 'good');
          break;
        case 'reject':
          sfx.reject();
          toast(
            `${FAIL_BADGE[e.kind].icon} ${e.name}: ${e.reason}`,
            e.kind === 'interrupted' ? 'bad' : 'info',
          );
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
          if (link && !won && !remoteEnded) link.sendDefeat();
          endTimer = window.setTimeout(() => {
            const sum = stats.summary();
            const reward =
              setup.kind === 'campaign'
                ? applyBattleResult(level.id, won, sum.accuracy, battle.t)
                : applyOnlineResult(won, sum.accuracy, level.reward, online);
            const score = setup.kind === 'daily' ? dailyScore(won, sum.accuracy, battle.t) : undefined;
            if (score !== undefined) {
              updateSave((sv) =>
                sv.dailyBest?.id === daily.id && sv.dailyBest.score >= score ? {} : { dailyBest: { id: daily.id, score } },
              );
            }
            recordSession({ mode: setup.kind, ...sum });
            // в глобальный лидерборд — фоном, без ожидания (dev-сессии и тесты не публикуем)
            if (!isDev) void import('../../net/leaderboard')
              .then(({ submitResult }) =>
                submitResult({
                  nickname: useSave.getState().nickname,
                  mode: setup.kind,
                  level: level.id,
                  won,
                  accuracy: sum.accuracy,
                  score,
                  day: setup.kind === 'daily' ? daily.id : undefined,
                }),
              )
              .catch(() => {});
            finishBattle({
              level: level.id,
              mode: setup.kind,
              opponent: level.enemyName,
              dailyScore: score,
              won,
              durationMs: battle.t,
              ...sum,
              ...reward,
            });
          }, END_DELAY_MS);
          break;
        }
      }
    };
    const offBattle = battle.on(onBattle);

    // жесты всем телом: наклон — уклонение, руки вверх — медитация
    const offPose = poseEvents.on((e) => {
      if (phaseNow !== 'fight') return;
      if (e.type === 'dodge') battle.dodge();
      if (e.type === 'armsUp') battle.meditate();
    });

    const start = performance.now();
    let last = start;
    let lastHud = 0;
    let lastState = 0;
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
        const left = Math.ceil((countdownMs - (now - start)) / 1000);
        setCountdown(left);
        if (now - start >= countdownMs) {
          phaseNow = 'fight';
          setPhase('fight');
        }
      }

      const snap = useGesture.getState().snap;
      const active = snap?.active ?? null;
      if (phaseNow === 'fight') {
        const pose = usePose.getState();
        battle.setPlayerHolds(active === 'shield', active === 'heal', pose.active && pose.state.crossed);
        battle.tick(dt, active === 'fireball' || active === 'lightning');
        stats.shieldTick(battle.t, gestureQuality());
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

      // онлайн: я авторитетен по своему HP — рассылаю состояние каждые 250 мс
      if (link && now - lastState >= STATE_EVERY_MS) {
        lastState = now;
        const p = battle.player;
        link.sendState({
          hp: p.hp,
          maxHp: p.maxHp,
          mana: p.mana,
          shieldUp: p.shield.up,
          durability: p.shield.durability,
          shieldMax: p.shield.max,
          staff: useSave.getState().equipped.staff,
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
      offPose();
      removeEventListener('keydown', esc);
      gestureEngine.setDevHold(null);
      // StrictMode в dev пересоздаёт эффект — канал закрываем только при реальном уходе с экрана
      setTimeout(() => {
        if (link && useGame.getState().screen !== 'battle') {
          link.close();
          setCurrentLink(null);
        }
      }, 0);
    };
    // setup/level/online неизменны на время жизни экрана
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle, finishBattle, go]);

  const { player, enemy, t } = battle;
  const snap = useGesture.getState().snap;
  const active = snap?.active ?? null;
  const telegraph = battle.bot.telegraph;
  const shieldBroken = player.shield.brokenUntil > 0;

  return (
    <div ref={rootRef} className={`battle arena-${level.arena}`}>
      <div ref={camRef} className="battle-player">
        <CameraView className="battle-camera" staff>
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
            {t < player.burningUntil && <div className="status status-burn">🔥 горишь — лёд или лечение</div>}
            <div className="loadout">
              {battle.loadout.staff.icon} {battle.loadout.staff.effect} · {battle.loadout.shield.icon}{' '}
              {battle.loadout.shield.name}
            </div>
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
                  <SpellIcon id={tpl.id} className="spell-icon" />
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

      <div className="battle-enemy" style={{ backgroundImage: `url(${ASSETS.arena(level.arena)})` }}>
        <div className="hud hud-enemy">
          <div className="enemy-name">
            {level.boss ? '👑 ' : ''}
            {level.enemyName} <small>· {online ? 'онлайн' : level.id ? `ур. ${level.id}` : 'бот'}</small>
          </div>
          <Bar value={enemy.hp} max={enemy.maxHp} className="bar-hp bar-enemy" />
          {t < enemy.slowedUntil && <div className="status">❄️ замедлен</div>}
          {t < enemy.burningUntil && <div className="status status-burn">🔥 горит</div>}
        </div>
        <div
          ref={enemyRef}
          className={`enemy-portrait ${telegraph ? 'enemy-casting' : ''} ${t < enemy.frozenUntil ? 'enemy-frozen' : ''}`}
        >
          <AssetImg
            src={ASSETS.enemy(level.portraitOf ?? level.id)}
            fallback={level.enemyPortrait}
            className={`enemy-img ${setup.kind === 'ghost' ? 'enemy-ghost' : ''}`}
          />
        </div>
        {telegraph && (
          <div className="telegraph">
            <div
              className="telegraph-rune"
              style={{ ['--p' as string]: Math.min(1, (t - telegraph.start) / (telegraph.end - telegraph.start)) }}
            >
              <SpellIcon id={telegraph.spell} />
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
