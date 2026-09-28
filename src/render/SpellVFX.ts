import type { SpellId } from '../gestures/types';
import type { Battle, BattleEvent, Projectile, Side } from '../game/combat';
import { ASSETS } from '../game/data/assets';
import { SHIELDS } from '../game/data/items';
import { GESTURE_COLOR } from './colors';

export interface Point {
  x: number;
  y: number;
}

/** Где на экране находятся участники боя (в координатах VFX-канваса). */
export interface VfxLayout {
  /** Центр ладони игрока (или точка по умолчанию на его стороне). */
  playerHand: Point;
  /** Центр стороны игрока — там висит щит. */
  playerCenter: Point;
  enemy: Point;
  enemyRadius: number;
  shieldRadius: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'dot' | 'shard' | 'text';
  rot?: number;
  text?: string;
}

interface Bolt {
  from: Point;
  to: Point;
  until: number;
  seed: number;
}

/** Процедурные трещины щита: лучи из центра, ломаные линии. */
function makeCracks(count: number): Point[][] {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.5;
    const pts: Point[] = [{ x: Math.cos(a) * 0.15, y: Math.sin(a) * 0.15 }];
    let ang = a;
    let r = 0.15;
    while (r < 1) {
      r += 0.12 + rnd() * 0.12;
      ang += (rnd() - 0.5) * 0.6;
      pts.push({ x: Math.cos(ang) * Math.min(r, 1), y: Math.sin(ang) * Math.min(r, 1) });
    }
    return pts;
  });
}
const CRACKS = makeCracks(14);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** VFX боя на одном 2D-канвасе: снаряды, частицы, щиты с трещинами, молнии. */
export class SpellVfx {
  private particles: Particle[] = [];
  private bolts: Bolt[] = [];
  private origins = new Map<number, Point>();
  private flashes: { side: Side; until: number; color: string }[] = [];
  private shake = 0;

  /** Текстуры рунических кругов щитов (Nano Banana, чёрный фон → аддитивно). */
  private runes = new Map<string, HTMLImageElement>();

  constructor(private ctx: CanvasRenderingContext2D) {
    for (const sh of SHIELDS) {
      const img = new Image();
      img.src = ASSETS.rune(sh.id);
      this.runes.set(sh.id, img);
    }
  }

  /** Всплывающее число урона/лечения. */
  floatText(p: Point, text: string, color: string) {
    this.particles.push({ x: p.x + (Math.random() - 0.5) * 40, y: p.y - 30, vx: 0, vy: -70, life: 0, max: 1.1, size: 26, color, kind: 'text', text });
  }

