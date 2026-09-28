import { useGesture } from '../store/gestureStore';

/**
 * Dwell-клик: курсор = кончик указательного пальца; навёл на кнопку и держишь
 * DWELL_MS — нажатие. Один rAF-цикл на все кнопки, прогресс пишется в CSS-переменную
 * --dwell (без ре-рендеров React).
 */
export const DWELL_MS = 1200;
const COOLDOWN_MS = 700;
/** Усиление: чтобы дотянуться до краёв экрана, не выходя рукой из кадра. */
const GAIN = 1.4;

interface Target {
  onSelect: () => void;
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
  if (hovered) {
    hovered.classList.remove('dwell-hover');
    hovered.style.setProperty('--dwell', '0');
  }
  hovered = el;
  hoverSince = now;
  el?.classList.add('dwell-hover');
}

/** Экранная позиция указательного пальца (с учётом зеркала), или null. */
export function pointerPosition(): { x: number; y: number } | null {
  const snap = useGesture.getState().snap;
  if (!snap?.hands.length) return null;
  // указывает та рука, у которой указательный выпрямлен сильнее
  const h = snap.hands.reduce((a, b) => (b.extension.index > a.extension.index ? b : a));
  const tip = h.raw[8];
  const u = 0.5 + (1 - tip.x - 0.5) * GAIN;
  const v = 0.5 + (tip.y - 0.5) * GAIN;
  return {
    x: Math.max(0, Math.min(1, u)) * innerWidth,
    y: Math.max(0, Math.min(1, v)) * innerHeight,
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
  for (const el of targets.keys()) {
    const r = el.getBoundingClientRect();
    const pad = 8;
    if (p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad) {
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

  const progress = Math.min(1, (now - hoverSince) / DWELL_MS);
  hovered.style.setProperty('--dwell', progress.toFixed(3));
  if (progress >= 1) {
    const t = targets.get(hovered);
    cooldownUntil = now + COOLDOWN_MS;
    setHovered(null, now);
    t?.onSelect();
  }
}

export function registerDwell(el: HTMLElement, target: Target): () => void {
  targets.set(el, target);
  if (!raf) raf = requestAnimationFrame(tick);
  return () => {
    targets.delete(el);
    if (hovered === el) hovered = null;
    if (targets.size === 0) {
      cancelAnimationFrame(raf);
      raf = 0;
      if (cursorEl) cursorEl.style.opacity = '0';
    }
  };
}
