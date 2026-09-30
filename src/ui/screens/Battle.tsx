import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isDev } from '../../dev';
import { BattleClock, BATTLE_COUNTDOWN_MS, type BattlePhase } from '../../game/battleClock';
import { Battle, type BattleEvent } from '../../game/combat';
import { ASSETS } from '../../game/data/assets';
import { dailyChallenge, dailyScore } from '../../game/data/daily';
import { gradeOf } from '../../game/data/grades';
import { RUNES } from '../../gestures/runes/runes';
import { GHOST_LEVEL, LEVEL_BY_ID, onlineLevel } from '../../game/data/levels';
import { combineModifiers, modifiersOf } from '../../game/data/modifiers';
import { COMBAT, SPELLS } from '../../game/data/spells';
import { SURVIVAL, survivalLevel } from '../../game/data/survival';
import { applyBattleResult, applyDailyResult, applyOnlineResult, applySurvivalResult, currentLoadout } from '../../game/economy';
import { recordSession } from '../../game/progress';
import { sfx } from '../../game/sfx';
import { BattleStats } from '../../game/stats';
import { gestureEngine } from '../../gestures/matcher';
import { TEMPLATES } from '../../gestures/templates';
import type { GestureId, SpellId } from '../../gestures/types';
import { currentLink, HAND_EVERY_MS, remoteHand, setCurrentLink, STATE_EVERY_MS } from '../../net/session';
import { OpponentHand } from '../../render/OpponentHand';
import { CameraView } from '../../render/CameraView';
import { computeBattleLayout } from '../../render/battleLayout';
import { SpellVfx, type VfxLayout } from '../../render/SpellVFX';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { poseEvents, usePose } from '../../store/poseStore';
import { EMPTY_FEATS, updateSave, useSave } from '../../store/saveStore';
import { AssetImg } from '../AssetImg';
import { Bar } from '../Bar';
import { DwellButton } from '../DwellButton';
import { FAIL_BADGE } from '../failCategories';
import { HintCard } from '../HintCard';
import { SpellIcon } from '../SpellIcon';
import { ArmedStatus } from '../ArmedStatus';
import { canUseIce, telegraphAdvice } from '../battleAdvice';
import { ToastQueue, type ToastItem } from '../toastQueue';
import { ComboPanel } from '../ComboPanel';
import { COMBO_BY_ID } from '../../game/data/combos';
import { TraitStatus, traitState } from '../TraitStatus';
import { TRAIT_INFO } from '../../game/data/traits';
import { tr } from '../../i18n';

const END_DELAY_MS = 2200;

type Toast = ToastItem;

