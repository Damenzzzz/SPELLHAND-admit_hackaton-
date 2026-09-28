import { useEffect, useRef, useState } from 'react';
import { recordSession } from '../../game/progress';
import { sfx } from '../../game/sfx';
import { gestureEngine } from '../../gestures/matcher';
import { TEMPLATE_BY_ID, TEMPLATES } from '../../gestures/templates';
import type { GestureId } from '../../gestures/types';
import { CameraView } from '../../render/CameraView';
import { GhostHand } from '../../render/GhostHand';
import { useGame } from '../../store/gameStore';
import { useGesture } from '../../store/gestureStore';
import { updateSave, useSave } from '../../store/saveStore';
import { CoinBadge } from '../CoinBadge';
import { DwellButton } from '../DwellButton';
import { HintCard } from '../HintCard';
import { SpellIcon } from '../SpellIcon';

const GAME_MS = 60000;
/** Время на жест: от 6 с в начале до 3 с к концу серии. */
const PROMPT_MAX_MS = 6000;
const PROMPT_MIN_MS = 3000;
const HOLD_MATCH_MS = 400;
const MAX_MULT = 10;
const MULT_COLORS = ['#8b93b8', '#5fa8ff', '#5dffa0', '#f2c35b', '#ff9a3d', '#ff4d5e', '#c58bff'];

interface RushState {
  target: GestureId;
  promptStart: number;
  promptMs: number;
  streak: number;
  score: number;
  hits: number;
  prompts: number;
  qualities: Partial<Record<GestureId, number[]>>;
  flash: { text: string; good: boolean } | null;
}

const pick = (prev: GestureId | null): GestureId => {
  const pool = TEMPLATES.map((t) => t.id).filter((g) => g !== prev);
  return pool[Math.floor(Math.random() * pool.length)];
};
const multOf = (streak: number) => Math.min(MAX_MULT, 1 + Math.floor(streak / 2));

/**
 * «Разминка»: показанный жест — за сжимающееся время. Стрик растит множитель ×2…×10,
 * промах или чужой жест обрывают серию. Заодно бенчмарк точности перед кампанией.
 */
