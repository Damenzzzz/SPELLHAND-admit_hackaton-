import { useGesture } from '../store/gestureStore';
import { useVision } from '../store/visionStore';
import { coverBox } from './HandOverlay';
import type { VfxLayout } from './SpellVFX';

/** Точки VFX боя: рука игрока на видео (зеркально), центр портрета врага, радиус щита. */
export function computeBattleLayout(
  rootEl: HTMLElement | null,
  camEl: HTMLElement | null,
  enemyEl: HTMLElement | null,
): VfxLayout | null {
  const root = rootEl?.getBoundingClientRect();
  const cam = camEl?.getBoundingClientRect();
  const enemy = enemyEl?.getBoundingClientRect();
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
}