export function BattleScreen() {
  const setup = useGame((s) => s.setup);
  const finishBattle = useGame((s) => s.finishBattle);
  const go = useGame((s) => s.go);
  const online = setup.kind === 'online';
  const [daily] = useState(() => dailyChallenge());
  // мутаторы кампании и модификатор дня (уровень дня уже изменён в dailyChallenge)
  const [mods] = useState(() =>
    combineModifiers(modifiersOf(setup.kind === 'campaign' ? setup.mutators : setup.kind === 'daily' ? [daily.modifier.id] : [])),
  );
  const [level] = useState(() =>
    setup.kind === 'campaign'
      ? mods.apply(LEVEL_BY_ID[setup.level])
      : online
        ? onlineLevel(setup.opponentNick)
        : setup.kind === 'daily'
          ? daily.level
          : setup.kind === 'survival'
            ? survivalLevel(setup.wave)
            : GHOST_LEVEL,
  );
  const survivalWave = setup.kind === 'survival' ? setup.wave : 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const enemyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pauseDialogRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<{ pause: () => void; resume: () => void } | null>(null);
  const battleRef = useRef<Battle | null>(null);
  if (!battleRef.current) {
    battleRef.current = new Battle(level, currentLoadout(), Math.random, online);
    battleRef.current.applyModifiers(mods);
    const run = useGame.getState().survival;
    if (setup.kind === 'survival' && run) battleRef.current.player.hp = Math.min(battleRef.current.player.maxHp, run.hp);
  }
  const battle = battleRef.current;

  const [phase, setPhase] = useState<BattlePhase>('countdown');
  const [countdown, setCountdown] = useState(3);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [remoteForming, setRemoteForming] = useState<GestureId | null>(null);
  const [, setHudTick] = useState(0);

  useEffect(() => {
    if (phase === 'paused') pauseDialogRef.current?.querySelector('button')?.focus();
  }, [phase]);

  useEffect(() => {
    // выживание: статистика жестов копится за весь забег
    const run = setup.kind === 'survival' ? useGame.getState().survival : null;
    const stats = run?.stats ?? new BattleStats();
    // приёмы для достижений — пишем в сохранение одним изменением в конце боя
    const feats = { combos: 0, parries: 0, runes: new Set<string>(), shieldUsed: false };
    const vfx = new SpellVfx(canvasRef.current!.getContext('2d')!);
    let layout: VfxLayout | null = null;
    let endTimer = 0;
    // онлайн: общий старт по часам инициатора; иначе обычные 3 с
    const countdownMs = setup.kind === 'online' ? Math.max(500, setup.startAt - Date.now()) : BATTLE_COUNTDOWN_MS;
    const start = performance.now();
    const clock = new BattleClock(start, online, countdownMs);
    let vfxNow = start;
    const resetInput = () => {
      gestureEngine.resetIntent();
      useGesture.setState(({ snap }) => ({
        snap: snap ? {
          ...snap, active: null, activeSince: 0, quality: 0, charge: 0, overcharge: 0,
          rune: { penDown: false, trail: [] }, hint: null,
        } : null,
      }));
    };
    const pause = () => {
      if (!clock.pause()) return;
      resetInput();
      setPhase(clock.phase);
    };
    const resume = () => {
      if (document.hidden || !clock.resume(performance.now())) return;
      setCountdown(3);
      setPhase(clock.phase);
    };
    controlsRef.current = { pause, resume };
    const link = online ? currentLink() : null;
    let remoteEnded = false;
    const gestureQuality = () => useGesture.getState().snap?.quality ?? 1;
    if (link) {
      link.onCast = (c) => clock.phase === 'fight' && battle.remoteCast(c);
      link.onState = (st) => battle.applyRemoteState(st);
      link.onEnd = () => {
        remoteEnded = true;
        battle.forceEnd('player');
      };
      link.onForming = (g) => setRemoteForming(g);
      link.onFx = (f) => battle.remoteComboResult(f.cid, f.ok);
      link.onHand = (lm) => {
        remoteHand.pts = lm ? Array.from({ length: lm.length / 2 }, (_, i) => ({ x: lm[i * 2] / 1e4, y: lm[i * 2 + 1] / 1e4 })) : null;
        remoteHand.at = performance.now();
      };
      link.onLeave = () => {
        if (battle.over) return;
        remoteEnded = true;
        toast(tr('Соперник покинул бой — победа засчитана', 'Opponent left — victory awarded'), 'good');
        battle.forceEnd('player');
      };
    }

    // повторы с тем же ключом сливаются; время жизни — по часам кадра (без setTimeout)
    const toastQueue = new ToastQueue();
    const toast = (text: string, kind: Toast['kind'] = 'info', key?: string) => {
      toastQueue.push(performance.now(), text, kind, key);
      setToasts([...toastQueue.items]);
    };
    /** Чем тушить горение: лёд — только если не запрещён модификатором. */
    const burnAdvice = () => (canUseIce(battle) ? tr('льдом или лечением', 'with ice or healing') : tr('лечением', 'with healing'));

    // особые механики: подсказка только при первом появлении в бою, дальше — панель у противника
    const seenTraits = new Set<string>();
    const once = (key: string, text: string, kind: Toast['kind']) => {
      if (seenTraits.has(key)) return;
      seenTraits.add(key);
      toast(text, kind);
    };

    let lastWeakest: string | null = null;
    const offGesture = gestureEngine.on((e) => {
      if (clock.phase !== 'fight') return;
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
          toast(tr('💥 Перезаряд! Шар взорвался в руке', '💥 Overcharge! The ball exploded in your hand'), 'bad', 'overcharge');
        } else battle.breakCombo();
      }
    });

    const onBattle = (e: BattleEvent) => {
      if (layout) vfx.onEvent(e, layout, vfxNow);
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
              cid: p?.netId,
              burn: p?.burn ?? false,
              combo: p?.combo ?? null,
              steam: p?.steam ?? null,
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
            // каст прошёл, но жест неточный — совет, а не ошибка (урон ниже)
            if (g.id === 'weak' && lastWeakest) toast(`${tr('Слабый жест', 'Weak gesture')}: ${lastWeakest.toLowerCase()}`, 'info', 'weak');
          }
          break;
        case 'telegraph':
          sfx.enemyTelegraph();
          break;
        case 'comboCast': {
          // условный «Паровой взрыв» объявим только при фактическом срабатывании (comboEffect)
          if (e.conditional) break;
          feats.combos++;
          sfx.victory();
          toast(`⚡ ${e.name}! ${COMBO_BY_ID[e.id].effect}`, 'good');
          if (layout) vfx.floatText({ x: layout.playerHand.x, y: layout.playerHand.y - 70 }, e.name.toUpperCase(), '#f2c35b');
          break;
        }
        case 'comboEffect':
          if (e.by === 'player') {
            feats.combos++;
            sfx.victory();
            toast(`💨 ${COMBO_BY_ID[e.id].name}! ${COMBO_BY_ID[e.id].effect}`, 'good');
            if (layout) vfx.floatText(layout.enemy, COMBO_BY_ID[e.id].name.toUpperCase(), '#f2c35b');
          } else {
            sfx.hit();
            toast(tr(`💨 ${COMBO_BY_ID[e.id].name} соперника — ты оглушён`, `💨 Opponent’s ${COMBO_BY_ID[e.id].name} — you are stunned`), 'bad');
            // PvP: я авторитетен по своему HP — сообщаю отправителю, что эффект сработал
            if (link && e.netId !== undefined) link.sendFx({ cid: e.netId, ok: true });
          }
          break;
        case 'comboFizzle':
          if (e.by === 'player') {
            const why =
              e.reason === 'blocked'
                ? tr('лёд попал в щит', 'the ice hit a shield')
                : e.reason === 'dodged'
                  ? tr('промах', 'missed')
                  : tr('цель уже не горит', 'the target is no longer burning');
            toast(tr(`${COMBO_BY_ID[e.id].name} не сработал: ${why}`, `${COMBO_BY_ID[e.id].name} failed: ${why}`), 'info', 'fizzle');
          } else if (link && e.netId !== undefined) link.sendFx({ cid: e.netId, ok: false });
          break;
        case 'blownAway':
          toast(tr(`🌪️ Ветер сдул снарядов: ${e.count}`, `🌪️ Wind blew away projectiles: ${e.count}`), 'good', 'blown');
          break;
        case 'burn':
          if (e.on && e.side === 'player') toast(tr(`🔥 Горишь! Погаси ${burnAdvice()}`, `🔥 You are burning! Put it out ${burnAdvice()}`), 'bad', 'burn');
          break;
        case 'runeCast':
          feats.runes.add(e.rune);
          sfx.cast(e.rune === 'chain' ? 'lightning' : e.rune === 'prison' ? 'ice' : e.rune === 'meteor' ? 'fireball' : 'heal');
          sfx.victory();
          toast(`✍️ ${RUNES[e.rune].glyph} ${RUNES[e.rune].name}! ${RUNES[e.rune].effect}`, 'good');
          break;
        case 'frozen':
          if (e.side === 'enemy') toast(tr(`🧊 ${level.enemyName} заморожен`, `🧊 ${level.enemyName} is frozen`), 'good');
          break;
        case 'dodge':
          sfx.cast('wind');
          break;
        case 'enemyDodged':
          toast(tr(`${level.enemyName} уклонился — промах`, `${level.enemyName} dodged — miss`), 'info', 'enemyDodged');
          break;
        case 'dodged':
          toast(tr('🌀 Уклонение! Снаряд мимо', '🌀 Dodge! The projectile missed'), 'good');
          break;
        case 'meditate':
          sfx.cast('heal');
          toast(tr(`🧘 Медитация: +${e.mana} маны`, `🧘 Meditation: +${e.mana} mana`), 'good');
          break;
        case 'parry':
          if (e.side === 'player') feats.parries++;
          sfx.block();
          sfx.cast('lightning');
          stats.shieldBlocked(1);
          break;
        case 'comboBreak':
          if (e.combo >= 3) toast(tr(`Серия ×${e.combo} прервана`, `Streak ×${e.combo} broken`), 'info', 'comboBreak');
          break;
        case 'hit':
          if (e.blocked && e.target === 'player') stats.shieldBlocked(gestureQuality());
          if (e.blocked) sfx.block();
          else if (e.hpDamage > 0) sfx.hit();
          break;
        case 'shieldUp':
          if (e.side === 'player') {
            feats.shieldUsed = true;
            sfx.shieldUp();
            stats.shieldUp(battle.t);
          }
          break;
        case 'shieldDown':
          if (e.side === 'player') stats.shieldDown();
          break;
        case 'shieldBreak':
          sfx.shieldBreak();
          if (e.side === 'player') {
            const s = battle.loadout.shield.brokenCooldownMs / 1000;
            toast(tr(`Щит сломан! Восстановится через ${s} с`, `Shield broken! Restores in ${s} s`), 'bad');
          }
          else toast(tr('Щит врага разбит!', 'Enemy shield shattered!'), 'good');
          break;
        case 'reject':
          // жест распознан, но движок отказал: причина из движка, повторы одной причины сливаются
          sfx.reject();
          toast(
            `${FAIL_BADGE[e.kind].icon} ${e.name}: ${e.reason}`,
            e.kind === 'interrupted' || e.kind === 'stunned' ? 'bad' : 'info',
            `reject:${e.spell ?? e.name}:${e.kind}`,
          );
          break;
        case 'interrupt':
          if (e.side === 'player') toast(`${FAIL_BADGE.interrupted.icon} ${tr('Заряд сбит ветром!', 'Charge knocked out by wind!')}`, 'bad', 'reject:fireball:interrupted');
          else toast(tr('Каст врага сбит!', 'Enemy cast interrupted!'), 'good', 'enemyInterrupted');
          break;
        case 'reflect':
          if (e.side === 'player') toast(tr(`Щит врага отразил ${e.amount} урона`, `Enemy shield reflected ${e.amount} damage`), 'bad');
          break;
        case 'enrage':
          toast(tr(`${level.enemyName} в ярости! Вторая фаза`, `${level.enemyName} is enraged! Phase two`), 'bad');
          break;
        case 'channelStart':
          sfx.enemyTelegraph();
          once('channel', tr('🌀 Он готовит сильную атаку — сбей её ветром!', '🌀 He is preparing a strong attack — knock it out with wind!'), 'bad');
          break;
        case 'channelBroken':
          sfx.shieldBreak();
          if (layout) vfx.floatText(layout.enemy, tr('СОРВАНО!', 'BROKEN!'), '#b6f5d8');
          once('channelBroken', tr('💫 Подготовка сорвана — он оглушён!', '💫 Preparation broken — he is stunned!'), 'good');
          break;
        case 'armorBreak':
          sfx.shieldBreak();
          once('armor', tr('🔥 Броня растаяла — атакуй!', '🔥 Armor melted — attack!'), 'good');
          break;
        case 'armorRestored':
          sfx.block();
          break;
        case 'duelWindup':
          sfx.enemyTelegraph();
          once('duel', tr('⚔️ Выпад! Сожми кулак в последний миг — парируй', '⚔️ Lunge! Make a fist at the last moment — parry'), 'bad');
          break;
        case 'exposed':
          if (layout) vfx.floatText(layout.enemy, tr('ОТКРЫТ!', 'EXPOSED!'), '#f2c35b');
          once('exposed', tr('🎯 Противник открыт!', '🎯 Opponent exposed!'), 'good');
          break;
        case 'end': {
          clock.end();
          setPhase('end');
          const won = e.winner === 'player';
          if (won) sfx.victory();
          else sfx.defeat();
          if (link && !won && !remoteEnded) link.sendDefeat();
          const hpLeft = battle.player.hp / battle.player.maxHp;
          const saveFeats = () =>
            updateSave((sv) => {
              const f = { ...EMPTY_FEATS, ...sv.feats };
              const campaignWin = won && setup.kind === 'campaign';
              return {
                feats: {
                  combos: f.combos + feats.combos,
                  parries: f.parries + feats.parries,
                  runes: [...new Set([...f.runes, ...feats.runes])],
                  noShieldWins: f.noShieldWins + (campaignWin && !feats.shieldUsed ? 1 : 0),
                  maxMutatorsWin: campaignWin ? Math.max(f.maxMutatorsWin, setup.mutators.length) : f.maxMutatorsWin,
                  dailyDays:
                    setup.kind === 'daily' && !f.dailyDays.includes(daily.id) ? [...f.dailyDays, daily.id].slice(-60) : f.dailyDays,
                },
              };
            });
          if (run && won) {
            // волна пройдена — следующая начнётся с перенесённым HP
            toast(tr(`🗼 Волна ${run.wave} пройдена! +${SURVIVAL.healBetween} HP`, `🗼 Wave ${run.wave} cleared! +${SURVIVAL.healBetween} HP`), 'good');
            endTimer = window.setTimeout(() => {
              saveFeats();
              useGame.getState().nextWave(Math.min(battle.player.maxHp, battle.player.hp + SURVIVAL.healBetween), battle.t);
            }, END_DELAY_MS);
            break;
          }
          endTimer = window.setTimeout(() => {
            saveFeats();
            const sum = stats.summary();
            const wavesCleared = run ? run.wave - 1 : undefined;
            const reward =
              setup.kind === 'campaign'
                ? applyBattleResult(level.id, won, sum.accuracy, battle.t, hpLeft, mods.reward)
                : run
                  ? applySurvivalResult(wavesCleared!, sum.accuracy)
                  : setup.kind === 'daily'
                    ? applyDailyResult(daily.id, won, sum.accuracy, level.reward)
                    : applyOnlineResult(won, sum.accuracy, level.reward, online);
            const score = setup.kind === 'daily' ? dailyScore(won, sum.accuracy, battle.t) : undefined;
            if (score !== undefined) {
              updateSave((sv) =>
                sv.dailyBest?.id === daily.id && sv.dailyBest.score >= score ? {} : { dailyBest: { id: daily.id, score } },
              );
            }
            recordSession({ mode: setup.kind, ...sum });
            // в глобальный лидерборд — фоном, без ожидания (dev-сессии, тесты и выживание не публикуем)
            if (!isDev && setup.kind !== 'survival') void import('../../net/leaderboard')
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
              level: run ? run.wave : level.id,
              mode: setup.kind,
              opponent: level.enemyName,
              dailyScore: score,
              wavesCleared,
              mutators: setup.kind === 'campaign' ? setup.mutators : undefined,
              hpLeft,
              won,
              durationMs: (run?.durationMs ?? 0) + battle.t,
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
      if (clock.phase !== 'fight') return;
      if (e.type === 'dodge') battle.dodge();
      if (e.type === 'armsUp') battle.meditate();
    });

    let last = start;
    let lastHud = 0;
    let lastState = 0;
    let lastForming: GestureId | null = null;
    let lastHand = 0;
    let raf = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const frameDt = Math.max(0, Math.min(50, now - last));
      last = now;
      const previousPhase = clock.phase;
      const dt = clock.advance(now);
      if (clock.phase === 'countdown' || clock.phase === 'resuming') setCountdown(clock.countdown);
      if (clock.phase !== previousPhase) {
        // Жесты меню и заряд, набранный во время отсчёта, не переносятся в бой — и в онлайне тоже:
        // иначе ладонь, поднятая на отсчёте, стартует с полным зарядом (или перезарядом).
        if (clock.phase === 'fight') resetInput();
        setPhase(clock.phase);
      }
      if (!clock.frozen) vfxNow += frameDt;

      const snap = useGesture.getState().snap;
      const active = snap?.active ?? null;
      if (clock.phase === 'fight' && dt > 0) {
        // PvP: сообщаем, какой жест взводим — соперник видит «телеграф» (на этом строятся финты)
        if (link && active !== lastForming) {
          lastForming = active;
          link.sendForming(active);
        }
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
      layout = computeBattleLayout(rootRef.current, camRef.current, enemyRef.current);
      if (layout && !clock.frozen) {
        vfx.frame(battle, layout, frameDt, vfxNow, {
          active: clock.phase === 'fight' && active === 'fireball',
          value: snap?.charge ?? 0,
        });
      }

      // онлайн: скелет моей руки сопернику (вместо видео)
      if (link && now - lastHand >= HAND_EVERY_MS) {
        lastHand = now;
        const h = snap?.hands[Math.max(0, snap.activeHandIdx)];
        link.sendHand(h ? h.raw.map((p) => ({ x: p.x, y: p.y })) : null);
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
          burning: p.burningUntil > battle.t,
        });
      }

      if (now - lastHud > 90) {
        lastHud = now;
        if (toastQueue.prune(now)) setToasts([...toastQueue.items]);
        setHudTick((n) => n + 1);
      }
    };
    raf = requestAnimationFrame(loop);

    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return;
      if (online) {
        if (isDev) go('menu');
        return;
      }
      e.preventDefault();
      if (clock.phase === 'paused') resume();
      else pause();
    };
    const visibility = () => { if (document.hidden) pause(); };
    addEventListener('keydown', esc);
    document.addEventListener('visibilitychange', visibility);
    visibility();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(endTimer);
      offGesture();
      offBattle();
      offPose();
      removeEventListener('keydown', esc);
      document.removeEventListener('visibilitychange', visibility);
      controlsRef.current = null;
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
  const active = phase === 'fight' ? snap?.active ?? null : null;
  const telegraph = battle.bot.telegraph;
  const shieldBroken = player.shield.brokenUntil > 0;

  return (
    <div ref={rootRef} className={`battle arena-${level.arena}${phase === 'paused' || phase === 'resuming' ? ' battle-paused' : ''}`}>
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
                  ? `🛡️ ${tr('сломан', 'broken')} · ${((player.shield.brokenUntil - t) / 1000).toFixed(1)} ${tr('с', 's')}`
                  : `🛡️ ${Math.ceil(player.shield.durability)}`
              }
            />
            {t < player.burningUntil && (
              <div className="status status-burn">
                🔥 {canUseIce(battle) ? tr('горишь — лёд или лечение', 'burning — ice or healing') : tr('горишь — лечение', 'burning — heal')}
              </div>
            )}
            {t < player.stunnedUntil && <div className="status">💫 {tr('оглушён', 'stunned')}</div>}
            <div className="loadout">
              {battle.loadout.staff.icon} {battle.loadout.staff.effect} · {battle.loadout.shield.icon}{' '}
              {battle.loadout.shield.name}
            </div>
            {setup.kind === 'campaign' && setup.mutators.length > 0 && (
              <div className="loadout">
                ⚗️ {modifiersOf(setup.mutators).map((m) => m.icon).join(' ')} · {tr('монеты', 'coins')} +{Math.round(mods.reward * 100)}%
              </div>
            )}
          </div>
          {/* один слот под камерой: взведённая поза → готовность/причина отказа, иначе подсказка жеста */}
          {phase === 'fight' && (active ? <ArmedStatus battle={battle} active={active} charge={snap?.charge ?? 0} overcharge={snap?.overcharge ?? 0} /> : <HintCard />)}
          {phase === 'fight' && <ComboPanel hint={battle.comboHint()} />}
          <div className="spellbar">
            {TEMPLATES.map((tpl) => {
              const cd = tpl.id === 'shield' ? 0 : Math.max(0, (player.cooldowns[tpl.id as SpellId] ?? 0) - t);
              const def = tpl.id === 'shield' ? null : SPELLS[tpl.id as SpellId];
              const noMana = def && player.mana < def.mana * (battle.loadout.staff.manaMul ?? 1);
              const banned = tpl.id === 'shield' ? battle.shieldLocked : !!battle.allowedSpells && tpl.id !== 'heal' && !battle.allowedSpells.includes(tpl.id as SpellId);
              return (
                <div
                  key={tpl.id}
                  className={`spell-slot ${active === tpl.id ? 'spell-active' : ''} ${noMana || cd > 0 || banned ? 'spell-off' : ''} ${noMana ? 'spell-nomana' : ''}`}
                  style={cd > 0 && def ? ({ '--cd': Math.min(1, cd / def.cooldownMs) } as CSSProperties) : undefined}
                >
                  <SpellIcon id={tpl.id} className="spell-icon" />
                  {cd > 0 && <span className="spell-cd">{(cd / 1000).toFixed(1)}</span>}
                  {def && <span className="spell-mana">{Math.round(def.mana * (battle.loadout.staff.manaMul ?? 1))}</span>}
                </div>
              );
            })}
          </div>
        </CameraView>
      </div>

      <div className="battle-enemy" style={{ backgroundImage: `url(${ASSETS.arena(level.arena)})` }}>
        <div className="hud hud-enemy">
          <div className="enemy-name">
            {level.boss ? '👑 ' : ''}
            {level.enemyName} <small>· {online
              ? tr('онлайн', 'online')
              : survivalWave
                ? tr(`волна ${survivalWave}`, `wave ${survivalWave}`)
                : level.id
                  ? tr(`ур. ${level.id}`, `lvl ${level.id}`)
                  : tr('бот', 'bot')}</small>
          </div>
          <Bar value={enemy.hp} max={enemy.maxHp} className="bar-hp bar-enemy" />
          {t < enemy.slowedUntil && <div className="status">❄️ {tr('замедлен', 'slowed')}</div>}
          {t < enemy.stunnedUntil && <div className="status">💫 {tr('оглушён', 'stunned')}</div>}
          {t < enemy.burningUntil && <div className="status status-burn">🔥 {tr('горит', 'burning')}</div>}
          {phase !== 'countdown' && !battle.over && <TraitStatus battle={battle} />}
        </div>
        <div
          ref={enemyRef}
          className={`enemy-portrait ${telegraph ? 'enemy-casting' : ''} ${t < enemy.frozenUntil ? 'enemy-frozen' : ''} ${traitState(battle)?.portrait ?? ''} ${t < enemy.stunnedUntil ? 'enemy-stunned' : ''}`}
        >
          <AssetImg
            src={ASSETS.enemy(level.portraitOf ?? level.id)}
            fallback={level.enemyPortrait}
            className={`enemy-img ${setup.kind === 'ghost' ? 'enemy-ghost' : ''}`}
          />
        </div>
        {online && <OpponentHand />}
        {online && remoteForming && remoteForming !== 'shield' && (
          <div className="telegraph">
            <div className="telegraph-rune">
              <SpellIcon id={remoteForming} />
            </div>
            <span>{tr('Соперник готовит', 'Opponent is preparing')}: {TEMPLATES.find((x) => x.id === remoteForming)?.name}</span>
          </div>
        )}
        {telegraph && (
          <div className="telegraph">
            <div
              className="telegraph-rune"
              style={{ ['--p' as string]: Math.min(1, (t - telegraph.start) / (telegraph.end - telegraph.start)) }}
            >
              <SpellIcon id={telegraph.spell} />
            </div>
            <span>
              {SPELLS[telegraph.spell].name}! {telegraphAdvice(battle, telegraph.spell)}
            </span>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="vfx-canvas" />

      <div className="toasts">
        {toasts.map((x) => (
          <div key={x.id} className={`battle-toast toast-${x.kind}`}>
            {x.text}
            {x.count > 1 && <small className="toast-count"> ×{x.count}</small>}
          </div>
        ))}
      </div>

      {!online && phase !== 'paused' && phase !== 'end' && (
        <DwellButton className="battle-pause-trigger" allowPointer guarded onSelect={() => controlsRef.current?.pause()}>
          ⏸ {tr('Пауза', 'Pause')} <small>Esc</small>
        </DwellButton>
      )}

      {phase === 'paused' && (
        <div className="battle-pause-overlay">
          <div
            ref={pauseDialogRef}
            className="battle-pause-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="battle-pause-title"
            aria-describedby="battle-pause-description"
            onKeyDown={(e) => {
              if (e.key !== 'Tab') return;
              const buttons = e.currentTarget.querySelectorAll('button');
              const first = buttons[0];
              const last = buttons[buttons.length - 1];
              if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
            }}
          >
            <span className="battle-pause-icon" aria-hidden>⏸</span>
            <h1 id="battle-pause-title">{tr('Пауза', 'Paused')}</h1>
            <p id="battle-pause-description">{tr('Бой остановлен. Можно передохнуть.', 'The battle is paused. Take a breather.')}</p>
            <DwellButton className="primary" allowPointer onSelect={() => controlsRef.current?.resume()}>
              ▶ {tr('Продолжить', 'Resume')}
            </DwellButton>
            <DwellButton allowPointer onSelect={() => go('menu')}>
              {tr('Выйти в меню', 'Quit to menu')}
            </DwellButton>
            <small>{tr('Esc — продолжить · Выход завершит бой без награды', 'Esc — resume · Quitting ends the battle with no reward')}</small>
          </div>
        </div>
      )}

      {(phase === 'countdown' || phase === 'resuming') && (
        <div className="overlay-big">
          <div className="countdown">{countdown > 0 ? countdown : tr('Бой!', 'Fight!')}</div>
          <p>
            {phase === 'resuming' ? tr('Приготовься — продолжаем бой', 'Get ready — resuming the battle') : `${level.name}: ${level.enemyName}`}
          </p>
          {phase === 'countdown' && level.trait && (
            <p className="trait-intro">
              {TRAIT_INFO[level.trait.kind].icon} <b>{TRAIT_INFO[level.trait.kind].name}.</b> {TRAIT_INFO[level.trait.kind].intro}
            </p>
          )}
        </div>
      )}
      {phase === 'end' && (
        <div className="overlay-big">
          <div className={`countdown ${battle.winner === 'player' ? 'win' : 'lose'}${survivalWave && battle.winner === 'player' ? ' countdown-long' : ''}`}>
            {battle.winner === 'player' ? survivalWave
                ? tr(`Волна ${survivalWave} пройдена!`, `Wave ${survivalWave} cleared!`)
                : tr('Победа!', 'Victory!')
              : tr('Поражение', 'Defeat')}
          </div>
          {survivalWave > 0 && battle.winner === 'player' && <p>{tr('Следующая волна', 'Next wave')} — {survivalLevel(survivalWave + 1).enemyName}</p>}
        </div>
      )}
    </div>
  );
}
