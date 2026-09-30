import type { SpellId } from '../gestures/types';
import { getSettings } from '../store/settingsStore';

/**
 * Процедурные звуки на Web Audio — без аудиофайлов и лицензий.
 * Браузер разрешает звук только после клика/клавиши: unlockAudio() вешается на первый ввод.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = getSettings().sfxVolume / 100;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      return null;
    }
  }
  return ctx.state === 'running' ? ctx : null;
}

export function audioReady() {
  return ctx?.state === 'running';
}

/** Apply the slider to sounds already playing as well as future casts. */
export function applySfxVolume() {
  if (master && ctx) master.gain.setTargetAtTime(getSettings().sfxVolume / 100, ctx.currentTime, 0.015);
}

export function unlockAudio() {
  ac();
  return ctx?.resume();
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', peak = 0.3, delay = 0, slideTo?: number) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, peak, 0.01, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hiss(
  dur: number,
  filter: BiquadFilterType,
  from: number,
  to: number,
  peak = 0.4,
  delay = 0,
  attack = 0.02,
) {
  const c = ac();
  if (!c || !master || !noise) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  env(g, t, peak, attack, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + attack + 0.05);
}

export const sfx = {
  cast(spell: SpellId) {
    switch (spell) {
      case 'fireball':
        hiss(0.45, 'bandpass', 300, 1600, 0.5);
        tone(90, 0.3, 'sine', 0.35, 0, 50);
        break;
      case 'ice':
        tone(2200, 0.15, 'sine', 0.2);
        tone(3100, 0.12, 'sine', 0.12, 0.03);
        hiss(0.12, 'highpass', 5000, 7000, 0.15);
        break;
      case 'lightning':
        hiss(0.3, 'highpass', 2500, 800, 0.6, 0, 0.003);
        tone(60, 0.25, 'sawtooth', 0.25);
        break;
      case 'wind':
        hiss(0.7, 'lowpass', 300, 1400, 0.45, 0, 0.15);
        break;
      case 'heal':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'sine', 0.15, i * 0.08));
        break;
    }
  },
  enemyTelegraph() {
    tone(180, 0.5, 'triangle', 0.12, 0, 420);
  },
  hit() {
    hiss(0.18, 'lowpass', 900, 200, 0.5, 0, 0.005);
    tone(70, 0.2, 'sine', 0.4, 0, 40);
  },
  block() {
    tone(220, 0.15, 'triangle', 0.3, 0, 160);
    tone(1300, 0.1, 'square', 0.06);
  },
  shieldUp() {
    tone(440, 0.18, 'sine', 0.12, 0, 700);
  },
  shieldBreak() {
    hiss(0.4, 'highpass', 3000, 6000, 0.4, 0, 0.003);
    for (let i = 0; i < 7; i++) tone(2000 + Math.random() * 3500, 0.25, 'sine', 0.08, i * 0.025);
  },
  reject() {
    tone(140, 0.18, 'square', 0.08);
  },
  select() {
    tone(880, 0.08, 'sine', 0.15);
    tone(1320, 0.1, 'sine', 0.12, 0.05);
  },
  victory() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.4, 'triangle', 0.18, i * 0.11));
  },
  defeat() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, 'triangle', 0.18, i * 0.18));
  },
};
