import type { GestureSnapshot } from '../gestures/matcher';
import { useGesture } from '../store/gestureStore';
import type { HandFeatures } from '../vision/features';
import { getSettings } from '../store/settingsStore';
import { DEFAULT_SETTINGS, pointerFromTip } from '../game/settings';

/**
 * Dwell-клик: курсор = кончик указательного пальца; навёл на кнопку и держишь
 * DWELL_MS — нажатие. Один rAF-цикл на все кнопки, прогресс пишется в CSS-переменную
 * --dwell (без ре-рендеров React).
 */
export const DWELL_MS = DEFAULT_SETTINGS.dwellMs;
const COOLDOWN_MS = 700;

interface Target {
  onSelect: () => void;
  /**
   * Кнопка посреди боя (пауза, пропуск обучения): рука, которая колдует рядом, не должна её
   * нажать. Засчитывается только явный указующий жест и только без взведённого заклинания.
   */
  guarded?: boolean;
}

/** Указательный выпрямлен, остальные согнуты, и никакое заклинание не взведено (щит, заряд…). */
export function guardedPressAllowed(snap: Pick<GestureSnapshot, 'active'> | null, h: Pick<HandFeatures, 'extension'> | null) {
  if (!snap || !h || snap.active) return false;
  const e = h.extension;
  return e.index >= 0.6 && Math.max(e.middle, e.ring, e.pinky) <= 0.45;
}

const targets = new Map<HTMLElement, Target>();
let cursorEl: HTMLDivElement | null = null;
let raf = 0;
let hovered: HTMLElement | null = null;
let hoverSince = 0;
let cooldownUntil = 0;

function ensureCursor() {
  if (cursorEl) return cursorEl;
  cursorEl = document.createElement('div');
  cursorEl.className = 'dwell-cursor';
  document.body.appendChild(cursorEl);
  return cursorEl;
}

function setHovered(el: HTMLElement | null, now: number) {
  if (el === hovered) return;
  cursorEl?.style.setProperty('--dwell', '0');
  cursorEl?.classList.toggle('dwell-cursor-on', !!el);
  if (hovered) {
    hovered.classList.remove('dwell-hover');
    hovered.style.setProperty('--dwell', '0');
  }
  hovered = el;
  hoverSince = now;
  el?.classList.add('dwell-hover');
}

/** Рука-курсор: та, у которой указательный выпрямлен сильнее (или выбранная в настройках). */
function pointerHand(): HandFeatures | null {
  const settings = getSettings();
  if (settings.menuControl === 'pointer') return null;
  const snap = useGesture.getState().snap;
  if (!snap?.hands.length) return null;
  const hands = settings.pointerHand === 'auto' ? snap.hands : snap.hands.filter((h) => h.isRealRight === (settings.pointerHand === 'right'));
  if (!hands.length) return null;
  return hands.reduce((a, b) => (b.extension.index > a.extension.index ? b : a));
}

/** Экранная позиция указательного пальца (с учётом зеркала), или null. */
export function pointerPosition(): { x: number; y: number } | null {
  const h = pointerHand();
  if (!h) return null;
  const settings = getSettings();
  const tip = h.raw[8];
  const p = pointerFromTip(tip.x, tip.y, settings.pointerGain);
  return {
    x: p.x * innerWidth,
    y: p.y * innerHeight,
  };
}

function tick() {
  raf = requestAnimationFrame(tick);
  const now = performance.now();
  const cursor = ensureCursor();
  const p = pointerPosition();

  if (!p) {
    cursor.style.opacity = '0';
    setHovered(null, now);
    return;
  }
  cursor.style.opacity = '1';
  cursor.style.transform = `translate(${p.x}px, ${p.y}px)`;

  let hit: HTMLElement | null = null;
  const front = document.elementFromPoint(p.x, p.y);
  for (const el of targets.keys()) {
    const r = el.getBoundingClientRect();
    const pad = 8;
    if (front && el.contains(front) && p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad) {
      hit = el;
      break;
    }
  }

  if (now < cooldownUntil) {
    setHovered(null, now);
    return;
  }
  setHovered(hit, now);
  if (!hovered) return;
  if (targets.get(hovered)?.guarded && !guardedPressAllowed(useGesture.getState().snap, pointerHand())) {
    // кулак щита или ладонь заряда над кнопкой — прогресс не копится
    hoverSince = now;
    hovered.style.setProperty('--dwell', '0');
    return;
  }

  const progress = Math.min(1, (now - hoverSince) / getSettings().dwellMs);
  hovered.style.setProperty('--dwell', progress.toFixed(3));
  // кольцо курсора повторяет прогресс удержания — видно, даже если рука закрывает кнопку
  cursor.style.setProperty('--dwell', progress.toFixed(3));
  if (progress >= 1) {
    const t = targets.get(hovered);
    cooldownUntil = now + COOLDOWN_MS;
    setHovered(null, now);
    t?.onSelect();
  }
}

/** A mouse click cancels a simultaneous hand hover instead of selecting twice. */
export function cancelDwell() {
  setHovered(null, performance.now());
  cooldownUntil = performance.now() + COOLDOWN_MS;
}

export function registerDwell(el: HTMLElement, target: Target): () => void {
  targets.set(el, target);
  if (!raf) raf = requestAnimationFrame(tick);
  return () => {
    targets.delete(el);
    if (hovered === el) setHovered(null, performance.now());
    if (targets.size === 0) {
      cancelAnimationFrame(raf);
      raf = 0;
      if (cursorEl) cursorEl.style.opacity = '0';
    }
  };
}
