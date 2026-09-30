import { useSave } from '../store/saveStore';
import { getSettings } from '../store/settingsStore';

/** CC0: Town Theme — cynicmusic; Battle Theme — wolfgang (OpenGameArt). */
export type Track = 'menu' | 'battle';
const SRC: Record<Track, string> = {
  menu: `${import.meta.env.BASE_URL}assets/audio/menu.mp3`,
  battle: `${import.meta.env.BASE_URL}assets/audio/battle.mp3`,
};
const FADE_MS = 900;
const players = new Map<Track, HTMLAudioElement>();
const fades = new Map<HTMLAudioElement, number>();
let current: Track | null = null;
let requested: Track | null = null;
let generation = 0;
let removeRetry: (() => void) | null = null;

function player(t: Track) {
  let a = players.get(t);
  if (!a) {
    a = new Audio(SRC[t]);
    a.loop = true;
    a.preload = 'none';
    a.volume = 0;
    players.set(t, a);
  }
  return a;
}

function cancelFade(a: HTMLAudioElement) {
  const id = fades.get(a);
  if (id !== undefined) cancelAnimationFrame(id);
  fades.delete(a);
}

function fade(a: HTMLAudioElement, to: number, then?: () => void) {
  cancelFade(a);
  const from = a.volume;
  const start = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / FADE_MS);
    a.volume = from + (to - from) * k;
    if (k < 1) fades.set(a, requestAnimationFrame(step));
    else { fades.delete(a); then?.(); }
  };
  fades.set(a, requestAnimationFrame(step));
}

/** Latest screen and volume win, even when a previous play/fade is still pending. */
export function playMusic(t: Track | null) {
  requested = t;
  removeRetry?.();
  removeRetry = null;
  const volume = getSettings().musicVolume / 100;
  const target = (useSave.getState().musicOn ?? true) && volume > 0 ? t : null;
  const version = ++generation;
  for (const [track, audio] of players) {
    if (track !== target) {
      if (!target) { cancelFade(audio); audio.volume = 0; audio.pause(); }
      else fade(audio, 0, () => audio.pause());
    }
  }
  const sameTrack = current === target;
  current = target;
  if (!target) return;
  const a = player(target);
  cancelFade(a);
  if (sameTrack && !a.paused) { a.volume = volume; return; }
  void a.play().then(
    () => { if (version === generation) fade(a, volume); },
    () => {
      if (version !== generation) return;
      current = null;
      const retry = () => playMusic(requested);
      removeRetry = () => {
        removeEventListener('pointerdown', retry);
        removeEventListener('keydown', retry);
      };
      addEventListener('pointerdown', retry, { once: true });
      addEventListener('keydown', retry, { once: true });
    },
  );
}

export function setMusicOn(on: boolean, track: Track | null) {
  useSave.setState({ musicOn: on });
  playMusic(track);
}