  private burst(p: Point, color: string, n: number, speed = 220, kind: Particle['kind'] = 'dot', size = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        max: 0.4 + Math.random() * 0.5,
        size: size * (0.5 + Math.random()),
        color,
        kind,
        rot: Math.random() * Math.PI,
      });
    }
  }

  onEvent(e: BattleEvent, layout: VfxLayout, now: number) {
    const sidePos = (s: Side) => (s === 'player' ? layout.playerCenter : layout.enemy);
    switch (e.type) {
      case 'cast':
        if (e.projectile) {
          this.origins.set(e.projectile.id, e.side === 'player' ? { ...layout.playerHand } : { ...layout.enemy });
        }
        if (e.spell === 'heal') this.burst(layout.playerCenter, GESTURE_COLOR.heal, 30, 120);
        break;
      case 'hit': {
        const target = sidePos(e.target);
        const color = GESTURE_COLOR[e.spell];
        this.burst(target, color, e.blocked ? 14 : 26, e.blocked ? 160 : 260);
        if (e.hpDamage > 0) this.floatText(target, `-${e.hpDamage}`, e.target === 'player' ? '#ff5a6a' : '#ffffff');
        else if (e.blocked) this.floatText(target, 'блок', '#bcd6ff');
        if (e.blocked) this.flashes.push({ side: e.target, until: now + 180, color: '#ffffff' });
        if (e.hpDamage > 0 && e.target === 'player') this.shake = Math.min(14, 4 + e.hpDamage / 3);
        break;
      }
      case 'shieldBreak': {
        const c = sidePos(e.side);
        const r = e.side === 'player' ? layout.shieldRadius : layout.enemyRadius * 1.25;
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.push({
            x: c.x + Math.cos(a) * r * Math.random(),
            y: c.y + Math.sin(a) * r * Math.random(),
            vx: Math.cos(a) * (150 + Math.random() * 250),
            vy: Math.sin(a) * (150 + Math.random() * 250) + 100,
            life: 0,
            max: 0.8 + Math.random() * 0.5,
            size: 8 + Math.random() * 12,
            color: '#bcd6ff',
            kind: 'shard',
            rot: Math.random() * Math.PI,
          });
        }
        this.shake = 10;
        break;
      }
      case 'heal':
        if (Math.random() < 0.3) {
          const c = sidePos(e.side);
          this.particles.push({
            x: c.x + (Math.random() - 0.5) * 160,
            y: c.y + 60,
            vx: 0,
            vy: -80 - Math.random() * 60,
            life: 0,
            max: 1,
            size: 5,
            color: GESTURE_COLOR.heal,
            kind: 'dot',
          });
        }
        break;
      case 'reflect':
        this.flashes.push({ side: e.side, until: now + 250, color: '#f2c35b' });
        break;
    }
  }

  private projectilePos(p: Projectile, battle: Battle, layout: VfxLayout): Point | null {
    if (battle.t < p.spawnT) return null;
    const from = this.origins.get(p.id) ?? (p.from === 'player' ? layout.playerHand : layout.enemy);
    const to = p.to === 'enemy' ? layout.enemy : layout.playerCenter;
    const k = Math.min(1, (battle.t - p.spawnT) / Math.max(1, p.hitT - p.spawnT));
    const arc = p.spell === 'fireball' ? -80 : p.spell === 'ice' ? -30 : 0;
    return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) + arc * Math.sin(Math.PI * k) };
  }

  private drawProjectile(spell: SpellId, pos: Point, dir: number) {
    const ctx = this.ctx;
    const color = GESTURE_COLOR[spell];
    if (spell === 'fireball') {
      const g = ctx.createRadialGradient(pos.x, pos.y, 2, pos.x, pos.y, 30);
      g.addColorStop(0, '#fff6c0');
      g.addColorStop(0.4, color);
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2);
      ctx.fill();
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: -dir * 60 + (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 60,
        life: 0,
        max: 0.35,
        size: 6,
        color,
        kind: 'dot',
      });
    } else if (spell === 'ice') {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(dir > 0 ? 0 : Math.PI);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-10, -7);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (spell === 'wind') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(pos.x - dir * i * 18, pos.y, 18 + i * 8, -0.6, 0.6 + i * 0.3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawBolt(b: Bolt) {
    const ctx = this.ctx;
    let s = b.seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    ctx.strokeStyle = '#fffbd0';
    ctx.shadowColor = GESTURE_COLOR.lightning;
    ctx.shadowBlur = 24;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(b.from.x, b.from.y);
    const steps = 9;
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      ctx.lineTo(lerp(b.from.x, b.to.x, k) + (rnd() - 0.5) * 60, lerp(b.from.y, b.to.y, k) + (rnd() - 0.5) * 60);
    }
    ctx.lineTo(b.to.x, b.to.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  private drawShield(
    c: Point,
    r: number,
    durabilityFrac: number,
    color: string,
    flash: string | null,
    time: number,
    rune?: HTMLImageElement,
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(c.x, c.y);
    if (rune?.complete && rune.naturalWidth) {
      // текстура руны (прозрачная, альфа из яркости) медленно вращается
      ctx.save();
      ctx.globalAlpha = 0.75 + 0.15 * Math.sin(time / 200) + (flash ? 0.3 : 0);
      ctx.rotate(-time / 2500);
      ctx.drawImage(rune, -r * 1.08, -r * 1.08, r * 2.16, r * 2.16);
      ctx.restore();
    }
    // рунический круг
    ctx.globalAlpha = 0.18 + 0.06 * Math.sin(time / 200);
    ctx.fillStyle = flash ?? color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = flash ?? color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.rotate(time / 1500);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    // руны: короткие радиальные засечки между кольцами
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
      ctx.lineTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93);
      ctx.stroke();
    }
    ctx.rotate(-time / 1500);
    // трещины по мере падения прочности
    const cracks = Math.floor((1 - durabilityFrac) * CRACKS.length);
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ffffff';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < cracks; i++) {
      const crack = CRACKS[i];
      ctx.beginPath();
      ctx.moveTo(crack[0].x * r, crack[0].y * r);
      crack.forEach((p) => ctx.lineTo(p.x * r, p.y * r));
      ctx.stroke();
    }
    ctx.restore();
  }

  frame(battle: Battle, layout: VfxLayout, dt: number, now: number, charge: { active: boolean; value: number }) {
    const ctx = this.ctx;
    const { width, height } = ctx.canvas;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake = Math.max(0, this.shake - dt * 0.04);
    }

    this.flashes = this.flashes.filter((f) => f.until > now);
    const flashFor = (s: Side) => this.flashes.find((f) => f.side === s)?.color ?? null;

    // щиты
    const ps = battle.player.shield;
    if (ps.up) {
      this.drawShield(
        layout.playerCenter,
        layout.shieldRadius,
        ps.durability / ps.max,
        battle.loadout.shield.color,
        flashFor('player'),
        now,
        this.runes.get(battle.loadout.shield.id),
      );
    }
    const es = battle.enemy.shield;
    if (es.up) {
      this.drawShield(layout.enemy, layout.enemyRadius * 1.25, es.durability / es.max, '#ff7fd0', flashFor('enemy'), now);
    }

    // заряд огненного шара в ладони
    if (charge.active) {
      const r = 14 + 26 * charge.value + Math.sin(now / 60) * 3;
      const g = ctx.createRadialGradient(layout.playerHand.x, layout.playerHand.y, 1, layout.playerHand.x, layout.playerHand.y, r);
      g.addColorStop(0, '#fff6c0');
      g.addColorStop(0.5, GESTURE_COLOR.fireball);
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(layout.playerHand.x, layout.playerHand.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // снаряды
    ctx.globalCompositeOperation = 'lighter';
    for (const p of battle.projectiles) {
      const pos = this.projectilePos(p, battle, layout);
      if (!pos) continue;
      if (p.spell === 'lightning') {
        if (!this.bolts.some((b) => b.seed === p.id * 7919)) {
          const from = this.origins.get(p.id) ?? layout.playerHand;
          const to = p.to === 'enemy' ? layout.enemy : layout.playerCenter;
          this.bolts.push({ from, to, until: now + 220, seed: p.id * 7919 });
        }
        continue;
      }
      this.drawProjectile(p.spell, pos, p.to === 'enemy' ? 1 : -1);
    }
    this.bolts = this.bolts.filter((b) => b.until > now);
    this.bolts.forEach((b) => this.drawBolt(b));

    // частицы
    const s = dt / 1000;
    this.particles = this.particles.filter((p) => (p.life += s) < p.max);
    for (const p of this.particles) {
      p.x += p.vx * s;
      p.y += p.vy * s;
      if (p.kind === 'shard') p.vy += 600 * s;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'text') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = `800 ${p.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(p.text ?? '', p.x, p.y);
        ctx.fillText(p.text ?? '', p.x, p.y);
        ctx.globalCompositeOperation = 'lighter';
      } else if (p.kind === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot ?? 0) + p.life * 6);
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.5, p.size * 0.4);
        ctx.lineTo(-p.size * 0.4, p.size * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const id of this.origins.keys()) {
      if (!battle.projectiles.some((p) => p.id === id)) this.origins.delete(id);
    }
  }
}
