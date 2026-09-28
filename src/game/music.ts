import { useSave } from '../store/saveStore';

/**
 * Фоновая музыка (CC0, OpenGameArt): «Town Theme» — cynicmusic (меню),
 * «Battle Theme» — wolfgang (бой). Потоковое <audio> с preload="none": грузится только
 * когда начинает играть и не мешает загрузке игры. Смена трека — плавным кроссфейдом.
 */
export type Track = 'menu' | 'battle';

const SRC: Record<Track, string> = {
  menu: `${import.meta.env.BASE_URL}assets/audio/menu.mp3`,
  battle: `${import.meta.env.BASE_URL}assets/audio/battle.mp3`,
};
const VOLUME = 0.28;
const FADE_MS = 900;

const players = new Map<Track, HTMLAudioElement>();
let current: Track | null = null;

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

function fade(a: HTMLAudioElement, to: number, then?: () => void) {
  const from = a.volume;
  const start = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / FADE_MS);
    a.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step);
    else then?.();
  };
  requestAnimationFrame(step);
}

/** Играть трек (или тишину); если браузер ещё не разрешил звук — повторим после первого клика. */
export function playMusic(t: Track | null) {
  const on = useSave.getState().musicOn ?? true;
  const target = on ? t : null;
  if (target === current) return;
  if (current) {
    const old = player(current);
    fade(old, 0, () => old.pause());
  }
  current = target;
  if (!target) return;
  const a = player(target);
  a.play().then(
    () => fade(a, VOLUME),
    () => {
      // автоплей запрещён до первого ввода — ждём клика/клавиши
      current = null;
      const retry = () => playMusic(t);
      addEventListener('pointerdown', retry, { once: true });
      addEventListener('keydown', retry, { once: true });
    },
  );
}

export function setMusicOn(on: boolean, track: Track | null) {
  useSave.setState({ musicOn: on });
  if (!on) playMusic(null);
  else {
    current = null;
    playMusic(track);
  }
}