export function Rush() {
  const go = useGame((s) => s.go);
  const best = useSave((s) => s.rushBest ?? 0);
  const [phase, setPhase] = useState<'intro' | 'play' | 'done'>('intro');
  const [st, setSt] = useState<RushState | null>(null);
  const [left, setLeft] = useState(GAME_MS);
  const ref = useRef<RushState | null>(null);

  useEffect(() => {
    if (phase !== 'play') return;
    const start = performance.now();
    const now0 = start;
    ref.current = {
      target: pick(null),
      promptStart: now0,
      promptMs: PROMPT_MAX_MS,
      streak: 0,
      score: 0,
      hits: 0,
      prompts: 1,
      qualities: {},
      flash: null,
    };
    setSt({ ...ref.current });
    let holdCounted = 0;

    const next = (s: RushState, now: number) => {
      s.target = pick(s.target);
      s.promptStart = now;
      s.promptMs = Math.max(PROMPT_MIN_MS, PROMPT_MAX_MS - s.streak * 250);
      s.prompts++;
    };

    const hit = (g: GestureId, quality: number) => {
      const s = ref.current!;
      const now = performance.now();
      if (g !== s.target) {
        s.flash = { text: `Это ${TEMPLATE_BY_ID[g].name}! Серия сброшена`, good: false };
        s.streak = 0;
        sfx.reject();
      } else {
        s.streak++;
        s.hits++;
        const mult = multOf(s.streak);
        // быстрее и точнее — больше очков
        const speed = 1 - (now - s.promptStart) / s.promptMs;
        s.score += Math.round(100 * mult * (0.5 + 0.5 * quality) * (0.6 + 0.4 * Math.max(0, speed)));
        (s.qualities[g] ??= []).push(quality);
        s.flash = { text: `+×${mult}`, good: true };
        sfx.cast(g === 'shield' ? 'heal' : g);
      }
      next(s, now);
      setSt({ ...s });
    };

    const off = gestureEngine.on((e) => {
      if (e.type === 'cast' && e.shard === 1 && TEMPLATE_BY_ID[e.gesture].motion.kind !== 'hold') hit(e.gesture, e.quality);
    });
    const unsub = useGesture.subscribe(({ snap }) => {
      if (!snap?.active || TEMPLATE_BY_ID[snap.active].motion.kind !== 'hold') return;
      if (snap.t - snap.activeSince < HOLD_MATCH_MS || holdCounted === snap.activeSince) return;
      holdCounted = snap.activeSince;
      hit(snap.active, snap.quality);
    });

    const id = setInterval(() => {
      const now = performance.now();
      const s = ref.current!;
      setLeft(Math.max(0, GAME_MS - (now - start)));
      if (now - s.promptStart > s.promptMs) {
        s.flash = { text: 'Не успел — серия сброшена', good: false };
        s.streak = 0;
        next(s, now);
        setSt({ ...s });
      }
      if (now - start >= GAME_MS) {
        clearInterval(id);
        off();
        unsub();
        const coins = Math.round(s.score / 60);
        const perSpell = Object.fromEntries(
          Object.entries(s.qualities).map(([g, q]) => [g, { count: q!.length, avgQuality: q!.reduce((a, b) => a + b, 0) / q!.length }]),
        );
        recordSession({ mode: 'rush', accuracy: s.hits / s.prompts, perSpell, errorCounts: {} });
        updateSave((sv) => ({ coins: sv.coins + coins, rushBest: Math.max(sv.rushBest ?? 0, s.score) }));
        sfx.victory();
        setSt({ ...s, flash: { text: `+${coins} 🪙`, good: true } });
        setPhase('done');
      }
    }, 100);

    return () => {
      clearInterval(id);
      off();
      unsub();
    };
  }, [phase]);

  const tpl = st ? TEMPLATE_BY_ID[st.target] : null;
  const mult = st ? multOf(st.streak) : 1;
  const promptLeft = st ? Math.max(0, 1 - (performance.now() - st.promptStart) / st.promptMs) : 0;

  return (
    <div className="split-screen">
      <CameraView className="split-camera" staff>
        {phase === 'play' && <HintCard compact />}
        {st?.flash && phase === 'play' && (
          <div key={st.prompts} className={`toast ${st.flash.good ? '' : 'toast-bad-inline'}`}>
            {st.flash.text}
          </div>
        )}
      </CameraView>
      <aside className="side-panel academy-panel">
        <CoinBadge />
        <h2 className="screen-title">⚡ Разминка</h2>
        {phase === 'intro' && (
          <>
            <p>60 секунд: показывай жест, который загадан, пока не кончилось время. Серия растит множитель до ×10.</p>
            <p className="muted">Рекорд: {best}</p>
            <DwellButton className="btn-primary" onSelect={() => setPhase('play')}>
              ▶ Старт
            </DwellButton>
          </>
        )}
        {phase === 'play' && st && tpl && (
          <>
            <div className="rush-target">
              <SpellIcon id={tpl.id} className="rush-icon" />
              <b>{tpl.name}</b>
            </div>
            <div className="rush-timer">
              <div className="rush-timer-fill" style={{ transform: `scaleX(${promptLeft})` }} />
            </div>
            <GhostHand gesture={tpl.id} size={130} />
            <div className="stat-row">
              <div className="stat">
                <b style={{ color: MULT_COLORS[Math.min(MULT_COLORS.length - 1, Math.floor((mult - 1) / 1.5))] }}>
                  ×{mult}
                </b>
                <span>множитель</span>
              </div>
              <div className="stat">
                <b>{st.score}</b>
                <span>очки</span>
              </div>
              <div className="stat">
                <b>{Math.ceil(left / 1000)}</b>
                <span>секунд</span>
              </div>
            </div>
          </>
        )}
        {phase === 'done' && st && (
          <>
            <p className="found">
              {st.score} очков · {st.hits}/{st.prompts} жестов
            </p>
            <p className="muted">
              {st.score >= best ? '🏆 Новый рекорд!' : `Рекорд: ${best}`} · {st.flash?.text}
            </p>
            <DwellButton className="btn-primary" onSelect={() => setPhase('intro')}>
              🔁 Ещё раз
            </DwellButton>
          </>
        )}
        <div className="panel-buttons">
          <DwellButton onSelect={() => go('menu')}>← В меню</DwellButton>
        </div>
      </aside>
    </div>
  );
}
