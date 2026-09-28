import { ASSETS } from '../game/data/assets';
import type { BattleResult } from '../game/stats';
import { TEMPLATE_BY_ID } from '../gestures/templates';
import type { GestureId } from '../gestures/types';

const GAME_URL = 'https://spellhand-ruddy.vercel.app';
const W = 1080;
const H = 1350;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** Карточка результата 1080×1350 (формат сторис/поста) с QR на игру. */
export async function renderShareCard(r: BattleResult): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const [bg, logo, QR] = await Promise.all([
    loadImage(ASSETS.menuBg),
    loadImage(ASSETS.logo),
    import('qrcode'),
  ]);

  // фон — арт меню, затемнённый
  ctx.fillStyle = '#0b1026';
  ctx.fillRect(0, 0, W, H);
  if (bg) ctx.drawImage(bg, (W - bg.width * (H / bg.height)) / 2, 0, bg.width * (H / bg.height), H);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(11,16,38,0.55)');
  shade.addColorStop(1, 'rgba(11,16,38,0.92)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  if (logo) ctx.drawImage(logo, W / 2 - 360, 60, 720, 405);

  ctx.textAlign = 'center';
  ctx.fillStyle = r.won ? '#5dffa0' : '#ff5a6a';
  ctx.font = '800 96px system-ui, sans-serif';
  ctx.fillText(r.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', W / 2, 560);
  ctx.fillStyle = '#e8ecff';
  ctx.font = '500 40px system-ui, sans-serif';
  ctx.fillText(r.mode === 'online' ? `против ${r.opponent}` : r.opponent, W / 2, 620);

  // главная цифра — точность жестов
  ctx.fillStyle = '#f2c35b';
  ctx.font = '900 220px system-ui, sans-serif';
  ctx.fillText(`${Math.round(r.accuracy * 100)}%`, W / 2, 860);
  ctx.fillStyle = '#8b93b8';
  ctx.font = '500 40px system-ui, sans-serif';
  ctx.fillText('точность жестов', W / 2, 915);

  const best = (Object.entries(r.perSpell) as [GestureId, { count: number; avgQuality: number }][]).sort(
    (a, b) => b[1].avgQuality - a[1].avgQuality,
  )[0];
  ctx.fillStyle = '#e8ecff';
  ctx.font = '600 44px system-ui, sans-serif';
  if (best) {
    ctx.fillText(
      `лучший жест: ${TEMPLATE_BY_ID[best[0]].icon} ${TEMPLATE_BY_ID[best[0]].name} — ${Math.round(best[1].avgQuality * 100)}%`,
      W / 2,
      1000,
    );
  }
  if (r.dailyScore !== undefined) ctx.fillText(`испытание дня: ${r.dailyScore} очков`, W / 2, 1060);

  // QR на игру
  const qr = document.createElement('canvas');
  await QR.toCanvas(qr, GAME_URL, { width: 220, margin: 1, color: { dark: '#0b1026', light: '#ffffff' } });
  ctx.drawImage(qr, 80, H - 300);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8ecff';
  ctx.font = '700 46px system-ui, sans-serif';
  ctx.fillText('Колдуй руками —', 340, H - 200);
  ctx.fillText('сможешь точнее?', 340, H - 140);
  ctx.fillStyle = '#8b93b8';
  ctx.font = '400 30px system-ui, sans-serif';
  ctx.fillText(GAME_URL.replace('https://', ''), 340, H - 90);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

/** Системное «Поделиться» (телефон) или скачивание PNG. */
export async function shareResult(r: BattleResult): Promise<'shared' | 'downloaded'> {
  const blob = await renderShareCard(r);
  const file = new File([blob], 'spellhand.png', { type: 'image/png' });
  // системный шеринг — только на телефонах; на десктопе просто скачиваем PNG
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'SPELLHAND', text: `Точность ${Math.round(r.accuracy * 100)}% — ${GAME_URL}` });
      return 'shared';
    } catch {
      // отмена — падаем на скачивание
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'spellhand-result.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
